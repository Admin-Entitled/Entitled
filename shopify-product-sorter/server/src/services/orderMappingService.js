import crypto from "node:crypto";
import Database from "better-sqlite3";
import { env } from "../config/env.js";
import { parseOrderMappingCsv } from "./orderMappingCsv.js";
import { fetchOrderMappingOrders } from "./orderMappingShopify.js";
import { fetchOrderMappingShiprocketShipments } from "./orderMappingShiprocket.js";
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
  setManualShipmentStatus,
  upsertShopifyOrders,
  withSyncLock,
} from "./orderMappingRepository.js";
import { matchOrderMappingShipment } from "./orderMappingMatcher.js";
import { normalizeOrderMappingStatus } from "./orderMappingStatus.js";

function safeRange(range) {
  if (range?.start && range?.end) {
    return range;
  }
  return getLatestShopifySyncWindow();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
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
      await completeSyncRun(syncRun.id, {
        status: "completed",
        processedCount: payload.orders.length,
        updatedCount: result.shipments,
      });
      return {
        range: selectedRange,
        pages: payload.pages,
        ordersFetched: payload.orders.length,
        shipmentsUpserted: result.shipments,
        processed: payload.orders.length,
        created: result.orders,
        updated: result.shipments,
        unchanged: 0,
        failed: 0,
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
      const eligibleShipments = await listEligibleShipmentsForRefresh({ shipmentId, force });
      if (!eligibleShipments.length) {
        await completeSyncRun(syncRun.id, { status: "completed" });
        return { processed: 0, updated: 0, skippedTerminal: 0, configured: true, shipments: [] };
      }

      const start = eligibleShipments
        .map((shipment) => shipment.order_date)
        .map((value) => new Date(value))
        .sort((left, right) => left.getTime() - right.getTime())[0]
        .toISOString()
        .slice(0, 10);
      const end = todayIso();
      const provider = await fetchOrderMappingShiprocketShipments({ start, end });
      if (!provider.configured) {
        await completeSyncRun(syncRun.id, { status: "completed" });
        return { processed: 0, updated: 0, skippedTerminal: 0, configured: false, shipments: [] };
      }

      let updated = 0;
      let failed = 0;
      let skippedTerminal = 0;

      for (const shipment of eligibleShipments) {
        const match = matchOrderMappingShipment(
          {
            shopifyOrderId: shipment.shopify_order_id,
            orderNumber: shipment.shopify_order_name || shipment.shopify_order_number,
            awb: shipment.awb,
          },
          provider.shipments.map((row) => ({
            ...row,
            shopify_order_id: row.shiprocketOrderReference,
            shopify_order_name: row.shiprocketChannelReference,
            shopify_order_number: row.shiprocketOrderReference,
          })),
        );

        if (!match.row) {
          continue;
        }

        try {
          const result = await applyShipmentUpdate(shipment.id, {
            normalizedStatus: normalizeOrderMappingStatus(match.row.rawStatus, "UNKNOWN"),
            rawStatus: match.row.rawStatus,
            source: "SHIPROCKET_API",
            statusTimestamp: match.row.statusTimestamp || shipment.status_timestamp || new Date().toISOString(),
            courier: match.row.courier,
            deliveredAt: match.row.deliveredAt,
            shiprocketResponseId: match.row.shiprocketResponseId,
            shiprocketOrderReference: match.row.shiprocketOrderReference,
            shiprocketChannelReference: match.row.shiprocketChannelReference,
            latestProviderPayload: match.row.latestProviderPayload,
            force,
          });
          if (result.applied) {
            updated += 1;
          } else if (result.reason === "precedence") {
            skippedTerminal += 1;
          }
        } catch {
          failed += 1;
        }
      }

      await completeSyncRun(syncRun.id, {
        status: failed ? (updated ? "partial" : "failed") : "completed",
        processedCount: eligibleShipments.length,
        updatedCount: updated,
        skippedTerminalCount: skippedTerminal,
        failedCount: failed,
      });

      return {
        processed: eligibleShipments.length,
        updated,
        skippedTerminal,
        failed,
        configured: true,
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

export async function previewOrderMappingCsvImport({ text, fileName, mapping }) {
  const syncRun = await createSyncRun("csv_preview");
  try {
    const parsed = parseOrderMappingCsv(text, mapping);
    const fileHash = crypto.createHash("sha256").update(text).digest("hex");
    const preview = await previewCsvImport({
      fileName,
      fileHash,
      mapping: parsed.mapping,
      parsedRows: parsed.rows,
    });
    await completeSyncRun(syncRun.id, {
      status: "completed",
      processedCount: preview.counts.totalRows,
      updatedCount: preview.counts.updatedRows,
      failedCount: preview.counts.invalidRows,
    });
    return preview;
  } catch (error) {
    await completeSyncRun(syncRun.id, {
      status: "failed",
      errorSummary: error.message,
    });
    throw error;
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
    throw error;
  }
}

export async function setManualOrderMappingShipmentStatus(...args) {
  const syncRun = await createSyncRun("manual_update");
  try {
    const result = await setManualShipmentStatus(...args);
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
