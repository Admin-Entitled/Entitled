import { formatMoney, sleep } from "./utils";
import type { ParsedSkuGroup } from "./csv_parser";

export interface ShopifyEnv {
  store: string;
  adminToken: string;
  apiVersion: "2025-01";
  locationId?: string;
  locationName?: string;
}

export interface ImportMetrics {
  variantsPlanned: number;
  variantsCreated: number;
  inventorySetCount: number;
  throttleRetries: number;
  shopifyCalls: number;
  executionTimeMs: number;
}

export interface ImportedVariant {
  size: string;
  variantSku: string;
  variantGid: string;
  price: number;
  qtySet: number;
}

export interface InventoryAction {
  size: string;
  inventoryItemGid: string;
  locationGid: string;
  finalQty: number;
  method: "set" | "adjust";
  delta: number;
}

export interface ImportResult {
  created: boolean;
  productGid?: string;
  variantsCreated: ImportedVariant[];
  inventoryActions: InventoryAction[];
  warnings: string[];
  errors: string[];
  metrics: ImportMetrics;
}

interface GraphResponse<T> {
  data?: T;
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
  extensions?: {
    cost?: {
      throttleStatus?: {
        currentlyAvailable?: number;
        restoreRate?: number;
      };
    };
  };
}

interface RequestContext {
  metrics: ImportMetrics;
}

interface VariantNode {
  id: string;
  sku: string;
  selectedOptions: Array<{ name: string; value: string }>;
  inventoryItem?: { id: string };
}

interface AccessScopesResponse {
  currentAppInstallation?: {
    accessScopes?: Array<{ handle: string }>;
  };
}

interface CollectionsQueryResponse {
  collections?: {
    nodes?: Array<{ id: string; title: string }>;
  };
}

const PRODUCT_CREATE_MUTATION = `
mutation ProductCreate($product: ProductCreateInput!) {
  productCreate(product: $product) {
    product {
      id
      title
    }
    userErrors {
      field
      message
    }
  }
}`;

const PRODUCT_VARIANTS_BULK_CREATE_MUTATION = `
mutation ProductVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkCreate(productId: $productId, variants: $variants) {
    productVariants {
      id
      sku
      selectedOptions {
        name
        value
      }
      inventoryItem {
        id
      }
    }
    userErrors {
      field
      message
    }
  }
}`;

const PRODUCT_VARIANTS_QUERY = `
query ProductVariantsForInventory($id: ID!) {
  product(id: $id) {
    id
    variants(first: 250) {
      nodes {
        id
        sku
        selectedOptions {
          name
          value
        }
        inventoryItem {
          id
        }
      }
    }
  }
}`;

const LOCATIONS_QUERY = `
query FindLocations($query: String!) {
  locations(first: 250, query: $query) {
    nodes {
      id
      name
    }
  }
}`;

const INVENTORY_SET_QUANTITIES_MUTATION = `
mutation InventorySetQuantities($input: InventorySetQuantitiesInput!) {
  inventorySetQuantities(input: $input) {
    inventoryAdjustmentGroup {
      reason
    }
    userErrors {
      field
      message
    }
  }
}`;

const INVENTORY_LEVEL_QUERY = `
query InventoryLevel($inventoryItemId: ID!, $locationId: ID!) {
  inventoryItem(id: $inventoryItemId) {
    id
    inventoryLevel(locationId: $locationId) {
      quantities(names: ["available"]) {
        name
        quantity
      }
    }
  }
}`;

const INVENTORY_ADJUST_QUANTITIES_MUTATION = `
mutation InventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
  inventoryAdjustQuantities(input: $input) {
    inventoryAdjustmentGroup {
      reason
    }
    userErrors {
      field
      message
    }
  }
}`;

const ACCESS_SCOPES_QUERY = `
query AccessScopes {
  currentAppInstallation {
    accessScopes {
      handle
    }
  }
}`;

const COLLECTIONS_QUERY = `
query FindCollections($query: String!) {
  collections(first: 50, query: $query) {
    nodes {
      id
      title
    }
  }
}`;

const COLLECTION_CREATE_MUTATION = `
mutation CollectionCreate($input: CollectionInput!) {
  collectionCreate(input: $input) {
    collection {
      id
      title
    }
    userErrors {
      field
      message
    }
  }
}`;

