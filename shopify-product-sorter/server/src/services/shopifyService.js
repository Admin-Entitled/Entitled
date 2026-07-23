import { logError, logInfo } from "../utils/logger.js";
import { getShopifyAuthHeaders, getShopifyGraphQLEndpoint } from "./shopifyAuth.js";

export async function shopifyGraphQL(query, variables = {}) {
  const endpoint = getShopifyGraphQLEndpoint();
  const { headers } = await getShopifyAuthHeaders();

  // Extract a preview of the query operation to identify the request in logs
  const cleanQuery = query.replace(/\s+/g, " ").trim();
  const queryPreview = cleanQuery.substring(0, 100) + (cleanQuery.length > 100 ? "..." : "");

  logInfo("Shopify GraphQL Request Sent", {
    endpoint,
    queryPreview,
    variables,
  });

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
    });
  } catch (err) {
    logError("Shopify GraphQL Network Fetch Failed", err, {
      endpoint,
      queryPreview,
    });
    throw err;
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error response body");
    const error = new Error(`Shopify API HTTP ${response.status}: ${errorText}`);
    logError("Shopify GraphQL HTTP Error Status Received", error, {
      endpoint,
      httpStatus: response.status,
      errorText,
      queryPreview,
    });
    throw error;
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    const errorMessage = payload.errors.map((item) => item.message).join(", ");
    const error = new Error(errorMessage);
    logError("Shopify GraphQL API Errors Returned", error, {
      endpoint,
      errors: payload.errors,
      queryPreview,
    });
    throw error;
  }

  const throttle = payload.extensions?.cost?.throttleStatus;
  const cost = payload.extensions?.cost;

  logInfo("Shopify GraphQL Request Completed", {
    endpoint,
    queryPreview,
    requestedQueryCost: cost?.requestedQueryCost,
    actualQueryCost: cost?.actualQueryCost,
    throttleAvailable: throttle?.currentlyAvailable,
    throttleRestoreRate: throttle?.restoreRate,
  });

  return payload.data;
}

async function paginate(query, variables, pickConnection) {
  let hasNextPage = true;
  let cursor = null;
  const edges = [];

  while (hasNextPage) {
    const data = await shopifyGraphQL(query, {
      ...variables,
      cursor,
    });
    const connection = pickConnection(data);
    edges.push(...connection.edges);
    hasNextPage = connection.pageInfo.hasNextPage;
    cursor = connection.pageInfo.endCursor;
  }

  return edges;
}

