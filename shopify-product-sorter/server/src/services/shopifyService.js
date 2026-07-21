import { env } from "../config/env.js";
import { logError, logInfo } from "../utils/logger.js";
import { getShopifyAuthHeaders, getShopifyGraphQLEndpoint } from "./shopifyAuth.js";
import fs from "node:fs";

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
                    inventoryQuantity
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
        updatedAt: node.updatedAt,
        image: node.featuredImage?.url || "",
        imageAlt: node.featuredImage?.altText || node.title,
        price: Number(node.priceRangeV2.minVariantPrice.amount || 0),
        currencyCode: node.priceRangeV2.minVariantPrice.currencyCode,
        inventoryQuantity,
        totalInventory: node.totalInventory,
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
  since.setDate(since.getDate() - env.analyticsDays);
  const queryString = `processed_at:>=${since.toISOString()}`;

  const query = `
    query FetchOrders($cursor: String, $search: String!) {
      orders(first: 50, after: $cursor, query: $search, sortKey: PROCESSED_AT, reverse: true) {
        edges {
          cursor
          node {
            id
            lineItems(first: 100) {
              edges {
                node {
                  quantity
                  discountedTotalSet {
                    shopMoney {
                      amount
                    }
                  }
                  variant {
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

  for (const { node: order } of edges) {
    for (const lineItemEdge of order.lineItems.edges) {
      const lineItem = lineItemEdge.node;
      const productId = lineItem.variant?.product?.id;
      if (!productId || !targetIds.has(productId)) {
        continue;
      }

      if (!metrics[productId]) {
        metrics[productId] = { soldQuantity: 0, salesRevenue: 0 };
      }

      metrics[productId].soldQuantity += lineItem.quantity || 0;
      metrics[productId].salesRevenue += Number(
        lineItem.discountedTotalSet?.shopMoney?.amount || 0,
      );
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

export async function applyCollectionOrder(collectionId, oldOrderIds, newOrderIds) {
  const moves = [];
  const working = [...oldOrderIds];

  for (let targetIndex = 0; targetIndex < newOrderIds.length; targetIndex += 1) {
    const productId = newOrderIds[targetIndex];
    const currentIndex = working.indexOf(productId);

    if (currentIndex === -1) {
      throw new Error(`Product not found in current collection: ${productId}`);
    }

    if (currentIndex !== targetIndex) {
      moves.push({
        id: productId,
        newPosition: String(targetIndex),
      });
      working.splice(currentIndex, 1);
      working.splice(targetIndex, 0, productId);
    }
  }

  // 5. Log collection id, moves count, and first 5 move objects
  logInfo("Collection reorder details", {
    collectionId,
    movesCount: moves.length,
    first5Moves: moves.slice(0, 5)
  });

  if (!moves.length) {
    return { changed: 0, applied: false, report: { message: "No moves needed" } };
  }

  const mutation = `
    mutation ReorderCollection($id: ID!, $moves: [MoveInput!]!) {
      collectionReorderProducts(id: $id, moves: $moves) {
        job {
          id
          done
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  // 3. Log the exact GraphQL variables
  logInfo("Sending collectionReorderProducts mutation with variables", {
    variables: { id: collectionId, moves }
  });

  const data = await shopifyGraphQL(mutation, { id: collectionId, moves });
  const errors = data.collectionReorderProducts.userErrors;
  if (errors.length) {
    throw new Error(errors.map((item) => item.message).join(", "));
  }

  // 7. After mutation: capture job id, poll job until done=true, refresh collection order
  const jobId = data.collectionReorderProducts.job?.id;
  let jobStatus = "No Job ID returned";
  if (jobId) {
    jobStatus = await pollJob(jobId);
  }

  // Refresh collection order
  const refreshed = await fetchCollectionProducts(collectionId);
  const finalCollectionOrder = refreshed.products.map(p => p.id);

  // 8. Verify storefront order changed
  const orderMatchedExpected = finalCollectionOrder.length === newOrderIds.length &&
    finalCollectionOrder.every((id, idx) => id === newOrderIds[idx]);

  logInfo("Storefront order verification", {
    orderMatchedExpected,
    finalCollectionOrder,
    expectedOrder: newOrderIds
  });

  // 9. Produce a test report
  const report = {
    productsMoved: moves.map(m => m.id),
    shopifyJobId: jobId || null,
    jobCompletionStatus: jobStatus,
    finalCollectionOrder,
    orderMatchedExpected
  };

  logInfo("Collection Reorder Test Report Logged", report);

  const reportMd = `# Collection Reorder Test Report
- **Collection ID:** ${collectionId}
- **Shopify Job ID:** ${jobId || "N/A"}
- **Job Completion Status:** ${jobStatus}
- **Storefront Order Verification:** ${orderMatchedExpected ? "SUCCESS (Matched Expected Order)" : "FAILED (Mismatch)"}
- **Products Moved Count:** ${moves.length}

## Products Moved (in order of operations)
${moves.map(m => `- Product ID: \`${m.id}\` -> New Position: \`${m.newPosition}\``).join("\n")}

## Final Collection Order
${finalCollectionOrder.map((id, index) => `${index + 1}. \`${id}\``).join("\n")}
`;

  try {
    fs.writeFileSync("../reorder_report.md", reportMd, "utf8");
  } catch (e) {
    try {
      fs.writeFileSync("reorder_report.md", reportMd, "utf8");
    } catch (err) {}
  }

  return { changed: moves.length, applied: true, report };
}

async function pollJob(jobId) {
  const query = `
    query PollJob($id: ID!) {
      job(id: $id) {
        id
        done
      }
    }
  `;

  const maxAttempts = 20;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const data = await shopifyGraphQL(query, { id: jobId });
    if (data.job?.done) {
      return "done=true";
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  logError("Shopify reorder job timed out", new Error("Timeout"), { jobId });
  return "timeout";
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
