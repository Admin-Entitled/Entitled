import { sleep } from "./utils";

export type GqlUserError = { field?: string[] | null; message: string };

type GraphqlResponse<TData> = {
  data?: TData;
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
};

export type ShopifyClientConfig = {
  store: string;
  adminToken: string;
  apiVersion: string;
  maxRetries: number;
};

export type ProductLite = {
  id: string;
  title: string;
  status: string;
  totalInventory: number;
  publishedOnCurrentPublication?: boolean | null;
};

export type CollectionLite = {
  id: string;
  title: string;
  handle: string;
  sortOrder: string;
};

export class ShopifyClient {
  private readonly endpoint: string;
  private readonly adminToken: string;
  private readonly maxRetries: number;

  constructor(config: ShopifyClientConfig) {
    this.endpoint = `https://${config.store}/admin/api/${config.apiVersion}/graphql.json`;
    this.adminToken = config.adminToken;
    this.maxRetries = config.maxRetries;
  }

  async query<TData>(query: string, variables: Record<string, unknown> = {}): Promise<TData> {
    let attempt = 0;
    let backoffMs = 750;

    while (attempt <= this.maxRetries) {
      try {
        const res = await fetch(this.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": this.adminToken
          },
          body: JSON.stringify({ query, variables })
        });

        const text = await res.text();
        let parsed: GraphqlResponse<TData>;

        try {
          parsed = JSON.parse(text) as GraphqlResponse<TData>;
        } catch {
          throw new Error(`Invalid JSON response from Shopify: ${text.slice(0, 300)}`);
        }

        if (!res.ok) {
          const retryAfter = Number(res.headers.get("retry-after") ?? "0");
          const shouldRetry = res.status === 429 || res.status >= 500;
          if (shouldRetry && attempt < this.maxRetries) {
            const waitMs = retryAfter > 0 ? retryAfter * 1000 : backoffMs;
            await sleep(waitMs);
            attempt += 1;
            backoffMs = Math.min(backoffMs * 2, 12000);
            continue;
          }
          throw new Error(`Shopify HTTP ${res.status}: ${text.slice(0, 500)}`);
        }

        if (parsed.errors && parsed.errors.length > 0) {
          const throttled = parsed.errors.some((e) =>
            e.message.toLowerCase().includes("thrott") ||
            String(e.extensions?.["code"] ?? "").toLowerCase().includes("thrott")
          );

          if (throttled && attempt < this.maxRetries) {
            await sleep(backoffMs);
            attempt += 1;
            backoffMs = Math.min(backoffMs * 2, 12000);
            continue;
          }

          throw new Error(`Shopify GraphQL errors: ${JSON.stringify(parsed.errors)}`);
        }

        if (!parsed.data) {
          throw new Error("Shopify GraphQL returned empty data.");
        }

        return parsed.data;
      } catch (err) {
        if (attempt >= this.maxRetries) {
          throw err;
        }
        await sleep(backoffMs);
        attempt += 1;
        backoffMs = Math.min(backoffMs * 2, 12000);
      }
    }

    throw new Error("Unreachable retry state.");
  }
}

export function ensureNoUserErrors(userErrors: GqlUserError[] | undefined, context: string): void {
  if (!userErrors || userErrors.length === 0) return;
  throw new Error(`${context} failed with userErrors: ${JSON.stringify(userErrors)}`);
}

export async function getCollectionByHandle(client: ShopifyClient, handle: string): Promise<CollectionLite | null> {
  const query = `#graphql
    query CollectionByHandle($handle: String!) {
      collectionByHandle(handle: $handle) { id title handle sortOrder }
    }
  `;

  const data = await client.query<{ collectionByHandle: CollectionLite | null }>(query, { handle });
  return data.collectionByHandle;
}

