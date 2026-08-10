import crypto from "node:crypto";
import Database from "better-sqlite3";
import { env } from "../config/env.js";
import { normalizeOrderMappingError, orderMappingError } from "./orderMappingError.js";
import { parseOrderMappingCsv } from "./orderMappingCsv.js";
import { fetchOrderMappingOrders } from "./orderMappingShopify.js";
import {
  fetchOrderMappingShiprocketShipments,
  fetchOrderMappingShiprocketTracking,
} from "./orderMappingShiprocket.js";
import {
  applyShipmentUpdate,
  clearManualShipmentStatus,
  commitCsvImport,
  completeSyncRun,
  createSyncRun,
  createNetworkLog,
  getLatestShopifySyncWindow,
  getOrderMappingDetails,
  listActionLogs,
  listEligibleShipmentsForRefresh,
  listOrderMappings,
  listNetworkLogs,
  logMigrationException,
  previewCsvImport,
  setShipmentSyncError,
  setManualShipmentStatus,
  upsertShopifyOrders,
  withSyncLock,
} from "./orderMappingRepository.js";
import {
  confirmShiprocketPassbookImport,
  getShiprocketPassbookImportDetails,
  listShiprocketPassbookImports,
  previewShiprocketPassbookImport,
} from "./orderExpenseImportService.js";
import { matchOrderMappingShipment } from "./orderMappingMatcher.js";
import { normalizeOrderMappingStatus, normalizeShiprocketStatus } from "./orderMappingStatus.js";

