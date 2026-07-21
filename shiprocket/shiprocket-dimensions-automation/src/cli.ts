import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import { loadChannelConfig, loadConfig, loadShopifyConfig, loadUniversalDimensions } from './config';
import { CsvProcessor, ImportSummary, InputInspection } from './csv-processor';
import { logger } from './logger';
import { ShopifyClient } from './shopify-client';
import { ShiprocketClient } from './shiprocket-client';

class CliApp {
  private csvProcessor = new CsvProcessor();

  public async runDoctor() {
    console.log('=== SHIPROCKET DIMENSIONS CSV DOCTOR ===\n');
    let hasErrors = false;

    const envPath = path.resolve(__dirname, '../.env');
    if (fs.existsSync(envPath)) {
      console.log(`OK .env exists: ${envPath}`);
    } else {
      console.log(`ERROR .env missing: ${envPath}`);
      hasErrors = true;
    }

    console.log('\nUniversal dimensions:');
    for (const name of ['UNIVERSAL_WEIGHT_KG', 'UNIVERSAL_LENGTH_CM', 'UNIVERSAL_BREADTH_CM', 'UNIVERSAL_HEIGHT_CM']) {
      const raw = process.env[name] || '';
      const value = Number(raw);
      if (!raw || Number.isNaN(value) || value <= 0) {
        console.log(`  ERROR ${name} must exist and be > 0. Current value: "${raw}"`);
        hasErrors = true;
      } else {
        console.log(`  OK ${name}=${raw}`);
      }
    }

    console.log('\nInput CSV:');
    const inspection = this.csvProcessor.inspectInput(this.csvProcessor.getDefaultInputPath(), process.env.TEST_SKU || '');
    this.printInspection(inspection, '  ');
    if (!inspection.exists) {
      hasErrors = true;
    } else {
      const columns = this.csvProcessor.detectColumns(inspection.headers || []);
      if (!columns.sku || !columns.weight || !columns.dimensions || !columns.channel) {
        console.log('  ERROR required CSV headers were not fully detected.');
        hasErrors = true;
      } else {
        console.log('  OK required CSV headers detected.');
      }
      if (process.env.TEST_SKU && !inspection.testSkuExists) {
        console.log('  WARN TEST_SKU is missing from the input CSV. prepare-csv will use the first available SKU as canary.');
      }
    }

    console.log('\nLatest success manifest:');
    const manifestPath = this.csvProcessor.getManifestPath();
    if (fs.existsSync(manifestPath)) {
      console.log(`  OK output/latest-success.json exists: ${manifestPath}`);
    } else {
      console.log(`  WARN output/latest-success.json is missing. Run prepare-csv before verify-csv.`);
    }

    console.log('\n========================================');
    if (hasErrors) {
      console.log('DOCTOR REPORT: One or more required checks failed.');
      process.exit(1);
    }
    console.log('DOCTOR REPORT: Required local checks passed.');
  }

  public async importLatestCsv(file?: string) {
    console.log('=== IMPORT LATEST SHIPROCKET CSV ===');
    try {
      const summary = this.csvProcessor.importLatestCsv({ file, testSku: process.env.TEST_SKU || '' });
      this.printImportSummary(summary);
    } catch (err: any) {
      console.error(`Import failed: ${err.message}`);
      process.exit(1);
    }
  }

  public async inspectInput() {
    console.log('=== INSPECT INPUT CSV ===');
    const inspection = this.csvProcessor.inspectInput(this.csvProcessor.getDefaultInputPath(), process.env.TEST_SKU || '');
    this.printInspection(inspection);
  }

  public async testShopify() {
    console.log('=== TEST SHOPIFY READ-ONLY CONNECTION ===');
    try {
      const config = loadConfig();
      const client = new ShopifyClient(config.shopify);
      const shopName = await client.getShopIdentity();
      console.log(`Connected to Shopify Shop: "${shopName}"`);

      const variants = await client.fetchActiveVariants();
      console.log(`Retrieved ${variants.length} active variants.`);
      for (const variant of variants.slice(0, 5)) {
        console.log(`  - SKU: "${variant.sku}" | Product: "${variant.productTitle}" | Variant: "${variant.variantTitle}"`);
      }
    } catch (err: any) {
      console.error(`Shopify test failed: ${err.message}`);
      process.exit(1);
    }
  }

