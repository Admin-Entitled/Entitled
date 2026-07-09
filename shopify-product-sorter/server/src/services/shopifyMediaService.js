import { env } from "../config/env.js";
import { getShopifyAuthHeaders, getShopifyGraphQLEndpoint } from "./shopifyAuth.js";
import { appendSkuImageAuditLog } from "./skuImageAuditService.js";
import { logError, logInfo, logWarn } from "../utils/logger.js";

const REQUIRED_SCOPES = ["read_products", "write_products", "write_files", "read_files"];
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseSkuList(value) {
  return [...new Set(
    String(value || "")
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

function buildSkuQuery(sku) {
  const escaped = String(sku).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `sku:\"${escaped}\"`;
}

async function shopifyGraphQL(query, variables = {}, options = {}) {
  const endpoint = getShopifyGraphQLEndpoint();
  const { headers } = await getShopifyAuthHeaders();
  const maxAttempts = options.maxAttempts || 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
    }).catch((error) => {
      if (attempt === maxAttempts) {
        throw error;
      }
      return { ok: false, status: 503, text: async () => error.message };
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < maxAttempts) {
        await sleep(500 * attempt);
        continue;
      }
      throw new Error(`Shopify API HTTP ${response.status}: ${errorText}`);
    }

    const payload = await response.json();
    if (payload.errors?.length) {
      const message = payload.errors.map((item) => item.message).join(", ");
      const throttled = payload.errors.some((item) => /thrott/i.test(item.message || ""));
      if (throttled && attempt < maxAttempts) {
        const restoreRate = payload.extensions?.cost?.throttleStatus?.restoreRate || 50;
        await sleep(Math.ceil(1000 / Math.max(restoreRate, 1)) * 2);
        continue;
      }
      throw new Error(message);
    }

    const throttle = payload.extensions?.cost?.throttleStatus;
    if (throttle?.currentlyAvailable !== undefined && throttle.currentlyAvailable < 50 && attempt < maxAttempts) {
      const restoreRate = throttle.restoreRate || 50;
      await sleep(Math.ceil((50 - throttle.currentlyAvailable) / Math.max(restoreRate, 1) * 1000));
    }

    return payload.data;
  }

  throw new Error("Shopify GraphQL request failed after retries");
}

async function paginate(query, variables, pickConnection) {
  let cursor = null;
  let hasNextPage = true;
  const nodes = [];

  while (hasNextPage) {
    const data = await shopifyGraphQL(query, {
      ...variables,
      cursor,
    });
    const connection = pickConnection(data);
    nodes.push(...connection.nodes);
    hasNextPage = connection.pageInfo.hasNextPage;
    cursor = connection.pageInfo.endCursor;
  }

  return nodes;
}

function normalizeMediaNode(node, index, mediaCount) {
  return {
    id: node.id,
    mediaContentType: node.mediaContentType,
    alt: node.alt || node.preview?.image?.altText || "",
    status: node.status || node.preview?.status || "UNKNOWN",
    imageUrl: node.image?.url || node.preview?.image?.url || "",
    imageAlt: node.image?.altText || node.preview?.image?.altText || "",
    position: index + 1,
    isFirst: index === 0,
    isLast: index === mediaCount - 1,
  };
}

function normalizeSkuRecord(variant, mediaMap) {
  const media = mediaMap.get(variant.product.id) || [];
  return {
    sku: variant.sku,
    variantId: variant.id,
    variantTitle: variant.title,
    productId: variant.product.id,
    productTitle: variant.product.title,
    productHandle: variant.product.handle,
    productStatus: variant.product.status,
    imageCount: media.length,
    media,
  };
}

function dedupeByProduct(items) {
  const seen = new Set();
  const unique = [];
  const duplicates = [];

  for (const item of items || []) {
    if (!item?.productId) {
      continue;
    }
    if (seen.has(item.productId)) {
      duplicates.push(item);
      continue;
    }
    seen.add(item.productId);
    unique.push(item);
  }

  return { unique, duplicates };
}

