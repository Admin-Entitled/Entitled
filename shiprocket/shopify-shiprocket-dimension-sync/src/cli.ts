import { Command } from 'commander';
import { loadConfig, AppConfig } from './config';
import { logger } from './logger';
import { ShopifyClient } from './shopify-client';
import { ShiprocketClient } from './shiprocket-client';
import { BrowserAutomation } from './browser-automation';
import { CsvTransformer } from './csv-transformer';
import { Verifier, SKUVerifyResult } from './verifier';

class CliApp {
  private config!: AppConfig;
  private isConfigLoaded = false;

  constructor() {
    this.initializeConfig();
  }

  private initializeConfig(): boolean {
    try {
      this.config = loadConfig();
      this.isConfigLoaded = true;
      return true;
    } catch (err) {
      console.log('\n========================================================================');
      console.log('⚠️  Shopify-Shiprocket Dimension Sync: Configuration Error  ⚠️');
      console.log('========================================================================');
      console.log((err as Error).message);
      console.log('\nPlease ensure you have:');
      console.log('1. Created a .env file from .env.example (cp .env.example .env)');
      console.log('2. Entered valid Shopify store domains, API credentials, and Shiprocket credentials.');
      console.log('3. Set proper UNIVERSAL dimensions and weights.');
      console.log('========================================================================\n');
      this.isConfigLoaded = false;
      return false;
    }
  }

  /**
   * CLI: npm run setup:shiprocket
   * Launches visible browser context to manually authenticate and save Shiprocket session state.
   */
  public async setup() {
    if (!this.isConfigLoaded) {
      process.exit(1);
    }
    const automation = new BrowserAutomation(this.config);
    const success = await automation.setupSession();
    if (success) {
      logger.info('Browser setup completed successfully.');
      process.exit(0);
    } else {
      logger.error('Browser setup failed.');
      process.exit(1);
    }
  }

  /**
   * CLI Action: Shopify connection read-only check
   */
  public async testShopify() {
    if (!this.isConfigLoaded) {
      process.exit(1);
    }
    logger.info('Running Shopify connection read-only check...');
    try {
      const shopifyClient = new ShopifyClient(this.config.shopify);
      const shopName = await shopifyClient.getShopIdentity();
      logger.info(`Successfully authenticated. Shopify Shop Name: "${shopName}"`);

      const variants = await shopifyClient.fetchActiveVariants();
      logger.info(`Successfully retrieved variants list from GQL api. Total active variants found: ${variants.length}`);
      
      const valid = variants.filter(v => v.sku);
      const blank = variants.length - valid.length;
      logger.info(`Diagnostics SKU Summary - Valid SKUs: ${valid.length}, Blank SKUs: ${blank}`);
      
      if (valid.length > 0) {
        logger.info(`Sample GQL Parsed SKU: "${valid[0].sku}" on variant: "${valid[0].variantTitle}"`);
      }
      process.exit(0);
    } catch (err) {
      logger.error(`Shopify read-only test failed: ${(err as Error).message}`);
      process.exit(1);
    }
  }

  /**
   * CLI Action: Shiprocket connection read-only check
   */
  public async testShiprocket() {
    if (!this.isConfigLoaded) {
      process.exit(1);
    }
    logger.info('Running Shiprocket API read-only check...');
    try {
      const shiprocketClient = new ShiprocketClient(this.config.shiprocket);
      const products = await shiprocketClient.fetchAllProducts();
      logger.info(`Successfully authenticated. Shiprocket catalog contains ${products.length} products.`);

      const channels = await shiprocketClient.fetchChannels();
      logger.info(`Retrieved integrations channels: [${channels.map(c => c.name || c.channel_name).join(', ')}]`);

      const target = this.config.shiprocket.channelName;
      const match = channels.find(
        c => (c.name || '').toLowerCase() === target.toLowerCase() ||
             (c.channel_name || '').toLowerCase() === target.toLowerCase()
      );

      if (match) {
        logger.info(`Configured integration channel "${target}" identified successfully (ID: ${match.id || match.channel_id}).`);
      } else {
        logger.warn(`Configured integration channel "${target}" could not be found in active channels list.`);
      }
      process.exit(0);
    } catch (err) {
      logger.error(`Shiprocket read-only test failed: ${(err as Error).message}`);
      process.exit(1);
    }
  }