  public async listChannels() {
    console.log('=== SHIPROCKET REGISTERED CHANNELS ===');
    try {
      const client = new ShiprocketClient();
      const channels = await client.fetchChannels();

      console.log('\nID       | Name                           | Code           | Status');
      console.log('---------|--------------------------------|----------------|--------');
      for (const channel of channels) {
        const id = String(channel.id).padEnd(8);
        const name = channel.name.padEnd(30).slice(0, 30);
        const code = channel.base_channel_code.padEnd(14);
        const status = channel.status === 1 ? 'ACTIVE' : 'INACTIVE';
        console.log(`${id} | ${name} | ${code} | ${status}`);
      }
      console.log();
    } catch (err: any) {
      console.error(`Failed to retrieve channels list: ${err.message}`);
      process.exit(1);
    }
  }

  public async prepareCsv() {
    console.log('=== RUN PREPARE-CSV WORKFLOW ===');
    try {
      const dimensions = loadUniversalDimensions();
      const channelConfig = loadChannelConfig();
      const shopifySkus = await this.fetchShopifySkusForReport();
      const inputCsvPath = this.csvProcessor.getDefaultInputPath();

      const summary = this.csvProcessor.prepareCsv(
        inputCsvPath,
        shopifySkus,
        dimensions,
        channelConfig,
        process.env.TEST_SKU || ''
      );

      console.log('\n--- PREPARE CSV SUMMARY ---');
      console.log(`Total CSV rows: ${summary.totalCsvRows}`);
      console.log(`Updated rows with non-empty SKU: ${summary.updatedRows}`);
      console.log(`Matching active Shopify SKUs: ${summary.matchedCount}`);
      console.log(`Shopify SKUs missing from CSV: ${summary.shopifyMissingFromCsv.length}`);
      console.log(`CSV SKUs missing from active Shopify: ${summary.csvMissingFromShopify.length}`);
      console.log(`Canary SKU: ${summary.canarySku}`);
      console.log(`Canary CSV: ${summary.canaryPath}`);
      console.log(`Full output CSV: ${summary.outputPath}`);
      console.log(`Comparison log CSV: ${summary.comparisonLogPath}`);
      console.log('\nUpload the canary CSV first. If Shiprocket accepts it, upload the full output CSV.');
    } catch (err: any) {
      console.error(`Prepare CSV failed: ${err.message}`);
      process.exit(1);
    }
  }

  public async verifyCsv() {
    console.log('=== RUN VERIFY-CSV WORKFLOW ===');
    try {
      this.csvProcessor.verifyCsv();
      console.log('\nLOCAL VERIFICATION PASSED.');
    } catch (err: any) {
      console.error(`Verification failed: ${err.message}`);
      process.exit(1);
    }
  }

  public async quickChannelTest() {
    console.log('=== GENERATE QUICK CHANNEL TEST CSVS ===');
    try {
      const dimensions = loadUniversalDimensions();
      const summary = this.csvProcessor.generateQuickChannelTest(
        this.csvProcessor.getDefaultInputPath(),
        dimensions,
        process.env.TEST_SKU || ''
      );

      console.log(`Canary SKU: ${summary.sku}`);
      console.log(`Output directory: ${summary.outputDir}`);
      for (const file of summary.files) {
        console.log(`${file.path} -> *Channel Name="${file.channelName}"`);
      }
      console.log('\nUpload these files one at a time to identify the accepted Shiprocket channel name.');
    } catch (err: any) {
      console.error(`Quick channel test failed: ${err.message}`);
      process.exit(1);
    }
  }