const COLLECTION_ADD_PRODUCTS_MUTATION = `
mutation CollectionAddProducts($id: ID!, $productIds: [ID!]!) {
  collectionAddProducts(id: $id, productIds: $productIds) {
    userErrors {
      field
      message
    }
  }
}`;

const ALL_PRODUCTS_COLLECTION_TITLE = "All Products";
const ALL_COLLECTION_TITLE = "All";
const HIGH_VALUE_COLLECTION_TITLE = "Popular Product";

export class ShopifyClient {
  private readonly endpoint: string;
  private readonly token: string;
  private readonly locationId?: string;
  private readonly locationName?: string;
  private readonly highValuePriceThreshold: number;
  private accessScopesChecked = false;
  private canWriteInventory = true;

  constructor(env: ShopifyEnv) {
    this.endpoint = `https://${env.store}/admin/api/${env.apiVersion}/graphql.json`;
    this.token = env.adminToken;
    this.locationId = env.locationId;
    this.locationName = env.locationName;
    const threshold = Number(process.env.HIGH_VALUE_PRICE_THRESHOLD ?? "2000");
    this.highValuePriceThreshold = Number.isFinite(threshold) ? threshold : 2000;
  }

  private async gql<T>(
    query: string,
    variables: Record<string, unknown>,
    ctx: RequestContext,
    attempt = 0
  ): Promise<GraphResponse<T>> {
    ctx.metrics.shopifyCalls += 1;

    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": this.token,
      },
      body: JSON.stringify({ query, variables }),
    });

    const json = (await res.json()) as GraphResponse<T>;
    const throttledByHttp = res.status === 429;
    const throttledByGraph = Boolean(
      json.errors?.some((e) =>
        [e.message, String(e.extensions?.code ?? "")].join(" ").toLowerCase().includes("throttled")
      )
    );

    if ((throttledByHttp || throttledByGraph) && attempt < 6) {
      ctx.metrics.throttleRetries += 1;
      await sleep(Math.min(10_000, 400 * 2 ** attempt));
      return this.gql<T>(query, variables, ctx, attempt + 1);
    }

    if (!res.ok && attempt < 4) {
      await sleep(Math.min(8_000, 300 * 2 ** attempt));
      return this.gql<T>(query, variables, ctx, attempt + 1);
    }

    const throttle = json.extensions?.cost?.throttleStatus;
    if (throttle?.currentlyAvailable !== undefined && throttle.restoreRate !== undefined) {
      if (throttle.currentlyAvailable < 50) {
        const needed = 120 - throttle.currentlyAvailable;
        const waitMs = Math.ceil((needed / Math.max(1, throttle.restoreRate)) * 1000);
        await sleep(Math.min(2000, Math.max(100, waitMs)));
      }
    }

    return json;
  }

  private async resolveLocationId(ctx: RequestContext): Promise<string> {
    if (this.locationId) return this.locationId;
    if (!this.locationName) {
      throw new Error("locationName or locationId is required");
    }

    const queryRes = await this.gql<{
      locations: {
        nodes: Array<{ id: string; name: string }>;
      };
    }>(LOCATIONS_QUERY, { query: this.locationName }, ctx);

    const graphErrors = queryRes.errors?.map((e) => e.message) ?? [];
    if (graphErrors.length > 0) {
      throw new Error(`locations query failed: ${graphErrors.join(" | ")}`);
    }

    const locations = queryRes.data?.locations.nodes ?? [];
    const exact = locations.find((l) => l.name.toLowerCase() === this.locationName!.toLowerCase());
    if (exact) return exact.id;

    if (locations.length === 1) return locations[0].id;

    if (locations.length > 1) {
      throw new Error(`multiple locations matched locationName '${this.locationName}'`);
    }

    throw new Error(`no Shopify location found for locationName '${this.locationName}'`);
  }

  private async ensureAccessScopes(ctx: RequestContext): Promise<void> {
    if (this.accessScopesChecked) return;

    const res = await this.gql<AccessScopesResponse>(ACCESS_SCOPES_QUERY, {}, ctx);
    const graphErrors = res.errors?.map((e) => e.message) ?? [];
    if (graphErrors.length > 0) {
      throw new Error(`accessScopes query failed: ${graphErrors.join(" | ")}`);
    }

    const handles = new Set(
      (res.data?.currentAppInstallation?.accessScopes ?? [])
        .map((s) => String(s.handle ?? "").trim().toLowerCase())
        .filter(Boolean)
    );

    if (!handles.has("write_products")) {
      throw new Error("Access token is missing required Shopify scope: write_products");
    }

    this.canWriteInventory = handles.has("write_inventory");
    this.accessScopesChecked = true;
  }

  private async findCollectionIdByTitle(ctx: RequestContext, title: string): Promise<string | null> {
    const q = title.trim();
    if (!q) return null;

    const res = await this.gql<CollectionsQueryResponse>(COLLECTIONS_QUERY, { query: `title:${q}` }, ctx);
    const graphErrors = res.errors?.map((e) => e.message) ?? [];
    if (graphErrors.length > 0) {
      throw new Error(`collections query failed for '${title}': ${graphErrors.join(" | ")}`);
    }

    const nodes = res.data?.collections?.nodes ?? [];
    const exact = nodes.find((n) => n.title.trim().toLowerCase() === q.toLowerCase());
    if (exact) return exact.id;
    return null;
  }

  private async ensureCollection(ctx: RequestContext, title: string): Promise<string> {
    const existingId = await this.findCollectionIdByTitle(ctx, title);
    if (existingId) return existingId;

    const createRes = await this.gql<{
      collectionCreate: {
        collection?: { id: string; title: string };
        userErrors: Array<{ message: string }>;
      };
    }>(COLLECTION_CREATE_MUTATION, { input: { title } }, ctx);

    if (createRes.errors?.length) {
      throw new Error(`collectionCreate failed for '${title}': ${createRes.errors.map((e) => e.message).join(" | ")}`);
    }
    const userErrors = createRes.data?.collectionCreate.userErrors ?? [];
    if (userErrors.length) {
      throw new Error(`collectionCreate userErrors for '${title}': ${userErrors.map((e) => e.message).join(" | ")}`);
    }

    const id = createRes.data?.collectionCreate.collection?.id;
    if (!id) {
      throw new Error(`collectionCreate returned no collection id for '${title}'`);
    }
    return id;
  }

  private async addProductToCollection(
    ctx: RequestContext,
    collectionId: string,
    productId: string,
    collectionTitle: string
  ): Promise<void> {
    const res = await this.gql<{
      collectionAddProducts: {
        userErrors: Array<{ message: string }>;
      };
    }>(COLLECTION_ADD_PRODUCTS_MUTATION, { id: collectionId, productIds: [productId] }, ctx);

    if (res.errors?.length) {
      throw new Error(
        `collectionAddProducts failed for '${collectionTitle}': ${res.errors.map((e) => e.message).join(" | ")}`
      );
    }
    const userErrors = res.data?.collectionAddProducts.userErrors ?? [];
    if (userErrors.length) {
      const combined = userErrors.map((e) => e.message).join(" | ");
      if (/already.*collection/i.test(combined)) return;
      throw new Error(`collectionAddProducts userErrors for '${collectionTitle}': ${combined}`);
    }
  }

  private async assignCollections(
    ctx: RequestContext,
    group: ParsedSkuGroup,
    productGid: string,
    warnings: string[],
    errors: string[]
  ): Promise<void> {
    const titles = new Set<string>();
    titles.add(ALL_COLLECTION_TITLE);
    titles.add(ALL_PRODUCTS_COLLECTION_TITLE);
    if (group.productType.trim()) titles.add(group.productType.trim());
    if (group.sellingPrice >= this.highValuePriceThreshold) {
      titles.add(HIGH_VALUE_COLLECTION_TITLE);
    }

    for (const title of titles) {
      try {
        const collectionId = await this.ensureCollection(ctx, title);
        await this.addProductToCollection(ctx, collectionId, productGid, title);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`collection assignment failed for '${title}': ${message}`);
      }
    }
    if (group.sellingPrice >= this.highValuePriceThreshold) {
      warnings.push(
        `Added to high-value collection '${HIGH_VALUE_COLLECTION_TITLE}' using threshold ${this.highValuePriceThreshold}.`
      );
    }
  }

  async importSkuGroup(group: ParsedSkuGroup): Promise<ImportResult> {
    const started = Date.now();
    const metrics: ImportMetrics = {
      variantsPlanned: group.variants.length,
      variantsCreated: 0,
      inventorySetCount: 0,
      throttleRetries: 0,
      shopifyCalls: 0,
      executionTimeMs: 0,
    };
    const ctx: RequestContext = { metrics };

    const warnings: string[] = [];
    const errors: string[] = [];
    const variantsCreated: ImportedVariant[] = [];
    const inventoryActions: InventoryAction[] = [];

    try {
      await this.ensureAccessScopes(ctx);
      const resolvedLocationId = await this.resolveLocationId(ctx);
      const uniqueSizes = [...new Set(group.variants.map((v) => v.size))];

      const createRes = await this.gql<{
        productCreate: {
          product?: { id: string };
          userErrors: Array<{ message: string }>;
        };
      }>(
        PRODUCT_CREATE_MUTATION,
        {
          product: {
            title: group.title,
            vendor: group.vendor || undefined,
            productType: group.productType || undefined,
            tags: group.tags,
            status: group.status,
            productOptions: [
              {
                name: "Size",
                values: uniqueSizes.map((size) => ({ name: size })),
              },
            ],
          },
        },
        ctx
      );

      if (createRes.errors?.length) {
        errors.push(...createRes.errors.map((e) => e.message));
      }
      const createUserErrors = createRes.data?.productCreate.userErrors ?? [];
      if (createUserErrors.length) {
        errors.push(...createUserErrors.map((e) => e.message));
      }

      const productGid = createRes.data?.productCreate.product?.id;
      if (!productGid) {
        throw new Error(`productCreate failed: ${errors.join(" | ") || "missing product id"}`);
      }

      const createdBySize = new Map<string, VariantNode>();
      const existingVariantsRes = await this.gql<{
        product: { variants: { nodes: VariantNode[] } };
      }>(PRODUCT_VARIANTS_QUERY, { id: productGid }, ctx);
      for (const node of existingVariantsRes.data?.product.variants.nodes ?? []) {
        const sizeOpt = node.selectedOptions.find((o) => o.name.toLowerCase() === "size")?.value;
        if (sizeOpt) createdBySize.set(sizeOpt.toUpperCase(), node);
      }

      const variantsToCreate = group.variants.filter((v) => !createdBySize.has(v.size.toUpperCase()));
      if (variantsToCreate.length > 0) {
        const variantsRes = await this.gql<{
          productVariantsBulkCreate: {
            productVariants: VariantNode[];
            userErrors: Array<{ message: string }>;
          };
        }>(
          PRODUCT_VARIANTS_BULK_CREATE_MUTATION,
          {
            productId: productGid,
            variants: variantsToCreate.map((v) => ({
              optionValues: [{ name: v.size, optionName: "Size" }],
              price: formatMoney(group.sellingPrice),
              inventoryItem: {
                sku: `${group.sku}-${v.size}`,
                tracked: true,
                ...(v.barcode ? { barcode: v.barcode } : {}),
              },
            })),
          },
          ctx
        );

        if (variantsRes.errors?.length) {
          errors.push(...variantsRes.errors.map((e) => e.message));
        }
        const variantUserErrors = variantsRes.data?.productVariantsBulkCreate.userErrors ?? [];
        if (variantUserErrors.length) {
          errors.push(...variantUserErrors.map((e) => e.message));
        }
        for (const node of variantsRes.data?.productVariantsBulkCreate.productVariants ?? []) {
          const sizeOpt = node.selectedOptions.find((o) => o.name.toLowerCase() === "size")?.value;
          if (sizeOpt) createdBySize.set(sizeOpt.toUpperCase(), node);
        }
      }

      if (createdBySize.size < group.variants.length) {
        const queryRes = await this.gql<{
          product: { variants: { nodes: VariantNode[] } };
        }>(PRODUCT_VARIANTS_QUERY, { id: productGid }, ctx);
        for (const node of queryRes.data?.product.variants.nodes ?? []) {
          const sizeOpt = node.selectedOptions.find((o) => o.name.toLowerCase() === "size")?.value;
          if (sizeOpt) createdBySize.set(sizeOpt.toUpperCase(), node);
        }
      }

      for (const variant of group.variants) {
        const node = createdBySize.get(variant.size.toUpperCase());
        if (!node) {
          errors.push(`Variant missing after bulk create for size ${variant.size}`);
          continue;
        }

        metrics.variantsCreated += 1;
        variantsCreated.push({
          size: variant.size,
          variantSku: `${group.sku}-${variant.size}`,
          variantGid: node.id,
          price: group.sellingPrice,
          qtySet: variant.qty,
        });

        if (!this.canWriteInventory) {
          continue;
        }

        const inventoryItemId = node.inventoryItem?.id;
        if (!inventoryItemId) {
          errors.push(`No inventory item id for variant ${node.id}`);
          continue;
        }

        let method: "set" | "adjust" = "set";
        let delta = variant.qty;

        const setRes = await this.gql<{
          inventorySetQuantities?: { userErrors: Array<{ message: string }> };
        }>(
          INVENTORY_SET_QUANTITIES_MUTATION,
          {
            input: {
              name: "available",
              reason: "correction",
              ignoreCompareQuantity: true,
              quantities: [
                {
                  inventoryItemId,
                  locationId: resolvedLocationId,
                  quantity: variant.qty,
                },
              ],
            },
          },
          ctx
        );

        const setUserErrors = setRes.data?.inventorySetQuantities?.userErrors ?? [];
        if (setRes.errors?.length) {
          errors.push(...setRes.errors.map((e) => e.message));
        }
        if (setUserErrors.length) {
          errors.push(...setUserErrors.map((e) => e.message));
        }
        const setFailed = (setRes.errors?.length ?? 0) > 0 || setUserErrors.length > 0;

        if (setFailed) {
          method = "adjust";
          const levelRes = await this.gql<{
            inventoryItem?: {
              inventoryLevel?: {
                quantities?: Array<{ name: string; quantity: number }>;
              };
            };
          }>(INVENTORY_LEVEL_QUERY, { inventoryItemId, locationId: resolvedLocationId }, ctx);

          const currentQty =
            levelRes.data?.inventoryItem?.inventoryLevel?.quantities?.find((q) => q.name === "available")?.quantity ?? 0;
          delta = variant.qty - currentQty;

          const adjustRes = await this.gql<{
            inventoryAdjustQuantities?: { userErrors: Array<{ message: string }> };
          }>(
            INVENTORY_ADJUST_QUANTITIES_MUTATION,
            {
              input: {
                reason: "correction",
                name: "available",
                changes: [
                  {
                    delta,
                    inventoryItemId,
                    locationId: resolvedLocationId,
                  },
                ],
              },
            },
            ctx
          );

          if (adjustRes.errors?.length) {
            errors.push(...adjustRes.errors.map((e) => e.message));
          }
          const adjustUserErrors = adjustRes.data?.inventoryAdjustQuantities?.userErrors ?? [];
          if (adjustUserErrors.length) {
            errors.push(...adjustUserErrors.map((e) => e.message));
          }

          if (!adjustRes.errors?.length && !adjustUserErrors.length) {
            metrics.inventorySetCount += 1;
            inventoryActions.push({
              size: variant.size,
              inventoryItemGid: inventoryItemId,
              locationGid: resolvedLocationId,
              finalQty: variant.qty,
              method,
              delta,
            });
          }

          continue;
        }

        metrics.inventorySetCount += 1;
        inventoryActions.push({
          size: variant.size,
          inventoryItemGid: inventoryItemId,
          locationGid: resolvedLocationId,
          finalQty: variant.qty,
          method,
          delta,
        });
      }

      if (!this.canWriteInventory) {
        warnings.push(
          "Inventory updates were skipped because the access token is missing write_inventory scope (product/variants created only)."
        );
      }

      await this.assignCollections(ctx, group, productGid, warnings, errors);

      metrics.executionTimeMs = Date.now() - started;
      return {
        created: errors.length === 0,
        productGid,
        variantsCreated,
        inventoryActions,
        warnings,
        errors,
        metrics,
      };
    } catch (error) {
      metrics.executionTimeMs = Date.now() - started;
      errors.push(error instanceof Error ? error.message : String(error));
      return {
        created: false,
        variantsCreated,
        inventoryActions,
        warnings,
        errors,
        metrics,
      };
    }
  }
}
