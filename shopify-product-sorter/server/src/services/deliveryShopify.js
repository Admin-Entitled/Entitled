import { shopifyGraphQL } from "./shopifyService.js";

const QUERY = `query DeliveryOrders($cursor: String, $query: String!) { orders(first: 100, after: $cursor, query: $query, sortKey: CREATED_AT) { nodes { id name number createdAt updatedAt cancelledAt displayFulfillmentStatus customer { firstName lastName } fulfillments { trackingInfo { number } } } pageInfo { hasNextPage endCursor } } }`;
const iso = (date, end) => `${date}T${end ? "23:59:59" : "00:00:00"}Z`;

export async function fetchDeliveryOrders({ start, end }) {
  const query = `created_at:>=${iso(start, false)} created_at:<=${iso(end, true)}`;
  const orders = []; let cursor = null; let pages = 0;
  do {
    const data = await shopifyGraphQL(QUERY, { cursor, query }, { redactVariables: true });
    const connection = data.orders;
    orders.push(...connection.nodes.map((order) => ({
      id: order.id, name: order.name, number: order.number, createdAt: order.createdAt, updatedAt: order.updatedAt,
      cancelledAt: order.cancelledAt, fulfillmentStatus: order.displayFulfillmentStatus || "", customerName: [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(" "),
      awb: order.fulfillments.flatMap((fulfillment) => fulfillment.trackingInfo || []).map((tracking) => tracking.number).find(Boolean) || "",
    })));
    cursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null; pages += 1;
  } while (cursor);
  return { orders, pages };
}
