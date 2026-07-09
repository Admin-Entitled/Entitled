import app from "./app.js";
import { env, envLoadReport } from "./config/env.js";
import { getCachedTokenStatus, primeShopifyAuthCache } from "./services/shopifyAuth.js";
import { warnIfMissingSkuImageScopes } from "./services/shopifyMediaService.js";
import { fetchShopCounts } from "./services/shopifyService.js";
import { logInfo } from "./utils/logger.js";

async function startServer() {
  logInfo("Server env loaded", {
    rootEnvExists: envLoadReport.rootEnvExists,
    serverEnvExists: envLoadReport.serverEnvExists,
    shopifyStoreDomainPresent: Boolean(env.shopifyStoreDomain),
    shopifyClientIdPresent: Boolean(env.shopifyClientId),
  });

  await primeShopifyAuthCache().catch(() => {});

  const tokenStatus = getCachedTokenStatus();
  const authStatus = tokenStatus.isFresh ? "authenticated" : "not_authenticated";

  let collectionsCount = 0;
  if (env.shopifyStoreDomain && env.shopifyClientId && env.shopifyClientSecret) {
    try {
      const counts = await fetchShopCounts();
      collectionsCount = counts.collectionsCount;
      await warnIfMissingSkuImageScopes();
    } catch (err) {
      // If Shopify fetching fails, collectionsCount remains 0
    }
  }

  app.listen(env.port, () => {
    console.log(`Listening on :${env.port}`);
    console.log(`Shopify ${authStatus}`);
    console.log(`Collections: ${collectionsCount}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
