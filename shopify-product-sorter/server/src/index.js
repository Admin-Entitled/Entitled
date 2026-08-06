import app from "./app.js";
import { env, envLoadReport, getShopifyCapability } from "./config/env.js";
import { runOrderMappingMigrations } from "./services/orderMappingMigrations.js";
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

  await runOrderMappingMigrations();

  const shopifyCapability = getShopifyCapability();
  await primeShopifyAuthCache().catch(() => {});

  const tokenStatus = getCachedTokenStatus();
  const authStatus = tokenStatus.isFresh ? "authenticated" : "not_authenticated";

  let collectionsCount = 0;
  if (shopifyCapability.available) {
    try {
      const counts = await fetchShopCounts();
      collectionsCount = counts.collectionsCount;
      await warnIfMissingSkuImageScopes();
    } catch (err) {
      // Configured provider failure: server stays up and reports the error at request time
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
