import { shopifyGraphQL } from "./shopifyService.js";
import { createNetworkLog } from "./orderMappingRepository.js";

const ORDER_QUERY = `
  query OrderMappingOrders($cursor: String, $query: String!) {
    orders(first: 100, after: $cursor, query: $query, sortKey: UPDATED_AT) {
      nodes {
        id
        name
        number
        createdAt
        updatedAt
        cancelledAt
        displayFulfillmentStatus
        currentTotalPriceSet {
          shopMoney {
            amount
          }
        }
        customer {
          firstName
          lastName
          phone
        }
        shippingAddress {
          phone
        }
        fulfillments {
          id
          trackingInfo {
            company
            number
            url
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

function isoWindow(date, end) {
  return `${date}T${end ? "23:59:59" : "00:00:00"}Z`;
}

function shipmentRows(order) {
  const rows = order.fulfillments.flatMap((fulfillment) => {
    const tracking = Array.isArray(fulfillment.trackingInfo) ? fulfillment.trackingInfo : [];
    if (!tracking.length) {
      return [
        {
          shopifyFulfillmentId: fulfillment.id,
          awb: "",
          shopifyTrackingNumber: "",
          courier: "",
          latestProviderPayload: {},
        },
      ];
    }

    return tracking.map((item) => ({
      shopifyFulfillmentId: fulfillment.id,
      awb: item.number || "",
      shopifyTrackingNumber: item.number || "",
      courier: item.company || "",
      latestProviderPayload: item.url ? { trackingUrl: item.url } : {},
    }));
  });

  return rows.length
    ? rows
    : [
        {
          shopifyFulfillmentId: null,
          awb: "",
          shopifyTrackingNumber: "",
          courier: "",
          latestProviderPayload: {},
        },
      ];
}

export async function fetchOrderMappingOrders({ start, end }) {
  const orders = [];
  let cursor = null;
  let pages = 0;
  const query = `updated_at:>=${isoWindow(start, false)} updated_at:<=${isoWindow(end, true)}`;

  do {
    const startedAt = new Date();
    try {
      const data = await shopifyGraphQL(ORDER_QUERY, { cursor, query }, { redactVariables: true });
      await createNetworkLog({
        operation: "shopify_sync",
        provider: "SHOPIFY",
        method: "POST",
        endpoint: "/admin/api/graphql.json",
        status: "success",
        statusCode: 200,
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
        metadata: { page: pages + 1 },
      });
      const connection = data.orders;
      for (const order of connection.nodes) {
        const orderTotal = order.currentTotalPriceSet?.shopMoney?.amount || "";
        orders.push({
          shopifyOrderId: order.id,
          shopifyOrderName: order.name,
          shopifyOrderNumber: String(order.number || ""),
          orderDate: order.createdAt,
          customerName: [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(" "),
          customerPhone: order.shippingAddress?.phone || order.customer?.phone || "",
          shopifyFulfillmentStatus: order.displayFulfillmentStatus || "",
          cancellationStatus: order.cancelledAt || null,
          shopifyUpdatedAt: order.updatedAt || null,
          latestFulfillment: {
            count: order.fulfillments.length,
            order_total: String(orderTotal || ""),
          },
          shipments: shipmentRows(order).map((shipment) => ({
            ...shipment,
            latestProviderPayload: {
              ...(shipment.latestProviderPayload || {}),
              order_total: String(orderTotal || ""),
            },
          })),
        });
      }
      cursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
      pages += 1;
    } catch (error) {
      await createNetworkLog({
        operation: "shopify_sync",
        provider: "SHOPIFY",
        method: "POST",
        endpoint: "/admin/api/graphql.json",
        status: "failed",
        statusCode: error.statusCode || 500,
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
        errorSummary: error.message,
        metadata: { page: pages + 1 },
      });
      throw error;
    }
  } while (cursor);

  return { orders, pages };
}