export async function createManualCollection(
  client: ShopifyClient,
  title: string,
  handle: string
): Promise<CollectionLite> {
  const mutation = `#graphql
    mutation CollectionCreate($input: CollectionInput!) {
      collectionCreate(input: $input) {
        collection { id title handle sortOrder }
        userErrors { field message }
      }
    }
  `;

  const data = await client.query<{
    collectionCreate: { collection: CollectionLite | null; userErrors: GqlUserError[] };
  }>(mutation, {
    input: {
      title,
      handle,
      sortOrder: "MANUAL"
    }
  });

  ensureNoUserErrors(data.collectionCreate.userErrors, "collectionCreate");
  if (!data.collectionCreate.collection) {
    throw new Error("collectionCreate returned null collection");
  }
  return data.collectionCreate.collection;
}

export async function getPublicationIdByName(
  client: ShopifyClient,
  publicationName: string
): Promise<string | null> {
  const query = `#graphql
    query Publications {
      publications(first: 20) { nodes { id name } }
    }
  `;

  const data = await client.query<{
    publications: { nodes: Array<{ id: string; name: string }> };
  }>(query);

  const matched = data.publications.nodes.find(
    (p) => p.name.trim().toLowerCase() === publicationName.trim().toLowerCase()
  );
  return matched?.id ?? null;
}

export async function publishCollection(
  client: ShopifyClient,
  collectionId: string,
  publicationId: string
): Promise<void> {
  const mutation = `#graphql
    mutation Publish($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        userErrors { field message }
      }
    }
  `;

  const data = await client.query<{
    publishablePublish: { userErrors: GqlUserError[] };
  }>(mutation, {
    id: collectionId,
    input: [{ publicationId }]
  });

  ensureNoUserErrors(data.publishablePublish.userErrors, "publishablePublish");
}

export async function getAllCollectionProducts(client: ShopifyClient, collectionId: string): Promise<ProductLite[]> {
  type CollectionProductsResponse = {
    collection: {
      products: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: ProductLite[];
      };
    } | null;
  };

  const query = `#graphql
    query CollectionProducts($id: ID!, $first: Int!, $after: String) {
      collection(id: $id) {
        products(first: $first, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes { id title totalInventory status }
        }
      }
    }
  `;

  const all: ProductLite[] = [];
  let after: string | null = null;
  const first = 250;

  while (true) {
    const data: CollectionProductsResponse = await client.query<CollectionProductsResponse>(query, {
      id: collectionId,
      first,
      after
    });

    if (!data.collection) {
      throw new Error(`Collection not found by id ${collectionId}`);
    }

    all.push(...data.collection.products.nodes);

    if (!data.collection.products.pageInfo.hasNextPage) {
      break;
    }

    after = data.collection.products.pageInfo.endCursor;
    if (!after) break;
  }

  return all;
}

export async function collectionRemoveProducts(
  client: ShopifyClient,
  collectionId: string,
  productIds: string[]
): Promise<string | null> {
  if (productIds.length === 0) return null;

  const mutation = `#graphql
    mutation Remove($id: ID!, $productIds: [ID!]!) {
      collectionRemoveProducts(id: $id, productIds: $productIds) {
        job { id done }
        userErrors { field message }
      }
    }
  `;

  const data = await client.query<{
    collectionRemoveProducts: {
      job: { id: string; done: boolean } | null;
      userErrors: GqlUserError[];
    };
  }>(mutation, {
    id: collectionId,
    productIds
  });

  ensureNoUserErrors(data.collectionRemoveProducts.userErrors, "collectionRemoveProducts");
  return data.collectionRemoveProducts.job?.id ?? null;
}

