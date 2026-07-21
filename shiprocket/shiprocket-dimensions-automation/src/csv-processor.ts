import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as Papa from 'papaparse';
import { ChannelConfig, UniversalDimensions } from './config';
import { logger } from './logger';

const SKU_HEADER_PRIORITY = ['*SKU Code', 'SKU Code', 'Channel SKU Code', 'Master SKU Code', 'SKU'];
const WEIGHT_HEADER_PRIORITY = ['Weight', 'Weight (kg)', 'Weight (kgs)'];
const DIMENSIONS_HEADER_PRIORITY = ['Dimensions', 'Dimension', 'Package Dimensions'];
const CHANNEL_HEADER_PRIORITY = ['*Channel Name', 'Channel Name'];
const SEARCH_SKIP_DIRS = new Set(['.git', '.cache', '.agents', '.codex', 'node_modules', 'dist', 'coverage', 'output', 'backups']);

export interface ProcessSummary {
  totalCsvRows: number;
  matchedCount: number;
  updatedRows: number;
  shopifyMissingFromCsv: string[];
  csvMissingFromShopify: string[];
  outputPath: string;
  canaryPath: string;
  canarySku: string;
  comparisonLogPath: string;
}

export interface LatestSuccessManifest {
  inputPath: string;
  outputPath: string;
  canaryPath: string;
  inputSha256: string;
  outputSha256: string;
  inputRowCount: number;
  outputRowCount: number;
  updatedRowCount: number;
  canarySku: string;
  weightUsed: string;
  dimensionsUsed: string;
  timestamp: string;
  forceChannelName: boolean;
  shiprocketChannelName: string;
  shiprocketUploadChannelName: string;
}

export interface QuickChannelTestSummary {
  sku: string;
  outputDir: string;
  files: Array<{
    label: string;
    channelName: string;
    path: string;
  }>;
}

export interface ImportLatestCsvOptions {
  file?: string;
  searchRoots?: string[];
  destinationPath?: string;
  testSku?: string;
}

export interface ImportSummary {
  sourcePath: string;
  destinationPath: string;
  modifiedTime: string;
  lineCount: number;
  productRowCount: number;
  headers: string[];
  firstSkus: string[];
  testSkuExists: boolean;
  backupPath?: string;
}

export interface InputInspection {
  exists: boolean;
  absolutePath: string;
  fileSizeBytes?: number;
  modifiedTime?: string;
  physicalLineCount?: number;
  parsedRowCount?: number;
  headers?: string[];
  detectedDelimiter?: string;
  skuColumn?: string;
  firstSkus?: string[];
  sampleWeightValues?: string[];
  sampleDimensionsValues?: string[];
  sampleChannelNameValues?: string[];
  testSkuExists?: boolean;
  warnings: string[];
}

interface CsvProcessorOptions {
  projectRoot?: string;
}

interface ParsedCsv {
  rows: string[][];
  headers: string[];
  delimiter: string;
}

interface DetectedColumn {
  index: number;
  header: string;
}

interface DetectedColumns {
  sku: DetectedColumn | null;
  weight: DetectedColumn | null;
  dimensions: DetectedColumn | null;
  channel: DetectedColumn | null;
}

interface ResolvedColumns {
  sku: DetectedColumn;
  weight: DetectedColumn;
  dimensions: DetectedColumn;
  channel: DetectedColumn;
}

interface CsvCandidate {
  path: string;
  mtimeMs: number;
  mtime: Date;
}

interface VerificationContext {
  dimensions: UniversalDimensions;
  channelConfig: ChannelConfig;
  targetWeight: string;
  targetDimensions: string;
}

export class CsvProcessor {
  private projectRoot: string;
  private backupsDir: string;
  private outputDir: string;
  private inputPath: string;
  private manifestPath: string;

  constructor(options: CsvProcessorOptions = {}) {
    this.projectRoot = options.projectRoot || path.resolve(__dirname, '..');
    this.backupsDir = path.join(this.projectRoot, 'backups');
    this.outputDir = path.join(this.projectRoot, 'output');
    this.inputPath = path.join(this.projectRoot, 'input/shiprocket-channel-products.csv');
    this.manifestPath = path.join(this.outputDir, 'latest-success.json');

    fs.mkdirSync(this.backupsDir, { recursive: true });
    fs.mkdirSync(this.outputDir, { recursive: true });
    fs.mkdirSync(path.dirname(this.inputPath), { recursive: true });
  }

  public getDefaultInputPath(): string {
    return this.inputPath;
  }

  public getManifestPath(): string {
    return this.manifestPath;
  }

  public getDefaultSearchRoots(): string[] {
    const home = os.homedir();
    return [
      path.join(home, 'Downloads'),
      path.join(home, 'Desktop'),
      this.projectRoot,
    ];
  }