  public async main() {
    const program = new Command();
    program
      .name('shiprocket-bulk-processor')
      .description('Shiprocket Channel Products dimensions CSV processor')
      .version('4.0.0');

    program
      .command('import-latest-csv')
      .description('Find the newest Shiprocket Channel Products CSV and copy it into input/')
      .option('--file <path>', 'Import a specific CSV file by path')
      .action((options: { file?: string }) => this.importLatestCsv(options.file));

    program
      .command('inspect-input')
      .description('Inspect input/shiprocket-channel-products.csv without modifying it')
      .action(() => this.inspectInput());

    program
      .command('prepare-csv')
      .description('Generate canary and full updated Shiprocket CSV files')
      .action(() => this.prepareCsv());

    program
      .command('verify-csv')
      .description('Verify output/latest-success.json and its referenced CSV files')
      .action(() => this.verifyCsv());

    program
      .command('quick-channel-test')
      .description('Generate three one-row canary CSVs with different channel names')
      .action(() => this.quickChannelTest());

    program
      .command('doctor')
      .description('Check local env, dimensions, input CSV headers, TEST_SKU, and manifest status')
      .action(() => this.runDoctor());

    program
      .command('test-shopify')
      .description('Test active product variants fetch from Shopify')
      .action(() => this.testShopify());

    program
      .command('channels')
      .description('Print registered Sales Channels from Shiprocket')
      .action(() => this.listChannels());

    try {
      await program.parseAsync(process.argv);
    } catch (err: any) {
      console.error(`CLI execution failed: ${err.message}`);
      process.exit(1);
    }
  }

  private async fetchShopifySkusForReport(): Promise<Set<string>> {
    let shopifyConfig;
    try {
      shopifyConfig = loadShopifyConfig();
    } catch (err: any) {
      logger.warn(`Skipping Shopify SKU comparison: ${err.message}`);
      return new Set();
    }

    try {
      logger.info('Fetching Shopify product variants for informational comparison...');
      const shopifyClient = new ShopifyClient(shopifyConfig);
      const shopifyVariants = await shopifyClient.fetchActiveVariants();
      return new Set(shopifyVariants.map((variant) => variant.sku.trim()).filter(Boolean));
    } catch (err: any) {
      logger.warn(`Skipping Shopify SKU comparison because Shopify fetch failed: ${err.message}`);
      return new Set();
    }
  }

  private printImportSummary(summary: ImportSummary): void {
    console.log(`Selected source path: ${summary.sourcePath}`);
    console.log(`Destination path: ${summary.destinationPath}`);
    console.log(`Modified time: ${summary.modifiedTime}`);
    console.log(`Line count: ${summary.lineCount}`);
    console.log(`Product row count: ${summary.productRowCount}`);
    console.log(`Headers: ${summary.headers.join(' | ')}`);
    console.log(`First 5 SKUs: ${summary.firstSkus.join(', ') || '(none)'}`);
    console.log(`TEST_SKU exists: ${summary.testSkuExists ? 'yes' : 'no'}`);
    if (summary.backupPath) {
      console.log(`Backup path: ${summary.backupPath}`);
    }
  }

  private printInspection(inspection: InputInspection, indent = ''): void {
    console.log(`${indent}File exists: ${inspection.exists ? 'yes' : 'no'}`);
    console.log(`${indent}Absolute path: ${inspection.absolutePath}`);
    if (!inspection.exists) {
      for (const warning of inspection.warnings) {
        console.log(`${indent}WARN ${warning}`);
      }
      return;
    }

    console.log(`${indent}File size: ${inspection.fileSizeBytes} bytes`);
    console.log(`${indent}Modified time: ${inspection.modifiedTime}`);
    console.log(`${indent}Physical line count: ${inspection.physicalLineCount}`);
    console.log(`${indent}Parsed row count: ${inspection.parsedRowCount}`);
    console.log(`${indent}Headers: ${(inspection.headers || []).join(' | ')}`);
    console.log(`${indent}Detected delimiter: ${inspection.detectedDelimiter}`);
    console.log(`${indent}Detected SKU column: ${inspection.skuColumn || '(not detected)'}`);
    console.log(`${indent}First 10 SKUs: ${(inspection.firstSkus || []).join(', ') || '(none)'}`);
    console.log(`${indent}Sample Weight values: ${(inspection.sampleWeightValues || []).join(', ') || '(none)'}`);
    console.log(`${indent}Sample Dimensions values: ${(inspection.sampleDimensionsValues || []).join(', ') || '(none)'}`);
    console.log(`${indent}Sample Channel Name values: ${(inspection.sampleChannelNameValues || []).join(', ') || '(none)'}`);
    console.log(`${indent}TEST_SKU exists: ${inspection.testSkuExists ? 'yes' : 'no'}`);
    for (const warning of inspection.warnings) {
      console.log(`${indent}WARN ${warning}`);
    }
  }
}

if (require.main === module) {
  new CliApp().main();
}