  /**
   * CLI Action: dry-run
   */
  public async dryRun() {
    if (!this.isConfigLoaded) {
      process.exit(1);
    }

    logger.info('Starting DRY RUN (Simulation mode)...');

    try {
      const shopifyClient = new ShopifyClient(this.config.shopify);
      const shiprocketClient = new ShiprocketClient(this.config.shiprocket);
      const verifier = new Verifier();

      // 1. Fetch Shopify variants
      const shopifyVariants = await shopifyClient.fetchActiveVariants();
      
      // 2. Fetch Shiprocket products
      const shiprocketProducts = await shiprocketClient.fetchAllProducts();

      // 3. Compare and simulate
      const preUpdateCorrect = new Set<string>();
      const results = verifier.verify(
        shopifyVariants,
        shiprocketProducts,
        this.config.universal,
        preUpdateCorrect
      );

      // Report results
      verifier.logReport(results);
      logger.info('DRY RUN completed. No changes were made to Shiprocket.');
    } catch (err) {
      logger.error(`Dry Run failed: ${(err as Error).message}`);
      process.exit(1);
    }
  }

  /**
   * CLI Action: sync
   */
  public async sync(options: { apply?: boolean; sku?: string; applyAll?: boolean }) {
    if (!this.isConfigLoaded) {
      process.exit(1);
    }

    // Safety checks for CLI flags
    if (options.apply && !options.sku) {
      logger.error('Safety Abort: --apply-all is required for all-product updates. To update a single SKU, use --sku <sku> --apply.');
      process.exit(1);
    }

    // Resolve one-SKU live test using TEST_SKU env lookup
    let targetSku = options.sku;
    if (targetSku === 'TEST-SKU') {
      const envTestSku = process.env.TEST_SKU;
      if (!envTestSku) {
        logger.error('Safety Abort: TEST_SKU is missing in your .env configuration. Please add TEST_SKU=your_sku to run a one-SKU live test.');
        process.exit(1);
      }
      targetSku = envTestSku;
    }

    const applyUpdates = (targetSku && options.apply) || (!targetSku && options.applyAll);

    logger.info(`Starting synchronization. Mode: ${applyUpdates ? 'REAL SYNC (Applying updates)' : 'DRY RUN (CSV will be prepared but not uploaded)'}`);

    try {
      const shopifyClient = new ShopifyClient(this.config.shopify);
      const shiprocketClient = new ShiprocketClient(this.config.shiprocket);
      const automation = new BrowserAutomation(this.config);
      const transformer = new CsvTransformer();
      const verifier = new Verifier();

      // 1. Pull Shopify products
      let shopifyVariants = await shopifyClient.fetchActiveVariants();
      
      // If a specific SKU filter is requested, slice variants array
      if (targetSku) {
        shopifyVariants = shopifyVariants.filter(v => v.sku === targetSku);
        if (shopifyVariants.length === 0) {
          logger.error(`No active Shopify variants found matching SKU filter: "${targetSku}".`);
          process.exit(1);
        }
        logger.info(`Sync restricted to single SKU filter: "${targetSku}" (Matched ${shopifyVariants.length} variant).`);
      }

      const shopifySkus = new Set(shopifyVariants.map(v => v.sku));

      // 2. Trigger product sync in Shiprocket UI via Playwright
      if (applyUpdates) {
        try {
          await automation.syncChannelCatalogue();
        } catch (syncErr) {
          logger.warn(`Failed to trigger UI catalogue sync: ${(syncErr as Error).message}. Proceeding to API checks...`);
        }
      }

      // 3. Poll Shiprocket API until SKUs appear
      logger.info('Checking if Shopify SKUs are present in Shiprocket catalog...');
      let shiprocketProducts = await shiprocketClient.fetchAllProducts();
      let shiprocketSkus = new Set(shiprocketProducts.map(p => p.sku));

      const getMissingSkus = () => {
        return Array.from(shopifySkus).filter(sku => !shiprocketSkus.has(sku));
      };

      let missingSkus = getMissingSkus();
      const unresolvedSyncSkus = new Set<string>();

      if (missingSkus.length > 0 && applyUpdates) {
        logger.info(`Found ${missingSkus.length} SKU(s) missing in Shiprocket. Polling for channel synchronization...`);
        
        const startTime = Date.now();
        const timeoutMs = this.config.shiprocket.syncWaitMinutes * 60 * 1000;
        const pollIntervalMs = 60 * 1000; // Poll every 1 minute
        let timedOut = false;

        while (missingSkus.length > 0 && !timedOut) {
          const elapsedMin = Math.round((Date.now() - startTime) / (60 * 1000));
          logger.info(`[Elapsed ${elapsedMin} min] Waiting for ${missingSkus.length} SKU(s) to sync to Shiprocket...`);
          
          if (Date.now() - startTime >= timeoutMs) {
            timedOut = true;
            break;
          }

          await new Promise(r => setTimeout(r, pollIntervalMs));
          
          shiprocketProducts = await shiprocketClient.fetchAllProducts();
          shiprocketSkus = new Set(shiprocketProducts.map(p => p.sku));
          missingSkus = getMissingSkus();
        }

        if (timedOut) {
          logger.warn(`Sync polling timed out after ${this.config.shiprocket.syncWaitMinutes} minutes. Proceeding with available SKUs.`);
          for (const sku of missingSkus) {
            unresolvedSyncSkus.add(sku);
          }
        } else {
          logger.info('All Shopify SKUs are now present in Shiprocket.');
        }
      }

      // Record pre-update correct states
      const preUpdateCorrect = new Set<string>();
      for (const p of shiprocketProducts) {
        if (p.sku && shopifySkus.has(p.sku)) {
          const length = parseFloat(String(p.length || '0'));
          const breadth = parseFloat(String(p.breadth || '0'));
          const height = parseFloat(String(p.height || '0'));
          const weight = parseFloat(String(p.weight || '0'));

          const matchesLength = Math.abs(length - this.config.universal.lengthCm) < 0.01;
          const matchesBreadth = Math.abs(breadth - this.config.universal.breadthCm) < 0.01;
          const matchesHeight = Math.abs(height - this.config.universal.heightCm) < 0.01;
          const matchesWeight = Math.abs(weight - this.config.universal.weightKg) < 0.005;

          if (matchesLength && matchesBreadth && matchesHeight && matchesWeight) {
            preUpdateCorrect.add(p.sku);
          }
        }
      }

      // 4. Download Export CSV via Playwright
      const downloadedCsvPath = await automation.downloadChannelProductsCsv();

      // 5. Transform CSV
      const transformResult = transformer.transform(
        downloadedCsvPath,
        shopifySkus,
        this.config.universal
      );

      logger.info(`CSV transformation completed: ${transformResult.updatedRows} row(s) updated, ${transformResult.skippedRows} row(s) skipped.`);

      if (transformResult.updatedRows === 0) {
        logger.info('All Shopify product dimensions are already correct in downloaded catalog. No upload needed.');
        
        const finalResults = verifier.verify(
          shopifyVariants,
          shiprocketProducts,
          this.config.universal,
          preUpdateCorrect,
          unresolvedSyncSkus
        );
        verifier.logReport(finalResults);
        process.exit(0);
      }

      // 6. Upload CSV via Playwright
      if (applyUpdates) {
        const uploadSuccess = await automation.uploadChannelProductsCsv(transformResult.outputPath);
        if (!uploadSuccess) {
          throw new Error('Playwright CSV upload failed.');
        }
        logger.info('CSV upload accepted. Waiting 15 seconds for backend processing...');
        await new Promise(r => setTimeout(r, 15000));

        // 7. Verify post-upload
        logger.info('Refetching Shiprocket products to verify update...');
        const finalProducts = await shiprocketClient.fetchAllProducts();

        const finalResults = verifier.verify(
          shopifyVariants,
          finalProducts,
          this.config.universal,
          preUpdateCorrect,
          unresolvedSyncSkus
        );

        verifier.logReport(finalResults);

        const failedSkus = finalResults.filter(r => r.status === 'verification_failed');
        if (failedSkus.length > 0) {
          logger.error(`Verification Mismatch: ${failedSkus.length} SKU(s) could not be verified.`);
          process.exit(1);
        } else {
          logger.info('Sync succeeded: Updated SKUs are verified in Shiprocket.');
          process.exit(0);
        }
      } else {
        logger.info(`CSV file is prepared. File path: file://${transformResult.outputPath}`);
        logger.info('Dry run sync completed. No upload executed.');
        process.exit(0);
      }
    } catch (err) {
      logger.error(`Sync failed: ${(err as Error).message}`);
      process.exit(1);
    }
  }