  public calculateHash(filePath: string): string {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  public inspectInput(inputPath = this.inputPath, testSku = process.env.TEST_SKU || ''): InputInspection {
    const absolutePath = path.resolve(inputPath);
    const warnings: string[] = [];

    if (!fs.existsSync(absolutePath)) {
      return {
        exists: false,
        absolutePath,
        warnings: [`Input CSV is missing at ${absolutePath}`],
      };
    }

    const stat = fs.statSync(absolutePath);
    const content = fs.readFileSync(absolutePath, 'utf8');
    const parsed = this.parseCsvContent(content);
    const columns = this.detectColumns(parsed.headers);

    if (!columns.sku) warnings.push(`SKU column not detected. Headers found: [${parsed.headers.join(', ')}]`);
    if (!columns.weight) warnings.push('Weight column not detected.');
    if (!columns.dimensions) warnings.push('Dimensions column not detected.');
    if (!columns.channel) warnings.push('Channel Name column not detected.');

    const firstSkus = columns.sku ? this.firstNonEmptyValues(parsed.rows.slice(1), columns.sku.index, 10) : [];
    const normalizedTestSku = this.normalizeSkuValue(testSku);
    const testSkuExists = normalizedTestSku !== '' && firstSkus.length > 0
      ? this.hasSku(parsed.rows.slice(1), columns.sku?.index ?? -1, normalizedTestSku)
      : false;

    if (normalizedTestSku !== '' && !testSkuExists) {
      warnings.push(`TEST_SKU "${normalizedTestSku}" was not found in input CSV.`);
    }

    return {
      exists: true,
      absolutePath,
      fileSizeBytes: stat.size,
      modifiedTime: stat.mtime.toISOString(),
      physicalLineCount: this.countPhysicalLines(content),
      parsedRowCount: Math.max(parsed.rows.length - 1, 0),
      headers: parsed.headers,
      detectedDelimiter: parsed.delimiter,
      skuColumn: columns.sku?.header,
      firstSkus,
      sampleWeightValues: columns.weight ? this.firstValues(parsed.rows.slice(1), columns.weight.index, 5) : [],
      sampleDimensionsValues: columns.dimensions ? this.firstValues(parsed.rows.slice(1), columns.dimensions.index, 5) : [],
      sampleChannelNameValues: columns.channel ? this.firstValues(parsed.rows.slice(1), columns.channel.index, 5) : [],
      testSkuExists,
      warnings,
    };
  }

  public importLatestCsv(options: ImportLatestCsvOptions = {}): ImportSummary {
    const destinationPath = path.resolve(options.destinationPath || this.inputPath);
    const sourcePath = options.file
      ? this.resolveManualImportSource(options.file)
      : this.findNewestImportCandidate(options.searchRoots || this.getDefaultSearchRoots(), destinationPath);

    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.mkdirSync(this.backupsDir, { recursive: true });

    let backupPath: string | undefined;
    if (fs.existsSync(destinationPath)) {
      const backupName = `input-before-import-${this.createTimestamp()}.csv`;
      backupPath = this.uniquePath(path.join(this.backupsDir, backupName));
      fs.copyFileSync(destinationPath, backupPath);
    }

    if (path.resolve(sourcePath) !== destinationPath) {
      fs.copyFileSync(sourcePath, destinationPath);
    }

    const stat = fs.statSync(sourcePath);
    const content = fs.readFileSync(destinationPath, 'utf8');
    const parsed = this.parseCsvContent(content);
    const columns = this.detectColumns(parsed.headers);
    const firstSkus = columns.sku ? this.firstNonEmptyValues(parsed.rows.slice(1), columns.sku.index, 5) : [];
    const normalizedTestSku = this.normalizeSkuValue(options.testSku || process.env.TEST_SKU || '');

    return {
      sourcePath: path.resolve(sourcePath),
      destinationPath,
      modifiedTime: stat.mtime.toISOString(),
      lineCount: this.countPhysicalLines(content),
      productRowCount: Math.max(parsed.rows.length - 1, 0),
      headers: parsed.headers,
      firstSkus,
      testSkuExists: normalizedTestSku !== '' && columns.sku
        ? this.hasSku(parsed.rows.slice(1), columns.sku.index, normalizedTestSku)
        : false,
      backupPath,
    };
  }

  public prepareCsv(
    inputPath: string,
    shopifySkus: Set<string>,
    dimensions: UniversalDimensions,
    channelConfig: ChannelConfig,
    testSku = process.env.TEST_SKU || ''
  ): ProcessSummary {
    const resolvedInputPath = path.resolve(inputPath);
    logger.info(`Starting CSV preparation for input: ${resolvedInputPath}`);

    if (!fs.existsSync(resolvedInputPath)) {
      throw new Error(`Input CSV file not found at: ${resolvedInputPath}`);
    }

    const inputContent = fs.readFileSync(resolvedInputPath, 'utf8');
    const parsed = this.parseCsvContent(inputContent);
    if (parsed.rows.length === 0 || parsed.headers.length === 0) {
      throw new Error('Input CSV is empty.');
    }

    const columns = this.requireColumns(parsed.headers);
    const timestamp = this.createTimestamp();
    const backupPath = path.join(this.backupsDir, `shiprocket-channel-products-${timestamp}.csv`);
    fs.copyFileSync(resolvedInputPath, backupPath);
    logger.info(`Backup created at: ${backupPath}`);

    const outputRows = parsed.rows.map((row) => [...row]);
    this.normalizeRowsToHeaderWidth(outputRows, parsed.headers.length);

    const validSkuRows: Array<{ rowIndex: number; sku: string }> = [];
    for (let i = 1; i < outputRows.length; i++) {
      const sku = this.normalizeSkuValue(outputRows[i][columns.sku.index] || '');
      if (sku !== '') {
        validSkuRows.push({ rowIndex: i, sku });
      }
    }

    if (validSkuRows.length === 0) {
      throw new Error('No valid non-empty SKUs were found in the input CSV.');
    }

    const csvSkusSet = new Set(validSkuRows.map((row) => row.sku));
    const comparison = this.compareShopifySkus(shopifySkus, csvSkusSet);
    const comparisonLogPath = this.writeSkuComparisonLog(timestamp, shopifySkus, csvSkusSet, comparison);
    const canary = this.selectCanaryRow(validSkuRows, testSku);
    const targetWeight = String(dimensions.weightKg);
    const targetDimensions = this.formatDimensions(dimensions);
    const uploadChannelName = channelConfig.shiprocketUploadChannelName.trim();

    if (uploadChannelName !== '') {
      console.log(`Using upload channel name: "${uploadChannelName}"`);
    }

    for (let i = 1; i < outputRows.length; i++) {
      if (uploadChannelName !== '') {
        outputRows[i][columns.channel.index] = uploadChannelName;
      }
    }

    let updatedRows = 0;
    for (const { rowIndex, sku } of validSkuRows) {
      const row = outputRows[rowIndex];
      if (uploadChannelName === '') {
        row[columns.channel.index] = this.resolveChannelValue(row[columns.channel.index] || '', channelConfig, rowIndex + 1, sku);
      }
      row[columns.weight.index] = targetWeight;
      row[columns.dimensions.index] = targetDimensions;
      updatedRows++;
    }

    const canaryRow = outputRows[canary.rowIndex];
    const canaryPath = path.join(this.outputDir, 'shiprocket-channel-products-canary.csv');
    fs.writeFileSync(canaryPath, this.unparseCsv([parsed.headers, canaryRow]), 'utf8');
    logger.info(`Canary CSV written to: ${canaryPath}`);

    const outputPath = path.join(this.outputDir, `shiprocket-channel-products-updated-${timestamp}.csv`);
    fs.writeFileSync(outputPath, this.unparseCsv(outputRows), 'utf8');
    logger.info(`Full updated CSV written to: ${outputPath}`);

    const verificationContext: VerificationContext = {
      dimensions,
      channelConfig,
      targetWeight,
      targetDimensions,
    };
    this.verifyPreparedFiles(resolvedInputPath, outputPath, canaryPath, canary.sku, verificationContext);

    const manifest: LatestSuccessManifest = {
      inputPath: resolvedInputPath,
      outputPath,
      canaryPath,
      inputSha256: this.calculateHash(resolvedInputPath),
      outputSha256: this.calculateHash(outputPath),
      inputRowCount: Math.max(parsed.rows.length - 1, 0),
      outputRowCount: Math.max(this.parseCsvFile(outputPath).rows.length - 1, 0),
      updatedRowCount: updatedRows,
      canarySku: canary.sku,
      weightUsed: targetWeight,
      dimensionsUsed: targetDimensions,
      timestamp: new Date().toISOString(),
      forceChannelName: channelConfig.forceChannelName,
      shiprocketChannelName: channelConfig.shiprocketChannelName,
      shiprocketUploadChannelName: channelConfig.shiprocketUploadChannelName,
    };

    fs.writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    logger.info(`Successful manifest written to: ${this.manifestPath}`);

    return {
      totalCsvRows: Math.max(parsed.rows.length - 1, 0),
      matchedCount: comparison.matchedCount,
      updatedRows,
      shopifyMissingFromCsv: comparison.shopifyMissingFromCsv,
      csvMissingFromShopify: comparison.csvMissingFromShopify,
      outputPath,
      canaryPath,
      canarySku: canary.sku,
      comparisonLogPath,
    };
  }

  public verifyCsv(): void {
    logger.info(`Starting manifest verification checks using: ${this.manifestPath}`);

    if (!fs.existsSync(this.manifestPath)) {
      throw new Error(`Verification FAILED: No successful prepare-csv manifest found at ${this.manifestPath}. Please run preparation first.`);
    }

    const manifest = this.readManifest();
    this.validateManifest(manifest);

    if (!fs.existsSync(manifest.inputPath)) {
      throw new Error(`Verification FAILED: Input file referenced in manifest is missing at: ${manifest.inputPath}`);
    }
    if (!fs.existsSync(manifest.outputPath)) {
      throw new Error(`Verification FAILED: Output CSV file referenced in manifest is missing at: ${manifest.outputPath}`);
    }
    if (!fs.existsSync(manifest.canaryPath)) {
      throw new Error(`Verification FAILED: Canary CSV file referenced in manifest is missing at: ${manifest.canaryPath}`);
    }

    const currentInputHash = this.calculateHash(manifest.inputPath);
    if (currentInputHash !== manifest.inputSha256) {
      throw new Error(`Verification FAILED: Input file has been modified after output generation. Expected input SHA256 ${manifest.inputSha256}, actual ${currentInputHash}`);
    }

    const currentOutputHash = this.calculateHash(manifest.outputPath);
    if (currentOutputHash !== manifest.outputSha256) {
      throw new Error(`Verification FAILED: Output file has been modified after manifest creation. Expected output SHA256 ${manifest.outputSha256}, actual ${currentOutputHash}`);
    }

    const dimensions = this.parseManifestDimensions(manifest);
    const channelConfig: ChannelConfig = {
      forceChannelName: manifest.forceChannelName,
      shiprocketChannelName: manifest.shiprocketChannelName,
      shiprocketUploadChannelName: manifest.shiprocketUploadChannelName,
    };

    const verificationContext: VerificationContext = {
      dimensions,
      channelConfig,
      targetWeight: manifest.weightUsed,
      targetDimensions: manifest.dimensionsUsed,
    };

    const result = this.verifyPreparedFiles(
      manifest.inputPath,
      manifest.outputPath,
      manifest.canaryPath,
      manifest.canarySku,
      verificationContext
    );

    if (result.inputRowCount !== manifest.inputRowCount) {
      throw new Error(`Verification FAILED: Manifest input row count mismatch. Expected ${manifest.inputRowCount}, actual ${result.inputRowCount}`);
    }
    if (result.outputRowCount !== manifest.outputRowCount) {
      throw new Error(`Verification FAILED: Manifest output row count mismatch. Expected ${manifest.outputRowCount}, actual ${result.outputRowCount}`);
    }
    if (result.updatedRowCount !== manifest.updatedRowCount) {
      throw new Error(`Verification FAILED: Manifest updated row count mismatch. Expected ${manifest.updatedRowCount}, actual ${result.updatedRowCount}`);
    }

    logger.info(`Verification SUCCESS for output path: ${manifest.outputPath}`);
    console.log(`VERIFIED: Output has ${result.outputRowCount} product rows with identical headers and SKU values.`);
    console.log(`VERIFIED: ${result.updatedRowCount} non-empty SKU rows use Weight=${manifest.weightUsed} and Dimensions=${manifest.dimensionsUsed}.`);
    if (manifest.shiprocketUploadChannelName.trim() !== '') {
      console.log(`VERIFIED: Every data row channel equals "${manifest.shiprocketUploadChannelName.trim()}".`);
    }
    console.log(`VERIFIED: Canary CSV exists with one data row for SKU ${manifest.canarySku}.`);
  }

  public generateQuickChannelTest(
    inputPath: string,
    dimensions: UniversalDimensions,
    testSku = process.env.TEST_SKU || ''
  ): QuickChannelTestSummary {
    const resolvedInputPath = path.resolve(inputPath);
    if (!fs.existsSync(resolvedInputPath)) {
      throw new Error(`Input CSV file not found at: ${resolvedInputPath}`);
    }

    const parsed = this.parseCsvFile(resolvedInputPath);
    if (parsed.rows.length === 0 || parsed.headers.length === 0) {
      throw new Error('Input CSV is empty.');
    }

    const columns = this.requireColumns(parsed.headers);
    const validSkuRows: Array<{ rowIndex: number; sku: string }> = [];
    for (let i = 1; i < parsed.rows.length; i++) {
      const sku = this.normalizeSkuValue(parsed.rows[i][columns.sku.index] || '');
      if (sku !== '') {
        validSkuRows.push({ rowIndex: i, sku });
      }
    }

    if (validSkuRows.length === 0) {
      throw new Error('No valid non-empty SKUs were found in the input CSV.');
    }

    const canary = this.selectCanaryRow(validSkuRows, testSku);
    const originalRow = [...parsed.rows[canary.rowIndex]];
    this.normalizeRowsToHeaderWidth([originalRow], parsed.headers.length);

    const originalChannelName = originalRow[columns.channel.index] || '';
    const targetWeight = String(dimensions.weightKg);
    const targetDimensions = this.formatDimensions(dimensions);
    const outputDir = path.join(this.outputDir, 'channel-tests');
    fs.mkdirSync(outputDir, { recursive: true });

    const variants = [
      { label: 'Shopify', channelName: 'Shopify', filename: 'channel-Shopify.csv' },
      { label: 'Entitled Club Shopify', channelName: 'Entitled Club (Shopify)', filename: 'channel-Entitled-Club-Shopify.csv' },
      { label: 'Original', channelName: originalChannelName, filename: 'channel-original.csv' },
    ];

    const files = variants.map((variant) => {
      const row = [...originalRow];
      row[columns.channel.index] = variant.channelName;
      row[columns.weight.index] = targetWeight;
      row[columns.dimensions.index] = targetDimensions;
      const filePath = path.join(outputDir, variant.filename);
      fs.writeFileSync(filePath, this.unparseCsv([parsed.headers, row]), 'utf8');
      return {
        label: variant.label,
        channelName: variant.channelName,
        path: filePath,
      };
    });

    return {
      sku: canary.sku,
      outputDir,
      files,
    };
  }

  public detectColumns(headers: string[]): DetectedColumns {
    return {
      sku: this.findHeaderByPriority(headers, SKU_HEADER_PRIORITY),
      weight: this.findHeaderByPriority(headers, WEIGHT_HEADER_PRIORITY),
      dimensions: this.findHeaderByPriority(headers, DIMENSIONS_HEADER_PRIORITY),
      channel: this.findHeaderByPriority(headers, CHANNEL_HEADER_PRIORITY),
    };
  }

  private parseCsvFile(filePath: string): ParsedCsv {
    return this.parseCsvContent(fs.readFileSync(filePath, 'utf8'));
  }

  private parseCsvContent(content: string): ParsedCsv {
    const contentWithoutBom = content.replace(/^\uFEFF/, '');
    const result = Papa.parse<string[]>(contentWithoutBom, {
      skipEmptyLines: 'greedy',
    });

    if (result.errors.length > 0) {
      const firstError = result.errors[0];
      throw new Error(`CSV parse failed at row ${firstError.row}: ${firstError.message}`);
    }

    const rows = (result.data || []).map((row) => row.map((cell) => cell ?? ''));
    const headers = rows[0] || [];
    return {
      rows,
      headers,
      delimiter: result.meta.delimiter || ',',
    };
  }

  private unparseCsv(rows: string[][]): string {
    return Papa.unparse(rows, {
      newline: '\n',
    });
  }

  private normalizeHeader(header: string): string {
    return header.replace(/\uFEFF/g, '').trim().toLowerCase();
  }

  private normalizeSkuValue(value: string): string {
    return (value || '').trim();
  }

  private findHeaderByPriority(headers: string[], aliases: string[]): DetectedColumn | null {
    for (const alias of aliases) {
      const normalizedAlias = this.normalizeHeader(alias);
      const index = headers.findIndex((header) => this.normalizeHeader(header) === normalizedAlias);
      if (index !== -1) {
        return { index, header: headers[index] };
      }
    }
    return null;
  }

  private requireColumns(headers: string[]): ResolvedColumns {
    const detected = this.detectColumns(headers);
    const missing: string[] = [];
    if (!detected.sku) missing.push('SKU column (*SKU Code, SKU Code, Channel SKU Code, Master SKU Code, SKU)');
    if (!detected.weight) missing.push('Weight column (Weight, Weight (kg), Weight (kgs))');
    if (!detected.dimensions) missing.push('Dimensions column (Dimensions, Dimension, Package Dimensions)');
    if (!detected.channel) missing.push('Channel Name column (*Channel Name, Channel Name)');

    if (missing.length > 0) {
      throw new Error(`Required columns are missing from the input CSV: ${missing.join('; ')}. Found headers: [${headers.join(', ')}]`);
    }

    return {
      sku: detected.sku!,
      weight: detected.weight!,
      dimensions: detected.dimensions!,
      channel: detected.channel!,
    };
  }

  private normalizeRowsToHeaderWidth(rows: string[][], headerWidth: number): void {
    for (const row of rows) {
      while (row.length < headerWidth) {
        row.push('');
      }
    }
  }

  private countPhysicalLines(content: string): number {
    if (content.length === 0) return 0;
    const lineBreaks = content.match(/\r\n|\r|\n/g)?.length || 0;
    return lineBreaks + (content.endsWith('\n') || content.endsWith('\r') ? 0 : 1);
  }

  private firstValues(rows: string[][], columnIndex: number, limit: number): string[] {
    const values: string[] = [];
    for (const row of rows) {
      values.push(row[columnIndex] ?? '');
      if (values.length >= limit) break;
    }
    return values;
  }

  private firstNonEmptyValues(rows: string[][], columnIndex: number, limit: number): string[] {
    const values: string[] = [];
    for (const row of rows) {
      const value = this.normalizeSkuValue(row[columnIndex] || '');
      if (value !== '') {
        values.push(value);
        if (values.length >= limit) break;
      }
    }
    return values;
  }

  private hasSku(rows: string[][], columnIndex: number, sku: string): boolean {
    if (columnIndex < 0 || sku === '') return false;
    return rows.some((row) => this.normalizeSkuValue(row[columnIndex] || '') === sku);
  }

  private createTimestamp(date = new Date()): string {
    const pad = (value: number) => String(value).padStart(2, '0');
    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
    ].join('-') + `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  }

  private uniquePath(candidatePath: string): string {
    if (!fs.existsSync(candidatePath)) return candidatePath;
    const parsed = path.parse(candidatePath);
    let counter = 1;
    while (true) {
      const next = path.join(parsed.dir, `${parsed.name}-${counter}${parsed.ext}`);
      if (!fs.existsSync(next)) return next;
      counter++;
    }
  }

  private resolveManualImportSource(file: string): string {
    const sourcePath = path.resolve(file);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Manual CSV import file does not exist: ${sourcePath}`);
    }
    const stat = fs.statSync(sourcePath);
    if (!stat.isFile()) {
      throw new Error(`Manual CSV import path is not a file: ${sourcePath}`);
    }
    if (path.extname(sourcePath).toLowerCase() !== '.csv') {
      throw new Error(`Manual CSV import path must be a .csv file: ${sourcePath}`);
    }
    return sourcePath;
  }

  private findNewestImportCandidate(searchRoots: string[], destinationPath: string): string {
    const candidates: CsvCandidate[] = [];
    const seen = new Set<string>();

    for (const root of searchRoots) {
      const resolvedRoot = path.resolve(root);
      if (!fs.existsSync(resolvedRoot)) continue;
      this.collectCsvCandidates(resolvedRoot, path.resolve(destinationPath), seen, candidates);
    }

    if (candidates.length === 0) {
      throw new Error(`No candidate CSV files found. Searched: ${searchRoots.map((root) => path.resolve(root)).join(', ')}`);
    }

    candidates.sort((a, b) => {
      if (b.mtimeMs !== a.mtimeMs) return b.mtimeMs - a.mtimeMs;
      return a.path.localeCompare(b.path);
    });

    return candidates[0].path;
  }

  private collectCsvCandidates(root: string, destinationPath: string, seen: Set<string>, candidates: CsvCandidate[]): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(root, entry.name);
      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        if (SEARCH_SKIP_DIRS.has(entry.name)) continue;
        this.collectCsvCandidates(fullPath, destinationPath, seen, candidates);
        continue;
      }

      if (!entry.isFile()) continue;
      if (!this.matchesImportPattern(entry.name)) continue;

      const resolved = path.resolve(fullPath);
      if (resolved === destinationPath) continue;

      let realPath = resolved;
      try {
        realPath = fs.realpathSync(resolved);
      } catch {
        // Keep resolved path if realpath is unavailable.
      }
      if (seen.has(realPath)) continue;
      seen.add(realPath);

      try {
        const stat = fs.statSync(resolved);
        candidates.push({ path: resolved, mtimeMs: stat.mtimeMs, mtime: stat.mtime });
      } catch {
        // Ignore files that disappear during traversal.
      }
    }
  }

  private matchesImportPattern(fileName: string): boolean {
    const lower = fileName.toLowerCase();
    if (!lower.endsWith('.csv')) return false;
    return lower.startsWith('export_product') || lower.includes('product') || lower.includes('channel');
  }

  private compareShopifySkus(shopifySkus: Set<string>, csvSkus: Set<string>) {
    const shopifyMissingFromCsv: string[] = [];
    const csvMissingFromShopify: string[] = [];
    let matchedCount = 0;

    if (shopifySkus.size === 0) {
      return { matchedCount, shopifyMissingFromCsv, csvMissingFromShopify };
    }

    for (const sku of shopifySkus) {
      if (csvSkus.has(sku)) {
        matchedCount++;
      } else {
        shopifyMissingFromCsv.push(sku);
      }
    }

    for (const sku of csvSkus) {
      if (!shopifySkus.has(sku)) {
        csvMissingFromShopify.push(sku);
      }
    }

    if (shopifyMissingFromCsv.length > 0) {
      logger.warn(`Shopify SKUs missing from CSV (${shopifyMissingFromCsv.length}): ${shopifyMissingFromCsv.slice(0, 25).join(', ')}`);
    }
    if (csvMissingFromShopify.length > 0) {
      logger.warn(`CSV SKUs missing from active Shopify (${csvMissingFromShopify.length}): ${csvMissingFromShopify.slice(0, 25).join(', ')}`);
    }
    if (shopifySkus.size > 0 && shopifyMissingFromCsv.length === shopifySkus.size) {
      console.warn('Possible stale/wrong CSV or SKU-column detection issue');
      console.warn(`First 10 Shopify SKUs: ${Array.from(shopifySkus).slice(0, 10).join(', ')}`);
      console.warn(`First 10 CSV SKUs: ${Array.from(csvSkus).slice(0, 10).join(', ')}`);
    }

    return { matchedCount, shopifyMissingFromCsv, csvMissingFromShopify };
  }

  private writeSkuComparisonLog(
    timestamp: string,
    shopifySkus: Set<string>,
    csvSkus: Set<string>,
    comparison: { matchedCount: number; shopifyMissingFromCsv: string[]; csvMissingFromShopify: string[] }
  ): string {
    const logPath = path.join(this.outputDir, `shopify-csv-comparison-${timestamp}.csv`);
    const rows = [
      ['type', 'sku', 'details'],
      [
        'summary',
        '',
        `shopify_skus=${shopifySkus.size}; csv_skus=${csvSkus.size}; matched=${comparison.matchedCount}; shopify_missing_from_csv=${comparison.shopifyMissingFromCsv.length}; csv_missing_from_shopify=${comparison.csvMissingFromShopify.length}`,
      ],
      ...comparison.shopifyMissingFromCsv.sort().map((sku) => ['shopify_missing_from_csv', sku, 'Exists in Shopify active products, missing from input CSV']),
      ...comparison.csvMissingFromShopify.sort().map((sku) => ['csv_missing_from_shopify', sku, 'Exists in input CSV, missing from Shopify active products']),
    ];
    fs.writeFileSync(logPath, this.unparseCsv(rows), 'utf8');
    logger.info(`Shopify/CSV comparison log written to: ${logPath}`);
    return logPath;
  }

  private selectCanaryRow(validSkuRows: Array<{ rowIndex: number; sku: string }>, testSku: string): { rowIndex: number; sku: string } {
    const normalizedTestSku = this.normalizeSkuValue(testSku);
    if (normalizedTestSku !== '') {
      const match = validSkuRows.find((row) => row.sku === normalizedTestSku);
      if (match) return match;
    }

    const fallback = validSkuRows[0];
    console.log(`TEST_SKU not found in input CSV. Using first available SKU as canary: ${fallback.sku}`);
    return fallback;
  }

  private formatDimensions(dimensions: UniversalDimensions): string {
    return `${dimensions.lengthCm}x${dimensions.breadthCm}x${dimensions.heightCm}`;
  }

  private resolveChannelValue(originalValue: string, channelConfig: ChannelConfig, rowNumber: number, sku: string): string {
    const uploadChannelName = channelConfig.shiprocketUploadChannelName.trim();
    if (uploadChannelName !== '') {
      return uploadChannelName;
    }

    const configuredName = channelConfig.shiprocketChannelName.trim();
    if (channelConfig.forceChannelName && configuredName !== '') {
      return configuredName;
    }
    if (originalValue.trim() !== '') {
      return originalValue;
    }
    if (configuredName !== '') {
      return configuredName;
    }
    throw new Error(`Channel Name is blank on row ${rowNumber} for SKU "${sku}", and SHIPROCKET_CHANNEL_NAME is not set.`);
  }

  private verifyPreparedFiles(
    inputPath: string,
    outputPath: string,
    canaryPath: string,
    canarySku: string,
    context: VerificationContext
  ): { inputRowCount: number; outputRowCount: number; updatedRowCount: number } {
    const inputParsed = this.parseCsvFile(inputPath);
    const outputParsed = this.parseCsvFile(outputPath);
    this.normalizeRowsToHeaderWidth(inputParsed.rows, inputParsed.headers.length);
    this.normalizeRowsToHeaderWidth(outputParsed.rows, outputParsed.headers.length);

    this.verifyHeaders(inputParsed.headers, outputParsed.headers);

    const inputDataRowCount = Math.max(inputParsed.rows.length - 1, 0);
    const outputDataRowCount = Math.max(outputParsed.rows.length - 1, 0);
    if (inputDataRowCount !== outputDataRowCount) {
      throw new Error(`Verification FAILED: Row number 0, SKU "", column "row count", expected "${inputDataRowCount}", actual "${outputDataRowCount}"`);
    }

    const columns = this.requireColumns(inputParsed.headers);
    let updatedRowCount = 0;

    for (let i = 1; i < inputParsed.rows.length; i++) {
      const inputRow = inputParsed.rows[i];
      const outputRow = outputParsed.rows[i];
      const rowNumber = i + 1;
      const sku = this.normalizeSkuValue(inputRow[columns.sku.index] || '');

      if (!outputRow) {
        throw new Error(`Verification FAILED: Row number ${rowNumber}, SKU "${sku}", column "row", expected "present", actual "missing"`);
      }

      if ((inputRow[columns.sku.index] || '') !== (outputRow[columns.sku.index] || '')) {
        this.throwCellMismatch(rowNumber, sku, inputParsed.headers[columns.sku.index], inputRow[columns.sku.index] || '', outputRow[columns.sku.index] || '');
      }

      if (sku !== '') updatedRowCount++;

      const maxColumns = Math.max(inputParsed.headers.length, inputRow.length, outputRow.length);
      const uploadChannelName = context.channelConfig.shiprocketUploadChannelName.trim();
      for (let j = 0; j < maxColumns; j++) {
        const columnName = inputParsed.headers[j] || `column ${j + 1}`;
        const inputValue = inputRow[j] || '';
        const outputValue = outputRow[j] || '';
        let expectedValue = inputValue;

        if (j === columns.channel.index && uploadChannelName !== '') {
          expectedValue = uploadChannelName;
        } else if (sku !== '') {
          if (j === columns.weight.index) {
            expectedValue = context.targetWeight;
          } else if (j === columns.dimensions.index) {
            expectedValue = context.targetDimensions;
          } else if (j === columns.channel.index) {
            expectedValue = this.resolveExpectedChannelForVerification(inputValue, context.channelConfig);
          }
        }

        if (outputValue !== expectedValue) {
          this.throwCellMismatch(rowNumber, sku, columnName, expectedValue, outputValue);
        }
      }
    }

    this.verifyCanaryFile(canaryPath, inputParsed.headers, columns, canarySku, context);

    return {
      inputRowCount: inputDataRowCount,
      outputRowCount: outputDataRowCount,
      updatedRowCount,
    };
  }

  private verifyHeaders(inputHeaders: string[], outputHeaders: string[]): void {
    if (inputHeaders.length !== outputHeaders.length) {
      throw new Error(`Verification FAILED: Row number 1, SKU "", column "headers", expected "${inputHeaders.length} columns", actual "${outputHeaders.length} columns"`);
    }
    for (let i = 0; i < inputHeaders.length; i++) {
      if (inputHeaders[i] !== outputHeaders[i]) {
        this.throwCellMismatch(1, '', `header ${i + 1}`, inputHeaders[i], outputHeaders[i]);
      }
    }
  }

  private resolveExpectedChannelForVerification(originalValue: string, channelConfig: ChannelConfig): string {
    const uploadChannelName = channelConfig.shiprocketUploadChannelName.trim();
    if (uploadChannelName !== '') return uploadChannelName;

    const configuredName = channelConfig.shiprocketChannelName.trim();
    if (channelConfig.forceChannelName && configuredName !== '') return configuredName;
    if (originalValue.trim() !== '') return originalValue;
    return configuredName;
  }

  private verifyCanaryFile(
    canaryPath: string,
    expectedHeaders: string[],
    columns: ResolvedColumns,
    expectedCanarySku: string,
    context: VerificationContext
  ): void {
    const canaryParsed = this.parseCsvFile(canaryPath);
    this.normalizeRowsToHeaderWidth(canaryParsed.rows, canaryParsed.headers.length);
    this.verifyHeaders(expectedHeaders, canaryParsed.headers);

    const dataRowCount = Math.max(canaryParsed.rows.length - 1, 0);
    if (dataRowCount !== 1) {
      throw new Error(`Verification FAILED: Row number 0, SKU "${expectedCanarySku}", column "canary row count", expected "1", actual "${dataRowCount}"`);
    }

    const canaryRow = canaryParsed.rows[1];
    const actualSku = this.normalizeSkuValue(canaryRow[columns.sku.index] || '');
    if (actualSku !== expectedCanarySku) {
      this.throwCellMismatch(2, actualSku, expectedHeaders[columns.sku.index], expectedCanarySku, actualSku);
    }
    if ((canaryRow[columns.weight.index] || '') !== context.targetWeight) {
      this.throwCellMismatch(2, expectedCanarySku, expectedHeaders[columns.weight.index], context.targetWeight, canaryRow[columns.weight.index] || '');
    }
    if ((canaryRow[columns.dimensions.index] || '') !== context.targetDimensions) {
      this.throwCellMismatch(2, expectedCanarySku, expectedHeaders[columns.dimensions.index], context.targetDimensions, canaryRow[columns.dimensions.index] || '');
    }
    const uploadChannelName = context.channelConfig.shiprocketUploadChannelName.trim();
    if (uploadChannelName !== '' && (canaryRow[columns.channel.index] || '') !== uploadChannelName) {
      this.throwCellMismatch(2, expectedCanarySku, expectedHeaders[columns.channel.index], uploadChannelName, canaryRow[columns.channel.index] || '');
    }
  }

  private throwCellMismatch(rowNumber: number, sku: string, columnName: string, expectedValue: string, actualValue: string): never {
    throw new Error(`Verification FAILED: Row number ${rowNumber}, SKU "${sku}", column "${columnName}", expected "${expectedValue}", actual "${actualValue}"`);
  }

  private readManifest(): LatestSuccessManifest {
    try {
      return JSON.parse(fs.readFileSync(this.manifestPath, 'utf8')) as LatestSuccessManifest;
    } catch (err: any) {
      throw new Error(`Verification FAILED: Could not parse manifest file: ${err.message}`);
    }
  }

  private validateManifest(manifest: LatestSuccessManifest): void {
    const requiredStringFields: Array<keyof LatestSuccessManifest> = [
      'inputPath',
      'outputPath',
      'canaryPath',
      'inputSha256',
      'outputSha256',
      'canarySku',
      'weightUsed',
      'dimensionsUsed',
      'timestamp',
    ];
    for (const field of requiredStringFields) {
      if (typeof manifest[field] !== 'string' || (manifest[field] as string).trim() === '') {
        throw new Error(`Verification FAILED: Manifest is missing required field "${field}".`);
      }
    }
    if (typeof manifest.inputRowCount !== 'number' || typeof manifest.outputRowCount !== 'number' || typeof manifest.updatedRowCount !== 'number') {
      throw new Error('Verification FAILED: Manifest row counts are missing or invalid.');
    }
    if (typeof manifest.forceChannelName !== 'boolean') {
      throw new Error('Verification FAILED: Manifest forceChannelName is missing or invalid.');
    }
    if (typeof manifest.shiprocketChannelName !== 'string') {
      throw new Error('Verification FAILED: Manifest shiprocketChannelName is missing or invalid.');
    }
    if (typeof manifest.shiprocketUploadChannelName !== 'string') {
      throw new Error('Verification FAILED: Manifest shiprocketUploadChannelName is missing or invalid.');
    }
  }

  private parseManifestDimensions(manifest: LatestSuccessManifest): UniversalDimensions {
    const parts = manifest.dimensionsUsed.split('x').map((part) => Number(part));
    if (parts.length !== 3 || parts.some((part) => Number.isNaN(part) || part <= 0)) {
      throw new Error(`Verification FAILED: Manifest dimensionsUsed is invalid: ${manifest.dimensionsUsed}`);
    }
    const weightKg = Number(manifest.weightUsed);
    if (Number.isNaN(weightKg) || weightKg <= 0) {
      throw new Error(`Verification FAILED: Manifest weightUsed is invalid: ${manifest.weightUsed}`);
    }
    return {
      lengthCm: parts[0],
      breadthCm: parts[1],
      heightCm: parts[2],
      weightKg,
    };
  }
}