function safeRange(range) {
  if (range?.start && range?.end) {
    return range;
  }
  return getLatestShopifySyncWindow();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function refreshOrderMappingShiprocketCore({ shipmentId = null, force = false } = {}) {
  const eligibleShipments = await listEligibleShipmentsForRefresh({ shipmentId, force });
  if (!eligibleShipments.length) {
    return {
      processed: 0,
      updated: 0,
      skippedTerminal: 0,
      failed: 0,
      unmatched: 0,
      configured: true,
      pagesFetched: 0,
    };
  }

  const earliest = eligibleShipments
    .map((shipment) => new Date(shipment.order_date))
    .filter((value) => !Number.isNaN(value.getTime()))
    .sort((left, right) => left.getTime() - right.getTime())[0];
  const provider = await fetchOrderMappingShiprocketShipments({
    start: (earliest || new Date()).toISOString().slice(0, 10),
    end: todayIso(),
  });

  if (!provider.configured) {
    return {
      processed: 0,
      updated: 0,
      skippedTerminal: 0,
      failed: 0,
      unmatched: 0,
      configured: false,
      pagesFetched: 0,
    };
  }

  const providerRows = provider.shipments.map((row) => ({
    ...row,
    shiprocket_response_id: row.shiprocketResponseId,
    shiprocket_order_reference: row.shiprocketOrderReference,
    shiprocket_channel_reference: row.shiprocketChannelReference,
    shopify_order_id: row.shiprocketOrderReference,
    shopify_order_name: row.shiprocketChannelReference,
    shopify_order_number: row.shiprocketChannelReference,
  }));

  let updated = 0;
  let failed = 0;
  let skippedTerminal = 0;
  let unmatched = 0;
  let trackingFallbacks = 0;
  const claimedProviderRows = new Set();

  for (const shipment of eligibleShipments) {
    const match = matchOrderMappingShipment(
      {
        shiprocketResponseId: shipment.shiprocket_response_id,
        shopifyOrderId: shipment.shopify_order_id,
        orderNumber: shipment.shopify_order_name || shipment.shopify_order_number,
        awb: shipment.awb || shipment.shopify_tracking_number,
      },
      providerRows,
    );

    if (!match.row) {
      unmatched += 1;
      await setShipmentSyncError(
        shipment.id,
        match.ambiguous ? "Ambiguous Shiprocket match" : "Not found in Shiprocket",
      );
      continue;
    }

    const providerKey =
      match.row.shiprocketResponseId || match.row.awb || match.row.shiprocketChannelReference;
    if (providerKey && claimedProviderRows.has(providerKey)) {
      continue;
    }
    claimedProviderRows.add(providerKey);

    try {
      let trackingPayload = null;
      try {
        const tracking = await fetchOrderMappingShiprocketTracking(
          match.row.awb || shipment.awb || shipment.shopify_tracking_number,
        );
        trackingPayload = tracking.tracking;
      } catch {
        trackingFallbacks += 1;
      }
      const rawStatusText = trackingPayload?.rawStatus || match.row.rawStatus || "";
      const rawStatusCode = trackingPayload?.rawStatusCode || match.row.rawStatusCode || "";
      const normalized = normalizeShiprocketStatus(rawStatusText, rawStatusCode);
      const normalizedStatus = normalized.canonicalStatus === "UNKNOWN" ? null : normalized.canonicalStatus;
      const result = await applyShipmentUpdate(shipment.id, {
        awb: trackingPayload?.awb || match.row.awb,
        normalizedStatus: normalizedStatus || shipment.normalized_status,
        rawStatus:
          trackingPayload?.rawStatus ||
          trackingPayload?.rawStatusCode ||
          match.row.rawStatus ||
          match.row.rawStatusCode ||
          shipment.raw_status,
        source: "SHIPROCKET_API",
        statusTimestamp:
          trackingPayload?.statusTimestamp ||
          match.row.statusTimestamp ||
          shipment.status_timestamp ||
          new Date().toISOString(),
        courier: trackingPayload?.courier || match.row.courier,
        deliveredAt: trackingPayload?.deliveredAt || match.row.deliveredAt,
        shiprocketResponseId: match.row.shiprocketResponseId,
        shiprocketOrderReference: match.row.shiprocketOrderReference,
        shiprocketChannelReference: match.row.shiprocketChannelReference,
        latestProviderPayload: {
          ...(match.row.latestProviderPayload || {}),
          ...(trackingPayload?.latestProviderPayload || {}),
        },
        trackingEvents: trackingPayload?.trackingEvents || [],
        force,
        preserveStatus: !normalizedStatus,
      });
      if (result.applied) {
        updated += 1;
      } else if (result.reason === "precedence") {
        skippedTerminal += 1;
      }
    } catch (error) {
      failed += 1;
      await setShipmentSyncError(shipment.id, error.message);
    }
  }

  return {
    processed: eligibleShipments.length,
    updated,
    skippedTerminal,
    failed,
    unmatched,
    trackingFallbacks,
    configured: true,
    pagesFetched: provider.pages,
  };
}

function normalizeSqliteRow(row) {
  const source = row.resolution_source === "MANUAL" ? "MANUAL" : row.resolution_source === "LEGACY_CSV" ? "CSV_IMPORT" : row.resolution_source === "SHIPROCKET" ? "SHIPROCKET_API" : "LEGACY_DATA";
  let normalizedStatus = "PENDING_TRACKING";
  if (row.resolution === "DELIVERED") {
    normalizedStatus = "DELIVERED_TO_CUSTOMER";
  } else if (row.resolution === "NOT_DELIVERED") {
    normalizedStatus = normalizeOrderMappingStatus(row.logistics_raw_status, "UNDELIVERED");
  } else if (row.logistics_raw_status) {
    normalizedStatus = normalizeOrderMappingStatus(row.logistics_raw_status, "UNKNOWN");
  }

  return {
    source,
    normalizedStatus,
    statusTimestamp: row.manual_resolved_at || row.logistics_updated_at || row.delivered_at || row.updated_at || row.order_created_at,
  };
}

export async function syncOrderMappingShopify(range) {
  return withSyncLock(41001, async () => {
    const syncRun = await createSyncRun("shopify_sync");
    try {
      const selectedRange = await safeRange(range);
      const payload = await fetchOrderMappingOrders(selectedRange);
      const result = await upsertShopifyOrders(payload.orders);
      const tracking = await refreshOrderMappingShiprocketCore({ force: false });
      await completeSyncRun(syncRun.id, {
        status: tracking.failed ? "partial" : "completed",
        processedCount: payload.orders.length,
        updatedCount: result.shipments + tracking.updated,
        skippedTerminalCount: tracking.skippedTerminal,
        failedCount: tracking.failed,
      });
      return {
        success: true,
        status: tracking.failed ? "partially_completed" : "completed",
        range: selectedRange,
        pages: payload.pages,
        ordersFetched: payload.orders.length,
        shipmentsUpserted: result.shipments,
        processed: payload.orders.length,
        created: result.orders,
        updated: result.shipments,
        unchanged: 0,
        failed: 0,
        tracking,
      };
    } catch (error) {
      await completeSyncRun(syncRun.id, {
        status: "failed",
        errorSummary: error.message,
      });
      throw error;
    }
  });
}

export async function refreshOrderMappingShiprocket({ shipmentId = null, force = false } = {}) {
  return withSyncLock(shipmentId ? 41003 : 41002, async () => {
    const syncRun = await createSyncRun(force ? "shiprocket_force_refresh" : "shiprocket_refresh");
    try {
      const result = await refreshOrderMappingShiprocketCore({ shipmentId, force });
      await completeSyncRun(syncRun.id, {
        status: result.failed ? (result.updated ? "partial" : "failed") : "completed",
        processedCount: result.processed,
        updatedCount: result.updated,
        skippedTerminalCount: result.skippedTerminal,
        failedCount: result.failed,
        errorSummary: result.configured ? null : "Shiprocket is not configured",
      });
      return result;
    } catch (error) {
      await completeSyncRun(syncRun.id, {
        status: "failed",
        errorSummary: error.message,
      });
      throw error;
    }
  });
}

export async function previewOrderMappingCsvImport({ text, fileName, mapping }) {
  try {
    const parsed = parseOrderMappingCsv(text, mapping);
    const fileHash = crypto.createHash("sha256").update(text).digest("hex");
    return await previewCsvImport({
      fileName,
      fileHash,
      mapping: parsed.mapping,
      parsedRows: parsed.rows,
    });
  } catch (error) {
    throw normalizeOrderMappingError(error);
  }
}

export async function commitOrderMappingCsvImport(batchId) {
  const syncRun = await createSyncRun("csv_import");
  try {
    const result = await commitCsvImport(batchId);
    await completeSyncRun(syncRun.id, {
      status: "completed",
      processedCount: result.totalRows || 0,
      updatedCount: result.updatedRows || 0,
      failedCount: result.invalidRows || 0,
    });
    return result;
  } catch (error) {
    await completeSyncRun(syncRun.id, {
      status: "failed",
      errorSummary: error.message,
    });
    if (error.code) {
      throw error;
    }
    throw orderMappingError(
      "ORDER_MAPPING_CSV_COMMIT_FAILED",
      "CSV import could not be committed",
      { statusCode: 500, cause: error },
    );
  }
}

export async function setManualOrderMappingShipmentStatus(shipmentId, payload) {
  const syncRun = await createSyncRun("manual_update");
  try {
    const result = await setManualShipmentStatus(shipmentId, payload);
    await completeSyncRun(syncRun.id, {
      status: "completed",
      processedCount: 1,
      updatedCount: 1,
    });
    return result;
  } catch (error) {
    await completeSyncRun(syncRun.id, {
      status: "failed",
      errorSummary: error.message,
    });
    throw normalizeOrderMappingError(error);
  }
}

export async function clearManualOrderMappingShipmentStatus(shipmentId) {
  const syncRun = await createSyncRun("manual_clear");
  try {
    const result = await clearManualShipmentStatus(shipmentId);
    await completeSyncRun(syncRun.id, {
      status: "completed",
      processedCount: 1,
      updatedCount: 1,
    });
    return result;
  } catch (error) {
    await completeSyncRun(syncRun.id, {
      status: "failed",
      errorSummary: error.message,
    });
    throw error;
  }
}

export async function previewOrderExpenseImport(file) {
  try {
    return await previewShiprocketPassbookImport(file);
  } catch (error) {
    throw normalizeOrderMappingError(error);
  }
}

export async function confirmOrderExpenseImport(importId) {
  const syncRun = await createSyncRun("shiprocket_passbook_import");
  try {
    const result = await confirmShiprocketPassbookImport(importId);
    await completeSyncRun(syncRun.id, {
      status: "completed",
      processedCount: result.summary?.financialRows || 0,
      updatedCount: result.insertedTransactions || 0,
      failedCount: result.duplicateTransactions || 0,
    });
    return result;
  } catch (error) {
    await completeSyncRun(syncRun.id, {
      status: "failed",
      errorSummary: error.message,
    });
    throw normalizeOrderMappingError(error);
  }
}

export async function listOrderExpenseImports(limit) {
  try {
    return { imports: await listShiprocketPassbookImports(limit) };
  } catch (error) {
    throw normalizeOrderMappingError(error);
  }
}

export async function getOrderExpenseImportDetailsById(importId) {
  try {
    return await getShiprocketPassbookImportDetails(importId);
  } catch (error) {
    throw normalizeOrderMappingError(error);
  }
}

export { listActionLogs, listNetworkLogs, createNetworkLog };

export async function migrateOrderMappingSqliteData() {
  const sqlite = new Database(env.sqlitePath, { readonly: true });
  try {
    const rows = sqlite.prepare("SELECT * FROM delivery_orders ORDER BY id").all();
    let migrated = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        await upsertShopifyOrders([
          {
            shopifyOrderId: row.shopify_order_id,
            shopifyOrderName: row.shopify_order_name,
            shopifyOrderNumber: row.shopify_order_number || "",
            orderDate: row.order_created_at,
            customerName: row.customer_name || "",
            customerPhone: "",
            shopifyFulfillmentStatus: row.shopify_fulfillment_status || "",
            cancellationStatus: row.cancellation_status || null,
            shopifyUpdatedAt: row.shopify_updated_at || row.updated_at,
            latestFulfillment: {},
            shipments: [
              {
                shopifyFulfillmentId: null,
                awb: row.awb || "",
                shopifyTrackingNumber: row.awb || "",
                courier: row.courier || "",
                latestProviderPayload: {},
              },
            ],
          },
        ]);
        const details = await listOrderMappings({ search: row.shopify_order_name, pageSize: 1 });
        const primaryShipmentId = details.orders[0]?.primary_shipment_id;
        if (primaryShipmentId) {
          const normalized = normalizeSqliteRow(row);
          await applyShipmentUpdate(primaryShipmentId, {
            normalizedStatus: normalized.normalizedStatus,
            rawStatus: row.logistics_raw_status,
            source: normalized.source,
            statusTimestamp: normalized.statusTimestamp,
            courier: row.courier,
            deliveredAt: row.delivered_at,
            shiprocketResponseId: row.shiprocket_response_id,
            shiprocketOrderReference: row.shiprocket_order_reference,
            shiprocketChannelReference: row.shiprocket_channel_reference,
            latestProviderPayload: {},
            remarks: row.manual_note || row.legacy_import_name || "Migrated from SQLite",
            manualOverride: row.resolution_source === "MANUAL",
            manualOverrideLock: row.resolution_source === "MANUAL",
            force: true,
          });
        }
        migrated += 1;
      } catch (error) {
        failed += 1;
        await logMigrationException(String(row.shopify_order_id), error.message, row);
      }
    }

    return { migrated, failed };
  } finally {
    sqlite.close();
  }
}

export {
  getOrderMappingDetails,
  listOrderMappings,
};