export async function collectionAddProducts(
  client: ShopifyClient,
  collectionId: string,
  productIds: string[]
): Promise<string | null> {
  if (productIds.length === 0) return null;

  const mutation = `#graphql
    mutation Add($id: ID!, $productIds: [ID!]!) {
      collectionAddProductsV2(id: $id, productIds: $productIds) {
        job { id done }
        userErrors { field message }
      }
    }
  `;

  const data = await client.query<{
    collectionAddProductsV2: {
      job: { id: string; done: boolean } | null;
      userErrors: GqlUserError[];
    };
  }>(mutation, {
    id: collectionId,
    productIds
  });

  ensureNoUserErrors(data.collectionAddProductsV2.userErrors, "collectionAddProductsV2");
  return data.collectionAddProductsV2.job?.id ?? null;
}

export async function waitForJobDone(
  client: ShopifyClient,
  jobId: string,
  pollIntervalMs: number,
  timeoutMs: number
): Promise<void> {
  const query = `#graphql
    query Job($id: ID!) {
      job(id: $id) { id done }
    }
  `;

  const started = Date.now();

  while (Date.now() - started <= timeoutMs) {
    const data = await client.query<{ job: { id: string; done: boolean } | null }>(query, { id: jobId });
    if (data.job?.done) {
      return;
    }
    await sleep(pollIntervalMs);
  }

  throw new Error(`Timed out waiting for Shopify job ${jobId} after ${timeoutMs}ms`);
}

export type EligiblePoolResult = {
  fetchedActive: ProductLite[];
  eligible: ProductLite[];
  excludedOutOfStock: ProductLite[];
  excludedUnpublished: ProductLite[];
  publicationCheckApplied: boolean;
};

export async function fetchEligibleProducts(
  client: ShopifyClient,
  maxPool: number,
  pageSize: number
): Promise<EligiblePoolResult> {
  const queryWithPublicationField = `#graphql
    query EligibleProducts($first: Int!, $after: String, $query: String!) {
      products(first: $first, after: $after, query: $query) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          title
          status
          totalInventory
          publishedOnCurrentPublication
        }
      }
    }
  `;

  const queryWithoutPublicationField = `#graphql
    query EligibleProducts($first: Int!, $after: String, $query: String!) {
      products(first: $first, after: $after, query: $query) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          title
          status
          totalInventory
        }
      }
    }
  `;

  type EligibleProductsResponse = {
    products: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: ProductLite[];
    };
  };

  const fetchedActive: ProductLite[] = [];
  const eligible: ProductLite[] = [];
  const excludedOutOfStock: ProductLite[] = [];
  const excludedUnpublished: ProductLite[] = [];

  let after: string | null = null;
  const dedupe = new Set<string>();
  let publicationCheckApplied = true;

  while (fetchedActive.length < maxPool) {
    let data: EligibleProductsResponse;
    try {
      const query = publicationCheckApplied ? queryWithPublicationField : queryWithoutPublicationField;
      data = await client.query<EligibleProductsResponse>(query, {
        first: Math.min(pageSize, 250),
        after,
        query: "status:active"
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const scopeDeniedOnPublicationField =
        publicationCheckApplied &&
        message.includes("publishedOnCurrentPublication") &&
        (message.includes("ACCESS_DENIED") || message.includes("read_product_listings"));

      if (scopeDeniedOnPublicationField) {
        publicationCheckApplied = false;
        continue;
      }
      throw error;
    }

    for (const product of data.products.nodes) {
      if (dedupe.has(product.id)) continue;
      dedupe.add(product.id);

      fetchedActive.push(product);

      if (!(product.totalInventory > 0)) {
        excludedOutOfStock.push(product);
        continue;
      }

      if (publicationCheckApplied && product.publishedOnCurrentPublication === false) {
        excludedUnpublished.push(product);
        continue;
      }

      eligible.push(product);

      if (fetchedActive.length >= maxPool) {
        break;
      }
    }

    if (!data.products.pageInfo.hasNextPage || !data.products.pageInfo.endCursor) {
      break;
    }

    after = data.products.pageInfo.endCursor;
  }

  return {
    fetchedActive,
    eligible,
    excludedOutOfStock,
    excludedUnpublished,
    publicationCheckApplied
  };
}