function resolveTargetMedia(media, selector) {
  if (!media.length) {
    return null;
  }

  if (selector.mediaId) {
    return media.find((item) => item.id === selector.mediaId) || null;
  }

  if (selector.positionMode === "first") {
    return media[0];
  }

  if (selector.positionMode === "last") {
    return media[media.length - 1];
  }

  const targetNumber = Number(selector.imageNumber);
  if (!Number.isInteger(targetNumber) || targetNumber < 1 || targetNumber > media.length) {
    return null;
  }

  return media[targetNumber - 1];
}

function computeReorderMoves(currentIds, nextIds) {
  const working = [...currentIds];
  const moves = [];

  for (let targetIndex = 0; targetIndex < nextIds.length; targetIndex += 1) {
    const mediaId = nextIds[targetIndex];
    const currentIndex = working.indexOf(mediaId);
    if (currentIndex === -1) {
      throw new Error(`Media not found in current order: ${mediaId}`);
    }
    if (currentIndex === targetIndex) {
      continue;
    }
    moves.push({
      id: mediaId,
      newPosition: String(targetIndex),
    });
    working.splice(currentIndex, 1);
    working.splice(targetIndex, 0, mediaId);
  }

  return moves;
}

function buildInsertedOrder(existingIds, newMediaId, positionMode, imageNumber) {
  const withoutNew = existingIds.filter((id) => id !== newMediaId);
  const maxPosition = withoutNew.length + 1;
  let targetPosition = maxPosition;

  if (positionMode === "first") {
    targetPosition = 1;
  } else if (positionMode === "last") {
    targetPosition = maxPosition;
  } else if (positionMode === "before") {
    targetPosition = Math.max(1, Math.min(Number(imageNumber || 1), maxPosition));
  } else if (positionMode === "after") {
    targetPosition = Math.max(1, Math.min(Number(imageNumber || 1) + 1, maxPosition));
  } else if (positionMode === "exact") {
    targetPosition = Math.max(1, Math.min(Number(imageNumber || maxPosition), maxPosition));
  }

  const insertIndex = targetPosition - 1;
  withoutNew.splice(insertIndex, 0, newMediaId);
  return withoutNew;
}

