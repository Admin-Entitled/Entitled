import { chromium, BrowserContext, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from './logger';
import { AppConfig } from './config';

export class BrowserAutomation {
  private config: AppConfig;
  private profileDir: string;
  private downloadsDir: string;

  constructor(config: AppConfig) {
    this.config = config;
    this.profileDir = path.resolve(__dirname, '../browser-profile');
    this.downloadsDir = path.resolve(__dirname, '../downloads');
    this.ensureDirs();
  }

  private ensureDirs() {
    if (!fs.existsSync(this.profileDir)) {
      fs.mkdirSync(this.profileDir, { recursive: true });
    }
    if (!fs.existsSync(this.downloadsDir)) {
      fs.mkdirSync(this.downloadsDir, { recursive: true });
    }
  }

  /**
   * Helper to launch persistent browser context.
   */
  private async launchContext(forceHeadless = false): Promise<{ context: BrowserContext; page: Page }> {
    const isHeadless = forceHeadless || this.config.headless;
    logger.info(`Launching browser (headless: ${isHeadless})...`);

    const context = await chromium.launchPersistentContext(this.profileDir, {
      headless: isHeadless,
      viewport: { width: 1280, height: 800 },
      acceptDownloads: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();
    return { context, page };
  }

  /**
   * CLI: npm run setup
   * Opens the browser, navigates to login, and waits for the user to complete login + OTP.
   */
  public async setupSession(): Promise<boolean> {
    logger.info('Starting manual session setup...');
    
    // Always launch in visual (non-headless) mode for setup
    const { context, page } = await this.launchContext(false);
    
    try {
      await page.goto('https://app.shiprocket.in/login');
      logger.info('Browser opened to Shiprocket login. Please log in manually and complete OTP verification.');

      let loggedIn = false;
      const timeoutSec = 300; // 5 minutes timeout

      for (let i = 0; i < timeoutSec; i++) {
        const url = page.url();
        
        // Detect login success indicators
        const hasDashboardUrl = url.includes('/dashboard') || url.includes('/home') || url.includes('/seller/');
        const hasDashboardElements = await page.locator('.sidebar, #dashboard, .dashboard-wrapper, a[href*="logout"]').count() > 0;

        if (hasDashboardUrl || hasDashboardElements) {
          loggedIn = true;
          break;
        }

        // Check if page was closed by the user
        if (page.isClosed()) {
          logger.warn('Browser window was closed before login verification.');
          break;
        }

        await new Promise((r) => setTimeout(r, 1000));
      }

      if (loggedIn) {
        logger.info('Login successfully verified. Saving persistent session cookies and states...');
        // Let it rest for a few seconds to write state
        await new Promise((r) => setTimeout(r, 3000));
        await context.close();
        logger.info('Setup successful. Persistent profile created in browser-profile/.');
        return true;
      } else {
        logger.error('Session setup timed out or failed. Please try again.');
        await context.close();
        return false;
      }
    } catch (err) {
      logger.error(`Error during manual setup: ${(err as Error).message}`);
      try { await context.close(); } catch {}
      return false;
    }
  }

  /**
   * Navigates to integrations/channels page and triggers product sync from Shopify.
   */
  public async syncChannelCatalogue(): Promise<void> {
    logger.info('Attempting to trigger product catalogue sync via Shiprocket UI...');
    const { context, page } = await this.launchContext();

    try {
      // Check if logged in (redirects to login if not)
      await page.goto('https://app.shiprocket.in/seller/channels');
      await page.waitForTimeout(5000);

      const currentUrl = page.url();
      if (currentUrl.includes('/login')) {
        throw new Error('Not logged in. Please run "npm run setup" first to authenticate.');
      }

      logger.info('Navigated to Channels integration dashboard.');

      // Find the Shopify channel box/row
      // Look for text matching configured channel (default: Shopify)
      const channelName = this.config.shiprocket.channelName;
      logger.info(`Searching for channel "${channelName}"...`);
      
      const channelCard = page.locator(`.channel-card, .channel-box, tr`, { hasText: channelName });
      
      if (await channelCard.count() > 0) {
        // Look for edit/configure or sync button
        const syncButton = channelCard.locator('button:has-text("Sync"), button:has-text("Pull"), .sync-btn');
        if (await syncButton.count() > 0) {
          logger.info('Triggering sync button click...');
          await syncButton.first().click();
          logger.info('Catalogue sync triggered. Waiting 10 seconds for initial webhook processing...');
          await page.waitForTimeout(10000);
        } else {
          logger.warn(`Could not locate Sync button on channel row/card for ${channelName}. Skipping UI trigger.`);
        }
      } else {
        logger.warn(`Could not locate channel card for ${channelName}. Attempting fallback menu sync...`);
        // Fallback: Click on configure or go directly to sync URL if known
        await page.goto('https://app.shiprocket.in/seller/channels/shopify'); // common structure
        await page.waitForTimeout(5000);
        const pullBtn = page.locator('button:has-text("Pull Products"), button:has-text("Sync Products"), .pull-products');
        if (await pullBtn.count() > 0) {
          await pullBtn.first().click();
          logger.info('Catalogue sync triggered on configure page.');
          await page.waitForTimeout(10000);
        } else {
          logger.info('No pull products button found. Assuming automatic sync is configured.');
        }
      }

      await context.close();
    } catch (err) {
      logger.error(`Error during Channel Sync: ${(err as Error).message}`);
      try { await context.close(); } catch {}
      throw err;
    }
  }

  /**
   * Navigates to Channel Products, filters by Shopify, and downloads the current product CSV.
   */
  public async downloadChannelProductsCsv(): Promise<string> {
    logger.info('Downloading Channel Products CSV from Shiprocket...');
    const { context, page } = await this.launchContext();

    try {
      // Go directly to Channel Products panel
      await page.goto('https://app.shiprocket.in/seller/products/channel');
      await page.waitForTimeout(5000);

      if (page.url().includes('/login')) {
        throw new Error('Not logged in. Please run "npm run setup" first to authenticate.');
      }

      // 1. Select the configured Shopify channel from the filter dropdown
      // Look for a channel dropdown element
      logger.info('Filtering products by configured Shopify channel...');
      const channelSelect = page.locator('select[name="channel"], .channel-select, [data-testid="channel-filter"]');
      if (await channelSelect.count() > 0) {
        await channelSelect.selectOption({ label: this.config.shiprocket.channelName });
        await page.waitForTimeout(3000);
      } else {
        // Fallback: Try clicking on dropdown wrapper and selecting option
        const dropdown = page.locator('.select-channel-dropdown, [class*="select-channel"]');
        if (await dropdown.count() > 0) {
          await dropdown.click();
          await page.waitForTimeout(1000);
          await page.locator(`li:has-text("${this.config.shiprocket.channelName}")`).click();
          await page.waitForTimeout(3000);
        } else {
          logger.warn('Could not locate select channel dropdown filter. Downloading default channel export...');
        }
      }

      // 2. Click Export/Download button to trigger download
      logger.info('Triggering export download...');
      const exportButton = page.locator('button:has-text("Export"), button:has-text("Download"), .export-btn, [data-testid="export-products"]');
      
      if (await exportButton.count() === 0) {
        throw new Error('Could not find Export/Download button on the Channel Products page.');
      }

      const [download] = await Promise.all([
        page.waitForEvent('download'),
        exportButton.first().click()
      ]);

      const downloadPath = path.join(this.downloadsDir, 'shiprocket-channel-products-raw.csv');
      
      // Delete existing to prevent collisions
      if (fs.existsSync(downloadPath)) {
        fs.unlinkSync(downloadPath);
      }

      await download.saveAs(downloadPath);
      logger.info(`CSV downloaded successfully to: file://${downloadPath}`);
      
      await context.close();
      return downloadPath;
    } catch (err) {
      logger.error(`Error downloading CSV: ${(err as Error).message}`);
      try { await context.close(); } catch {}
      throw err;
    }
  }

  /**
   * Uploads the modified CSV file through Shiprocket's bulk products upload workflow.
   */
  public async uploadChannelProductsCsv(csvPath: string): Promise<boolean> {
    logger.info(`Uploading updated CSV file: file://${csvPath}...`);
    const { context, page } = await this.launchContext();

    try {
      await page.goto('https://app.shiprocket.in/seller/products/channel');
      await page.waitForTimeout(5000);

      if (page.url().includes('/login')) {
        throw new Error('Not authenticated. Please run "npm run setup" first.');
      }

      // 1. Locate and click Import/Upload button
      logger.info('Locating Import/Upload trigger button...');
      const importButton = page.locator('button:has-text("Import"), button:has-text("Upload"), .import-btn, [data-testid="import-products"]');
      if (await importButton.count() === 0) {
        throw new Error('Could not find Import/Upload button on the Channel Products page.');
      }
      await importButton.first().click();
      await page.waitForTimeout(2000);

      // 2. Select file and submit
      logger.info('Selecting CSV file in uploader...');
      const fileInput = page.locator('input[type="file"], .file-input, [data-testid="file-upload"]');
      if (await fileInput.count() > 0) {
        await fileInput.setInputFiles(csvPath);
      } else {
        // Fallback using filechooser event listener
        const [fileChooser] = await Promise.all([
          page.waitForEvent('filechooser'),
          page.locator('.drag-drop-zone, .upload-container, .dropzone').click(),
        ]);
        await fileChooser.setFiles(csvPath);
      }

      await page.waitForTimeout(2000);

      // Click submit/upload button
      const submitBtn = page.locator('button:has-text("Submit"), button:has-text("Upload"), button:has-text("Process"), .submit-btn');
      if (await submitBtn.count() > 0) {
        logger.info('Clicking Submit button for uploader...');
        await submitBtn.first().click();
      } else {
        throw new Error('Could not find Submit button in the Upload modal/container.');
      }

      // 3. Wait for success notification or message
      logger.info('Waiting for upload status banner confirmation...');
      const successLocator = page.locator('.toast-success, .alert-success, :has-text("successfully"), :has-text("initiated"), :has-text("uploaded")');
      
      let uploadConfirmed = false;
      try {
        await successLocator.first().waitFor({ state: 'visible', timeout: 15000 });
        const successText = await successLocator.first().innerText();
        logger.info(`Upload Confirmation message: "${successText.trim()}"`);
        uploadConfirmed = true;
      } catch {
        logger.warn('Timeout waiting for standard success notification banner. Checking page state...');
        // Fallback: If uploader modal disappears, assume success
        const isModalVisible = await page.locator('.modal-dialog, .upload-modal').isVisible();
        if (!isModalVisible) {
          logger.info('Uploader modal is closed. Assuming upload was accepted.');
          uploadConfirmed = true;
        }
      }

      // Wait 10 seconds for backend processing to initiate
      logger.info('Waiting 10 seconds for backend file queue processing to run...');
      await page.waitForTimeout(10000);

      await context.close();
      return uploadConfirmed;
    } catch (err) {
      logger.error(`Error uploading CSV: ${(err as Error).message}`);
      try { await context.close(); } catch {}
      return false;
    }
  }
}