export async function fetchCollections() {
  const query = `
    query FetchCollections($cursor: String) {
      collections(first: 100, after: $cursor, sortKey: UPDATED_AT) {
        edges {
          cursor
          node {
            id
            title
            handle
            sortOrder
            updatedAt
            ruleSet {
              appliedDisjunctively
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

  const edges = await paginate(query, {}, (data) => data.collections);
  return edges.map(({ node }) => ({
    id: node.id,
    title: node.title,
    handle: node.handle,
    sortOrder: node.sortOrder,
    updatedAt: node.updatedAt,
    type: node.ruleSet ? "smart" : "custom",
  }));
}

export async function fetchCollectionProducts(collectionId) {
  const query = `
    query FetchCollectionProducts($id: ID!, $cursor: String) {
      collection(id: $id) {
        id
        title
        handle
        sortOrder
        products(first: 100, after: $cursor) {
          edges {
            cursor
            node {
              id
              title
              handle
              productType
              vendor
              status
              tags
              createdAt
              publishedAt
              updatedAt
              totalInventory
              featuredImage {
                url
                altText
              }
              priceRangeV2 {
                minVariantPrice {
                  amount
                  currencyCode
                }
              }
              variants(first: 100) {
                edges {
                  node {
                    id
                    sku
                    inventoryQuantity
                    availableForSale
                    selectedOptions { name value }
                    price
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  `;

  const edges = await paginate(query, { id: collectionId }, (data) => {
    if (!data.collection) {
      throw new Error("Collection not found");
    }
    return data.collection.products;
  });

  const collection = await shopifyGraphQL(
    `
      query CollectionMeta($id: ID!) {
        collection(id: $id) {
          id
          title
          handle
          sortOrder
        }
      }
    `,
    { id: collectionId },
  );

  return {
    collection: collection.collection,
    products: edges
      .map(({ node }) => node)
      .filter((node) => node.status === "ACTIVE")
      .map((node, index) => {
      const inventoryQuantity = node.variants.edges.reduce(
        (total, edge) => total + (edge.node.inventoryQuantity || 0),
        0,
      );

      return {
        id: node.id,
        title: node.title,
        handle: node.handle,
        productType: node.productType || "",
        vendor: node.vendor,
        status: node.status,
        tags: node.tags,
        createdAt: node.createdAt,
        publishedAt: node.publishedAt,
        updatedAt: node.updatedAt,
        image: node.featuredImage?.url || "",
        imageAlt: node.featuredImage?.altText || node.title,
        price: Number(node.priceRangeV2.minVariantPrice.amount || 0),
        currencyCode: node.priceRangeV2.minVariantPrice.currencyCode,
        inventoryQuantity,
        totalInventory: node.totalInventory,
        variants: node.variants.edges.map(({ node: variant }) => ({
          id: variant.id,
          sku: variant.sku || "",
          productId: node.id,
          inventoryQuantity: Math.max(0, Number(variant.inventoryQuantity) || 0),
          availableForSale: Boolean(variant.availableForSale),
          selectedOptions: variant.selectedOptions || [],
          active: node.status === "ACTIVE",
        })),
        collectionPosition: index + 1,
      };
    }),
  };
}

export async function fetchSalesMetrics(productIds) {
  if (!productIds.length) {
    return {};
  }

  const since = new Date();
  since.setDate(since.getDate() - 90);
  const queryString = `processed_at:>=${since.toISOString()}`;

  const query = `
    query FetchOrders($cursor: String, $search: String!) {
      orders(first: 50, after: $cursor, query: $search, sortKey: PROCESSED_AT, reverse: true) {
        edges {
          cursor
          node {
            id
            processedAt
            cancelledAt
            test
            refunds(first: 100) { refundLineItems(first: 100) { edges { node { quantity lineItem { id } } } } }
            lineItems(first: 100) {
              edges {
                node {
                  id
                  quantity
                  discountedTotalSet {
                    shopMoney {
                      amount
                    }
                  }
                  variant {
                    id
                    sku
                    product {
                      id
                    }
                  }
                }
              }
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

  const targetIds = new Set(productIds);
  const metrics = {};
  const edges = await paginate(query, { search: queryString }, (data) => data.orders);

  const now = Date.now();
  for (const { node: order } of edges) {
    if (order.cancelledAt || order.test) continue;
    const refunded = new Map();
    for (const refund of order.refunds || []) {
      for (const { node } of refund.refundLineItems?.edges || []) {
        const lineItemId = node.lineItem?.id;
        refunded.set(lineItemId, (refunded.get(lineItemId) || 0) + (node.quantity || 0));
      }
    }
    const ageDays = (now - new Date(order.processedAt).getTime()) / 86400000;
    for (const lineItemEdge of order.lineItems.edges) {
      const lineItem = lineItemEdge.node;
      const productId = lineItem.variant?.product?.id;
      if (!productId || !targetIds.has(productId)) {
        continue;
      }

      const quantity = Math.max(0, (lineItem.quantity || 0) - (refunded.get(lineItem.id) || 0));
      if (!metrics[productId]) {
        metrics[productId] = { soldQuantity: 0, salesRevenue: 0, sales: { units7: 0, units30: 0, units90: 0, previous23: 0 }, variants: {} };
      }

      metrics[productId].soldQuantity += quantity;
      metrics[productId].salesRevenue += Number(
        lineItem.discountedTotalSet?.shopMoney?.amount || 0,
      );
      const variantId = lineItem.variant?.id || lineItem.variant?.sku || "unknown";
      metrics[productId].variants[variantId] = (metrics[productId].variants[variantId] || 0) + quantity;
      if (ageDays <= 7) metrics[productId].sales.units7 += quantity;
      if (ageDays <= 30) metrics[productId].sales.units30 += quantity;
      if (ageDays <= 90) metrics[productId].sales.units90 += quantity;
      if (ageDays > 7 && ageDays <= 30) metrics[productId].sales.previous23 += quantity;
    }
  }

  return metrics;
}

export async function fetchActualSalesOrders(days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - Math.max(1, Number(days) || 30));
  const queryString = `processed_at:>=${since.toISOString()}`;

  const query = `
    query FetchActualSalesOrders($cursor: String, $search: String!) {
      orders(first: 50, after: $cursor, query: $search, sortKey: PROCESSED_AT, reverse: true) {
        edges {
          cursor
          node {
            id
            name
            cancelledAt
            createdAt
            processedAt
            paymentGatewayNames
            displayFinancialStatus
            displayFulfillmentStatus
            subtotalLineItemsQuantity
            currentTotalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            totalRefundedSet {
              shopMoney {
                amount
              }
            }
            currentSubtotalPriceSet {
              shopMoney {
                amount
              }
            }
            shippingAddress {
              phone
              zip
              city
              province
            }
            customer {
              phone
            }
            fulfillments(first: 20) {
              trackingInfo(first: 10) {
                number
                company
              }
            }
            lineItems(first: 100) {
              edges {
                node {
                  title
                  sku
                  quantity
                  currentQuantity
                  variantTitle
                  discountedTotalSet {
                    shopMoney {
                      amount
                    }
                  }
                  variant {
                    id
                    inventoryQuantity
                    product {
                      id
                      title
                      vendor
                      productType
                      tags
                      totalInventory
                    }
                  }
                }
              }
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

  const edges = await paginate(query, { search: queryString }, (data) => data.orders);
  return edges.map(({ node }) => ({
    id: node.id,
    name: node.name,
    cancelledAt: node.cancelledAt,
    createdAt: node.createdAt,
    processedAt: node.processedAt,
    paymentGatewayNames: node.paymentGatewayNames || [],
    financialStatus: node.displayFinancialStatus,
    fulfillmentStatus: node.displayFulfillmentStatus,
    total: Number(node.currentTotalPriceSet?.shopMoney?.amount || 0),
    subtotal: Number(node.currentSubtotalPriceSet?.shopMoney?.amount || 0),
    refundedAmount: Number(node.totalRefundedSet?.shopMoney?.amount || 0),
    bookedUnits: Number(node.subtotalLineItemsQuantity || 0),
    currencyCode: node.currentTotalPriceSet?.shopMoney?.currencyCode || "USD",
    phone: node.shippingAddress?.phone || node.customer?.phone || "",
    shippingAddress: {
      zip: node.shippingAddress?.zip || "",
      city: node.shippingAddress?.city || "",
      province: node.shippingAddress?.province || "",
    },
    trackingNumbers: node.fulfillments.flatMap((fulfillment) =>
      fulfillment.trackingInfo
        .map((tracking) => tracking.number)
        .filter(Boolean),
    ),
    lineItems: node.lineItems.edges.map(({ node: lineItem }) => ({
      title: lineItem.title,
      sku: lineItem.sku || "",
      variantTitle: lineItem.variantTitle || "",
      quantity: Number(lineItem.quantity || 0),
      currentQuantity: Number(lineItem.currentQuantity || 0),
      lineRevenue: Number(lineItem.discountedTotalSet?.shopMoney?.amount || 0),
      variantId: lineItem.variant?.id || "",
      inventoryQuantity: Number(lineItem.variant?.inventoryQuantity || 0),
      productId: lineItem.variant?.product?.id || "",
      productTitle: lineItem.variant?.product?.title || lineItem.title,
      vendor: lineItem.variant?.product?.vendor || "",
      productType: lineItem.variant?.product?.productType || "",
      tags: lineItem.variant?.product?.tags || [],
      totalInventory: Number(lineItem.variant?.product?.totalInventory || 0),
    })),
  }));
}

export async function ensureManualSort(collectionId) {
  const mutation = `
    mutation EnsureManualSort($input: CollectionInput!) {
      collectionUpdate(input: $input) {
        collection {
          id
          sortOrder
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphQL(mutation, {
    input: {
      id: collectionId,
      sortOrder: "MANUAL",
    },
  });

  const errors = data.collectionUpdate.userErrors;
  if (errors.length) {
    throw new Error(errors.map((item) => item.message).join(", "));
  }

  return data.collectionUpdate.collection;
}

export function buildCollectionMoves(currentIds, desiredIds) {
  if (new Set(currentIds).size !== currentIds.length || new Set(desiredIds).size !== desiredIds.length || currentIds.length !== desiredIds.length || currentIds.some((id) => !desiredIds.includes(id))) {
    throw new Error("Proposed order must contain every current collection product exactly once.");
  }
  const working = [...currentIds];
  const moves = [];
  for (let position = 0; position < desiredIds.length; position += 1) {
    const currentPosition = working.indexOf(desiredIds[position]);
    if (currentPosition === position) continue;
    moves.push({ id: desiredIds[position], newPosition: String(position) });
    working.splice(currentPosition, 1);
    working.splice(position, 0, desiredIds[position]);
  }
  return moves;
}

async function validateReorderAccess() {
  const data = await shopifyGraphQL(`query ReorderAccess { shop { myshopifyDomain } currentAppInstallation { accessScopes { handle } } }`);
  if (!data.shop?.myshopifyDomain) throw new Error("Shopify shop authentication could not be verified.");
  if (!data.currentAppInstallation?.accessScopes?.some((scope) => scope.handle === "write_products")) {
    throw new Error("Shopify app is missing the write_products scope required to reorder collections.");
  }
}

async function waitForCollectionJob(jobId) {
  const query = `query PollJob($id: ID!) { job(id: $id) { id done } }`;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const data = await shopifyGraphQL(query, { id: jobId });
    if (data.job?.done) return;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`Shopify reorder job ${jobId} timed out before completion.`);
}

async function submitCollectionMoves(collectionId, moves) {
  const data = await shopifyGraphQL(`mutation ReorderCollection($id: ID!, $moves: [MoveInput!]!) { collectionReorderProducts(id: $id, moves: $moves) { job { id } userErrors { field message } } }`, { id: collectionId, moves });
  const result = data.collectionReorderProducts;
  if (result.userErrors?.length) throw new Error(result.userErrors.map((item) => item.message).join(", "));
  if (!result.job?.id) throw new Error("Shopify did not return a reorder job ID.");
  return result.job.id;
}

function verificationError(collection, expected, actual, batches) {
  const mismatch = expected.findIndex((id, index) => id !== actual[index]);
  const expectedProduct = collection.products.find((product) => product.id === expected[mismatch]);
  const actualProduct = collection.products.find((product) => product.id === actual[mismatch]);
  return new Error(`Shopify order verification failed for ${collection.collection.title}: expected ${expected.length}, received ${actual.length}, mismatch at ${mismatch + 1}: expected ${expectedProduct?.id || "none"} (${expectedProduct?.title || "unknown"}), received ${actualProduct?.id || "none"} (${actualProduct?.title || "unknown"}), batches ${batches}.`);
}

export async function syncCollectionOrder(collectionId, desiredIds) {
  await validateReorderAccess();
  let collection = await fetchCollectionProducts(collectionId);
  if (collection.collection.sortOrder !== "MANUAL") {
    const manual = await ensureManualSort(collectionId);
    if (manual.sortOrder !== "MANUAL") throw new Error("Shopify did not confirm MANUAL collection sorting.");
    collection = await fetchCollectionProducts(collectionId);
  }
  const expected = [...desiredIds];
  let batches = 0;
  let changed = 0;
  for (; batches < 100; batches += 1) {
    const current = collection.products.map((product) => product.id);
    const moves = buildCollectionMoves(current, expected);
    if (!moves.length) {
      logInfo("Shopify collection order verified", { collectionId, collectionTitle: collection.collection.title, productCount: current.length, batches });
      return { changed, applied: batches > 0, batches, collection };
    }
    const batch = moves.slice(0, 250);
    changed += batch.length;
    logInfo("Submitting Shopify collection reorder batch", { collectionId, collectionTitle: collection.collection.title, currentCount: current.length, intendedCount: expected.length, moves: moves.length, batch: batches + 1, batchMoves: batch.length });
    const jobId = await submitCollectionMoves(collectionId, batch);
    logInfo("Waiting for Shopify collection reorder job", { collectionId, batch: batches + 1, jobId });
    await waitForCollectionJob(jobId);
    collection = await fetchCollectionProducts(collectionId);
  }
  const actual = collection.products.map((product) => product.id);
  throw verificationError(collection, expected, actual, batches);
}

export async function fetchShopCounts() {
  const query = `
    query FetchShopCounts {
      collectionsCount {
        count
      }
      productsCount {
        count
      }
    }
  `;
  const data = await shopifyGraphQL(query);
  return {
    collectionsCount: data.collectionsCount?.count ?? 0,
    productsCount: data.productsCount?.count ?? 0,
  };
}