async function fetchProductMedia(productId) {
  const query = `
    query FetchProductMedia($id: ID!, $cursor: String) {
      product(id: $id) {
        id
        title
        media(first: 100, after: $cursor) {
          nodes {
            id
            alt
            mediaContentType
            status
            preview {
              status
              image {
                url
                altText
              }
            }
            ... on MediaImage {
              image {
                url
                altText
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

  const nodes = await paginate(query, { id: productId }, (data) => {
    if (!data.product) {
      throw new Error("Product not found");
    }
    return data.product.media;
  });

  return nodes.map((node, index) => normalizeMediaNode(node, index, nodes.length));
}

async function fetchVariantsBySku(sku) {
  const query = `
    query FetchVariantsBySku($query: String!, $cursor: String) {
      productVariants(first: 100, after: $cursor, query: $query, sortKey: SKU) {
        nodes {
          id
          title
          sku
          product {
            id
            title
            handle
            status
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  const nodes = await paginate(query, { query: buildSkuQuery(sku) }, (data) => data.productVariants);
  return nodes.filter((variant) => String(variant.sku || "").trim().toLowerCase() === sku.toLowerCase());
}

async function fetchAllSkuVariants() {
  const query = `
    query FetchAllSkuVariants($cursor: String) {
      productVariants(first: 100, after: $cursor, query: "sku:*", sortKey: SKU) {
        nodes {
          id
          title
          sku
          product {
            id
            title
            handle
            status
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  const nodes = await paginate(query, {}, (data) => data.productVariants);
  return nodes.filter((variant) => Boolean(String(variant.sku || "").trim()));
}

async function fetchMediaMap(productIds) {
  const map = new Map();
  for (const productId of productIds) {
    map.set(productId, await fetchProductMedia(productId));
  }
  return map;
}

async function waitForMediaCount(productId, previousCount, timeoutMs = 60_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const media = await fetchProductMedia(productId);
    if (media.length > previousCount) {
      return media;
    }
    await sleep(2000);
  }
  throw new Error("Timed out waiting for Shopify to finish processing the new image");
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

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const data = await shopifyGraphQL(query, { id: jobId });
    if (data.job?.done) {
      return;
    }
    await sleep(1500);
  }

  throw new Error("Timed out waiting for Shopify media reorder job");
}

async function uploadImageToStagedTarget({ contentBase64, mimeType, fileName }) {
  const buffer = Buffer.from(contentBase64, "base64");
  const mutation = `
    mutation CreateStagedUpload($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters {
            name
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphQL(mutation, {
    input: [
      {
        filename: fileName,
        mimeType,
        resource: "IMAGE",
        httpMethod: "POST",
        fileSize: String(buffer.byteLength),
      },
    ],
  });

  const errors = data.stagedUploadsCreate.userErrors || [];
  if (errors.length) {
    throw new Error(errors.map((item) => item.message).join(", "));
  }

  const target = data.stagedUploadsCreate.stagedTargets?.[0];
  if (!target) {
    throw new Error("Shopify did not return a staged upload target");
  }

  const formData = new FormData();
  for (const parameter of target.parameters || []) {
    formData.append(parameter.name, parameter.value);
  }
  formData.append("file", new Blob([buffer], { type: mimeType }), fileName);

  const uploadResponse = await fetch(target.url, {
    method: "POST",
    body: formData,
  });

  if (!uploadResponse.ok) {
    throw new Error(`Failed to upload file to Shopify staged target: HTTP ${uploadResponse.status}`);
  }

  return target.resourceUrl;
}

async function attachImageToProduct({ productId, originalSource, altText }) {
  const mutation = `
    mutation AttachImageToProduct($product: ProductUpdateInput!, $media: [CreateMediaInput!]) {
      productUpdate(product: $product, media: $media) {
        product {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphQL(mutation, {
    product: { id: productId },
    media: [
      {
        alt: altText || "",
        mediaContentType: "IMAGE",
        originalSource,
      },
    ],
  });

  const errors = data.productUpdate.userErrors || [];
  if (errors.length) {
    throw new Error(errors.map((item) => item.message).join(", "));
  }
}

async function deleteProductMediaDeprecated({ productId, mediaId }) {
  const mutation = `
    mutation DeleteProductMedia($productId: ID!, $mediaIds: [ID!]!) {
      productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
        deletedMediaIds
        deletedProductImageIds
        mediaUserErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphQL(mutation, {
    productId,
    mediaIds: [mediaId],
  });

  const errors = data.productDeleteMedia.mediaUserErrors || [];
  if (errors.length) {
    throw new Error(errors.map((item) => item.message).join(", "));
  }

  return data.productDeleteMedia;
}

async function reorderProductMedia({ productId, orderedMediaIds }) {
  const currentMedia = await fetchProductMedia(productId);
  const currentIds = currentMedia.map((item) => item.id);
  const moves = computeReorderMoves(currentIds, orderedMediaIds);

  if (!moves.length) {
    return currentMedia;
  }

  const mutation = `
    mutation ReorderProductMedia($id: ID!, $moves: [MoveInput!]!) {
      productReorderMedia(id: $id, moves: $moves) {
        job {
          id
          done
        }
        mediaUserErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphQL(mutation, {
    id: productId,
    moves,
  });

  const errors = data.productReorderMedia.mediaUserErrors || [];
  if (errors.length) {
    throw new Error(errors.map((item) => item.message).join(", "));
  }

  if (data.productReorderMedia.job?.id) {
    await pollJob(data.productReorderMedia.job.id);
  }

  return fetchProductMedia(productId);
}

export async function getShopifyScopeDiagnostics() {
  const query = `
    query CurrentAppInstallationScopes {
      currentAppInstallation {
        accessScopes {
          handle
        }
      }
    }
  `;

  try {
    const data = await shopifyGraphQL(query);
    const availableScopes = (data.currentAppInstallation?.accessScopes || []).map((scope) => scope.handle);
    return {
      requiredScopes: REQUIRED_SCOPES,
      availableScopes,
      missingScopes: REQUIRED_SCOPES.filter((scope) => !availableScopes.includes(scope)),
    };
  } catch (error) {
    return {
      requiredScopes: REQUIRED_SCOPES,
      availableScopes: [],
      missingScopes: REQUIRED_SCOPES,
      error: error.message,
    };
  }
}

export async function warnIfMissingSkuImageScopes() {
  const diagnostics = await getShopifyScopeDiagnostics();
  if (diagnostics.missingScopes.length) {
    logWarn("Missing Shopify scopes for SKU Image Manager", diagnostics);
  } else {
    logInfo("Verified Shopify scopes for SKU Image Manager", diagnostics);
  }
  return diagnostics;
}

export async function searchSkuImageProducts({ skuInput, loadAll = false }) {
  const skus = parseSkuList(skuInput);
  const variants = loadAll
    ? await fetchAllSkuVariants()
    : (await Promise.all(skus.map((sku) => fetchVariantsBySku(sku)))).flat();
  const productIds = [...new Set(variants.map((variant) => variant.product.id))];
  const mediaMap = await fetchMediaMap(productIds);
  const items = variants.map((variant) => normalizeSkuRecord(variant, mediaMap));
  const scopeDiagnostics = await getShopifyScopeDiagnostics();
  return {
    items,
    searchedSkus: skus,
    totalItems: items.length,
    scopeDiagnostics,
  };
}

export async function addImageToSkuProduct({
  sku,
  variantId,
  productId,
  imageUrl,
  altText,
  positionMode,
  imageNumber,
  upload,
}) {
  const beforeMedia = await fetchProductMedia(productId);
  const originalSource = upload?.contentBase64
    ? await uploadImageToStagedTarget(upload)
    : imageUrl;

  if (!originalSource) {
    throw new Error("Image source is required");
  }

  await attachImageToProduct({
    productId,
    originalSource,
    altText,
  });

  const afterCreateMedia = await waitForMediaCount(productId, beforeMedia.length);
  const newMedia = afterCreateMedia.find(
    (item) => !beforeMedia.some((existing) => existing.id === item.id),
  );

  if (!newMedia) {
    throw new Error("Shopify created the image, but the new media item could not be identified");
  }

  let finalMedia = afterCreateMedia;
  if (positionMode && positionMode !== "last") {
    const orderedIds = buildInsertedOrder(
      afterCreateMedia.map((item) => item.id),
      newMedia.id,
      positionMode,
      imageNumber,
    );
    finalMedia = await reorderProductMedia({
      productId,
      orderedMediaIds: orderedIds,
    });
  }

  appendSkuImageAuditLog({
    sku,
    productId,
    variantId,
    actionType: "add",
    imagePosition: positionMode === "last" ? finalMedia.length : Number(imageNumber) || 1,
    mediaId: newMedia.id,
    result: "success",
  });

  return {
    productId,
    sku,
    variantId,
    media: finalMedia,
    addedMediaId: newMedia.id,
  };
}

export async function deleteImageFromSkuProduct({
  sku,
  variantId,
  productId,
  positionMode,
  imageNumber,
  mediaId,
}) {
  const media = await fetchProductMedia(productId);
  const target = resolveTargetMedia(media, {
    positionMode,
    imageNumber,
    mediaId,
  });

  if (!target) {
    throw new Error("Requested image position does not exist");
  }

  try {
    // TODO: Replace deprecated productDeleteMedia with the newer files/media unlink flow when Shopify exposes a non-deprecated equivalent for product media removal.
    await deleteProductMediaDeprecated({
      productId,
      mediaId: target.id,
    });

    const refreshedMedia = await fetchProductMedia(productId);
    appendSkuImageAuditLog({
      sku,
      productId,
      variantId,
      actionType: "delete",
      imagePosition: target.position,
      mediaId: target.id,
      result: "success",
    });

    return {
      deletedTarget: target,
      media: refreshedMedia,
    };
  } catch (error) {
    appendSkuImageAuditLog({
      sku,
      productId,
      variantId,
      actionType: "delete",
      imagePosition: target.position,
      mediaId: target.id,
      result: "failed",
      error: error.message,
    });
    throw error;
  }
}

export async function reorderSkuProductImages({
  sku,
  variantId,
  productId,
  orderedMediaIds,
}) {
  const media = await reorderProductMedia({
    productId,
    orderedMediaIds,
  });
  appendSkuImageAuditLog({
    sku,
    productId,
    variantId,
    actionType: "reorder",
    imagePosition: null,
    mediaId: null,
    result: "success",
  });
  return { media };
}

export async function previewBulkDelete({ items, positionMode, imageNumber }) {
  const previewRows = [];
  const { unique, duplicates } = dedupeByProduct(items);

  for (const duplicate of duplicates) {
    previewRows.push({
      sku: duplicate.sku,
      productTitle: duplicate.productTitle,
      productId: duplicate.productId,
      variantId: duplicate.variantId,
      imagePosition: null,
      thumbnail: "",
      mediaId: null,
      status: "skipped",
      reason: "Duplicate parent product in selection",
    });
  }

  for (const item of unique) {
    try {
      const media = await fetchProductMedia(item.productId);
      const target = resolveTargetMedia(media, { positionMode, imageNumber });
      if (!target) {
        previewRows.push({
          sku: item.sku,
          productTitle: item.productTitle,
          productId: item.productId,
          variantId: item.variantId,
          imagePosition: imageNumber || null,
          thumbnail: "",
          mediaId: null,
          status: "skipped",
          reason: "Image position does not exist",
        });
        continue;
      }

      previewRows.push({
        sku: item.sku,
        productTitle: item.productTitle,
        productId: item.productId,
        variantId: item.variantId,
        imagePosition: target.position,
        thumbnail: target.imageUrl,
        mediaId: target.id,
        status: "ready",
        reason: "",
      });
    } catch (error) {
      previewRows.push({
        sku: item.sku,
        productTitle: item.productTitle,
        productId: item.productId,
        variantId: item.variantId,
        imagePosition: imageNumber || null,
        thumbnail: "",
        mediaId: null,
        status: "failed",
        reason: error.message,
      });
    }
  }

  return {
    previewRows,
    counts: {
      ready: previewRows.filter((row) => row.status === "ready").length,
      skipped: previewRows.filter((row) => row.status === "skipped").length,
      failed: previewRows.filter((row) => row.status === "failed").length,
    },
  };
}

export async function confirmBulkDelete({ previewRows }) {
  const results = [];

  for (const row of previewRows || []) {
    if (row.status !== "ready" || !row.mediaId) {
      results.push({
        ...row,
        result: row.status === "ready" ? "skipped" : row.status,
      });
      continue;
    }

    try {
      await deleteImageFromSkuProduct({
        sku: row.sku,
        variantId: row.variantId,
        productId: row.productId,
        mediaId: row.mediaId,
      });
      results.push({
        ...row,
        result: "success",
      });
    } catch (error) {
      results.push({
        ...row,
        result: "failed",
        reason: error.message,
      });
    }
  }

  return {
    results,
    counts: {
      success: results.filter((row) => row.result === "success").length,
      skipped: results.filter((row) => row.result === "skipped" || row.status === "skipped").length,
      failed: results.filter((row) => row.result === "failed").length,
    },
  };
}

export async function bulkAddImageToSkuProducts({
  items,
  imageUrl,
  altText,
  positionMode,
  imageNumber,
  upload,
}) {
  const results = [];
  const { unique, duplicates } = dedupeByProduct(items);

  for (const duplicate of duplicates) {
    results.push({
      sku: duplicate.sku,
      productTitle: duplicate.productTitle,
      productId: duplicate.productId,
      variantId: duplicate.variantId,
      result: "skipped",
      reason: "Duplicate parent product in selection",
    });
  }

  for (const item of unique) {
    try {
      const outcome = await addImageToSkuProduct({
        sku: item.sku,
        variantId: item.variantId,
        productId: item.productId,
        imageUrl,
        altText,
        positionMode,
        imageNumber,
        upload,
      });
      results.push({
        sku: item.sku,
        productTitle: item.productTitle,
        productId: item.productId,
        variantId: item.variantId,
        result: "success",
        addedMediaId: outcome.addedMediaId,
      });
    } catch (error) {
      appendSkuImageAuditLog({
        sku: item.sku,
        productId: item.productId,
        variantId: item.variantId,
        actionType: "bulk-add",
        imagePosition: Number(imageNumber) || null,
        mediaId: null,
        result: "failed",
        error: error.message,
      });
      results.push({
        sku: item.sku,
        productTitle: item.productTitle,
        productId: item.productId,
        variantId: item.variantId,
        result: "failed",
        reason: error.message,
      });
    }
  }

  return {
    results,
    counts: {
      success: results.filter((row) => row.result === "success").length,
      skipped: results.filter((row) => row.result === "skipped").length,
      failed: results.filter((row) => row.result === "failed").length,
    },
  };
}

export { REQUIRED_SCOPES };