  /**
   * CLI Action: verify
   */
  public async verifyOnly() {
    if (!this.isConfigLoaded) {
      process.exit(1);
    }

    logger.info('Running sync verification check...');

    try {
      const shopifyClient = new ShopifyClient(this.config.shopify);
      const shiprocketClient = new ShiprocketClient(this.config.shiprocket);
      const verifier = new Verifier();

      const shopifyVariants = await shopifyClient.fetchActiveVariants();
      const shiprocketProducts = await shiprocketClient.fetchAllProducts();

      const preUpdateCorrect = new Set(shopifyVariants.map(v => v.sku));

      const results = verifier.verify(
        shopifyVariants,
        shiprocketProducts,
        this.config.universal,
        preUpdateCorrect
      );

      verifier.logReport(results);

      const failedSkus = results.filter(r => r.status === 'verification_failed');
      if (failedSkus.length > 0) {
        logger.error(`Verification: ${failedSkus.length} SKU(s) do not match universal dimensions.`);
        process.exit(1);
      } else {
        logger.info('Verification check: All active Shopify SKUs match universal dimensions in Shiprocket.');
        process.exit(0);
      }
    } catch (err) {
      logger.error(`Verification command failed: ${(err as Error).message}`);
      process.exit(1);
    }
  }

  /**
   * Commander CLI parse.
   */
  public async main() {
    const program = new Command();

    program
      .name('shopify-shiprocket-dimension-sync')
      .description('Sync Shopify product variant SKUs to Shiprocket and apply universal dimensions')
      .version('1.0.0');

    program
      .command('setup')
      .description('Launch browser context to manually authenticate and save Shiprocket session state')
      .action(async () => {
        await this.setup();
      });

    program
      .command('test-shopify')
      .description('Run read-only connection check with Shopify Admin GQL API')
      .action(async () => {
        await this.testShopify();
      });

    program
      .command('test-shiprocket')
      .description('Run read-only API check with Shiprocket REST API')
      .action(async () => {
        await this.testShiprocket();
      });

    program
      .command('dry-run')
      .description('Simulate product pulls and compare dimensions')
      .action(async () => {
        await this.dryRun();
      });

    program
      .command('sync')
      .description('Synchronize products and configure dimensions')
      .option('--sku <sku>', 'Restrict synchronization to exactly one SKU (e.g. TEST-SKU or custom SKU)')
      .option('--apply', 'Upload prepared CSV back to Shiprocket (performs real sync for single SKU)')
      .option('--apply-all', 'Perform real sync upload for all products')
      .action(async (options) => {
        await this.sync(options);
      });

    program
      .command('verify')
      .description('Verify dimensions match without executing CSV transfers')
      .action(async () => {
        await this.verifyOnly();
      });

    try {
      await program.parseAsync(process.argv);
    } catch (err) {
      console.error(`CLI execution failed: ${(err as Error).message}`);
      process.exit(1);
    }
  }
}

if (require.main === module) {
  new CliApp().main();
}
