import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as Papa from 'papaparse';
import { ChannelConfig, UniversalDimensions } from '../src/config';
import { CsvProcessor } from '../src/csv-processor';

const headers = ['*Channel Name', 'Product Name', '*SKU Code', 'Weight', 'Dimensions', 'Category'];
const dimensions: UniversalDimensions = {
  lengthCm: 30,
  breadthCm: 20,
  heightCm: 1,
  weightKg: 0.1,
};
const preserveChannel: ChannelConfig = {
  forceChannelName: false,
  shiprocketChannelName: 'Fallback Channel',
  shiprocketUploadChannelName: '',
};

function makeTempProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shiprocket-dimensions-test-'));
  fs.mkdirSync(path.join(root, 'input'), { recursive: true });
  fs.mkdirSync(path.join(root, 'output'), { recursive: true });
  fs.mkdirSync(path.join(root, 'backups'), { recursive: true });
  return root;
}

function writeCsv(filePath: string, rows: string[][]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Papa.unparse(rows), 'utf8');
}

function parseCsv(filePath: string): string[][] {
  return Papa.parse<string[]>(fs.readFileSync(filePath, 'utf8'), { skipEmptyLines: 'greedy' }).data;
}

function inputPath(root: string): string {
  return path.join(root, 'input/shiprocket-channel-products.csv');
}

function sampleRows(): string[][] {
  return [
    headers,
    ['Online Store', 'Product A', 'SKU-A', '0.5', '10x10x5', 'Shirts'],
    ['Online Store', 'Product B', 'SKU-B', '0.7', '12x12x6', 'Pants'],
    ['Online Store', 'Empty SKU', '', '0.9', '14x14x7', 'Draft'],
  ];
}

describe('Shiprocket CSV processor', () => {
  let tempRoots: string[] = [];

  afterEach(() => {
    for (const root of tempRoots) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    tempRoots = [];
    jest.restoreAllMocks();
  });

  it('imports the newest matching CSV from Downloads/Desktop/project search paths and backs up existing input', () => {
    const root = makeTempProject();
    tempRoots.push(root);
    const downloads = path.join(root, 'Downloads');
    const desktop = path.join(root, 'Desktop');
    const project = path.join(root, 'project');
    fs.mkdirSync(downloads, { recursive: true });
    fs.mkdirSync(desktop, { recursive: true });
    fs.mkdirSync(project, { recursive: true });

    const processor = new CsvProcessor({ projectRoot: project });
    writeCsv(inputPath(project), [headers, ['Old Channel', 'Existing', 'EXISTING', '1', '1x1x1', 'Old']]);

    const oldFile = path.join(downloads, 'export_product_old.csv');
    const desktopFile = path.join(desktop, 'channel_products.csv');
    const newestFile = path.join(project, 'nested/export_product_new.csv');
    writeCsv(oldFile, [headers, ['Download', 'Old', 'SKU-OLD', '1', '1x1x1', 'Old']]);
    writeCsv(desktopFile, [headers, ['Desktop', 'Middle', 'SKU-MID', '1', '1x1x1', 'Mid']]);
    writeCsv(newestFile, [headers, ['Project', 'Newest', 'SKU-NEW', '1', '1x1x1', 'New']]);

    fs.utimesSync(oldFile, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'));
    fs.utimesSync(desktopFile, new Date('2026-01-02T00:00:00Z'), new Date('2026-01-02T00:00:00Z'));
    fs.utimesSync(newestFile, new Date('2026-01-03T00:00:00Z'), new Date('2026-01-03T00:00:00Z'));

    const summary = processor.importLatestCsv({
      searchRoots: [downloads, desktop, project],
      testSku: 'SKU-NEW',
    });

    expect(summary.sourcePath).toBe(path.resolve(newestFile));
    expect(summary.destinationPath).toBe(inputPath(project));
    expect(summary.firstSkus).toEqual(['SKU-NEW']);
    expect(summary.testSkuExists).toBe(true);
    expect(summary.backupPath).toBeDefined();
    expect(fs.existsSync(summary.backupPath || '')).toBe(true);
    expect(parseCsv(inputPath(project))[1][2]).toBe('SKU-NEW');
  });

  it('imports a manually specified CSV with --file behavior', () => {
    const root = makeTempProject();
    tempRoots.push(root);
    const processor = new CsvProcessor({ projectRoot: root });
    const manualFile = path.join(root, 'manual_product_file.csv');
    writeCsv(manualFile, [headers, ['Manual Channel', 'Manual Product', 'MANUAL-SKU', '1', '1x1x1', 'Manual']]);

    const summary = processor.importLatestCsv({ file: manualFile, testSku: 'MANUAL-SKU' });

    expect(summary.sourcePath).toBe(path.resolve(manualFile));
    expect(summary.firstSkus).toEqual(['MANUAL-SKU']);
    expect(parseCsv(inputPath(root))[1][2]).toBe('MANUAL-SKU');
  });

  it('handles UTF-8 BOM headers when inspecting and preparing CSV', () => {
    const root = makeTempProject();
    tempRoots.push(root);
    const processor = new CsvProcessor({ projectRoot: root });
    fs.writeFileSync(
      inputPath(root),
      `\uFEFF${headers.join(',')}\nOnline Store,Product A,SKU-A,1,1x1x1,Shirts`,
      'utf8'
    );

    const inspection = processor.inspectInput(inputPath(root), 'SKU-A');
    expect(inspection.skuColumn).toBe('*SKU Code');
    expect(inspection.testSkuExists).toBe(true);

    const summary = processor.prepareCsv(inputPath(root), new Set(), dimensions, preserveChannel, 'SKU-A');
    const output = parseCsv(summary.outputPath);
    expect(output[0]).toEqual(headers);
    expect(output[1][3]).toBe('0.1');
    expect(output[1][4]).toBe('30x20x1');
  });

  it('preserves quoted CSV values with commas while updating dimensions', () => {
    const root = makeTempProject();
    tempRoots.push(root);
    const processor = new CsvProcessor({ projectRoot: root });
    writeCsv(inputPath(root), [
      headers,
      ['Online Store', 'Oxford Shirt, Blue', 'SKU-A', '1', '1x1x1', 'Shirts, Premium'],
    ]);

    const summary = processor.prepareCsv(inputPath(root), new Set(['SKU-A']), dimensions, preserveChannel, 'SKU-A');
    const output = parseCsv(summary.outputPath);

    expect(output[1][1]).toBe('Oxford Shirt, Blue');
    expect(output[1][5]).toBe('Shirts, Premium');
    expect(output[1][3]).toBe('0.1');
    expect(output[1][4]).toBe('30x20x1');
  });

  it('detects the SKU column using the required priority order', () => {
    const root = makeTempProject();
    tempRoots.push(root);
    const processor = new CsvProcessor({ projectRoot: root });

    const detected = processor.detectColumns(['SKU', 'Master SKU Code', 'Channel SKU Code', 'SKU Code', 'Weight', 'Dimensions', 'Channel Name']);

    expect(detected.sku?.header).toBe('SKU Code');
    expect(detected.sku?.index).toBe(3);
  });

  it('uses the first valid SKU as canary when TEST_SKU is missing', () => {
    const root = makeTempProject();
    tempRoots.push(root);
    const processor = new CsvProcessor({ projectRoot: root });
    writeCsv(inputPath(root), sampleRows());
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const summary = processor.prepareCsv(inputPath(root), new Set(), dimensions, preserveChannel, 'NOT-IN-CSV');
    const canary = parseCsv(summary.canaryPath);

    expect(summary.canarySku).toBe('SKU-A');
    expect(canary).toHaveLength(2);
    expect(canary[1][2]).toBe('SKU-A');
    expect(logSpy).toHaveBeenCalledWith('TEST_SKU not found in input CSV. Using first available SKU as canary: SKU-A');
  });

  it('updates all non-empty Shiprocket SKU rows regardless of Shopify matches', () => {
    const root = makeTempProject();
    tempRoots.push(root);
    const processor = new CsvProcessor({ projectRoot: root });
    writeCsv(inputPath(root), sampleRows());

    const summary = processor.prepareCsv(inputPath(root), new Set(['SKU-A']), dimensions, preserveChannel, 'SKU-A');
    const output = parseCsv(summary.outputPath);

    expect(summary.matchedCount).toBe(1);
    expect(summary.updatedRows).toBe(2);
    expect(output[1][3]).toBe('0.1');
    expect(output[1][4]).toBe('30x20x1');
    expect(output[2][3]).toBe('0.1');
    expect(output[2][4]).toBe('30x20x1');
    expect(output[3][3]).toBe('0.9');
    expect(output[3][4]).toBe('14x14x7');
  });

  it('writes a CSV comparison log with missing Shopify and input SKUs', () => {
    const root = makeTempProject();
    tempRoots.push(root);
    const processor = new CsvProcessor({ projectRoot: root });
    writeCsv(inputPath(root), sampleRows());

    const summary = processor.prepareCsv(inputPath(root), new Set(['SKU-A', 'SKU-C']), dimensions, preserveChannel, 'SKU-A');
    const log = parseCsv(summary.comparisonLogPath);

    expect(path.basename(summary.comparisonLogPath)).toMatch(/^shopify-csv-comparison-\d{4}-\d{2}-\d{2}-\d{6}\.csv$/);
    expect(log[0]).toEqual(['type', 'sku', 'details']);
    expect(log[1]).toEqual([
      'summary',
      '',
      'shopify_skus=2; csv_skus=2; matched=1; shopify_missing_from_csv=1; csv_missing_from_shopify=1',
    ]);
    expect(log).toContainEqual(['shopify_missing_from_csv', 'SKU-C', 'Exists in Shopify active products, missing from input CSV']);
    expect(log).toContainEqual(['csv_missing_from_shopify', 'SKU-B', 'Exists in input CSV, missing from Shopify active products']);
  });

  it('preserves Channel Name by default', () => {
    const root = makeTempProject();
    tempRoots.push(root);
    const processor = new CsvProcessor({ projectRoot: root });
    writeCsv(inputPath(root), sampleRows());

    const summary = processor.prepareCsv(inputPath(root), new Set(), dimensions, preserveChannel, 'SKU-A');
    const output = parseCsv(summary.outputPath);

    expect(output[1][0]).toBe('Online Store');
    expect(output[2][0]).toBe('Online Store');
  });

  it('overwrites Channel Name when FORCE_CHANNEL_NAME is true and a channel name is configured', () => {
    const root = makeTempProject();
    tempRoots.push(root);
    const processor = new CsvProcessor({ projectRoot: root });
    writeCsv(inputPath(root), sampleRows());

    const summary = processor.prepareCsv(
      inputPath(root),
      new Set(),
      dimensions,
      { forceChannelName: true, shiprocketChannelName: 'Forced Channel', shiprocketUploadChannelName: '' },
      'SKU-A'
    );
    const output = parseCsv(summary.outputPath);

    expect(output[1][0]).toBe('Forced Channel');
    expect(output[2][0]).toBe('Forced Channel');
    expect(output[3][0]).toBe('Online Store');
  });

  it('uses SHIPROCKET_UPLOAD_CHANNEL_NAME over preserved and forced channel names', () => {
    const root = makeTempProject();
    tempRoots.push(root);
    const processor = new CsvProcessor({ projectRoot: root });
    writeCsv(inputPath(root), sampleRows());
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const summary = processor.prepareCsv(
      inputPath(root),
      new Set(),
      dimensions,
      {
        forceChannelName: true,
        shiprocketChannelName: 'Forced Channel',
        shiprocketUploadChannelName: 'Shopify',
      },
      'SKU-A'
    );

    const output = parseCsv(summary.outputPath);
    const canary = parseCsv(summary.canaryPath);

    expect(output[1][0]).toBe('Shopify');
    expect(output[2][0]).toBe('Shopify');
    expect(output[3][0]).toBe('Shopify');
    expect(canary[1][0]).toBe('Shopify');
    expect(canary[1][3]).toBe('0.1');
    expect(canary[1][4]).toBe('30x20x1');
    expect(logSpy).toHaveBeenCalledWith('Using upload channel name: "Shopify"');
    expect(() => processor.verifyCsv()).not.toThrow();
  });

  it('generates three quick channel test CSVs for the same canary SKU row', () => {
    const root = makeTempProject();
    tempRoots.push(root);
    const processor = new CsvProcessor({ projectRoot: root });
    writeCsv(inputPath(root), sampleRows());

    const summary = processor.generateQuickChannelTest(inputPath(root), dimensions, 'SKU-B');

    expect(summary.sku).toBe('SKU-B');
    expect(summary.files.map((file) => path.basename(file.path))).toEqual([
      'channel-Shopify.csv',
      'channel-Entitled-Club-Shopify.csv',
      'channel-original.csv',
    ]);

    const shopify = parseCsv(path.join(summary.outputDir, 'channel-Shopify.csv'));
    const entitled = parseCsv(path.join(summary.outputDir, 'channel-Entitled-Club-Shopify.csv'));
    const original = parseCsv(path.join(summary.outputDir, 'channel-original.csv'));

    expect(shopify).toHaveLength(2);
    expect(entitled).toHaveLength(2);
    expect(original).toHaveLength(2);
    expect(shopify[1][2]).toBe('SKU-B');
    expect(entitled[1][2]).toBe('SKU-B');
    expect(original[1][2]).toBe('SKU-B');
    expect(shopify[1][0]).toBe('Shopify');
    expect(entitled[1][0]).toBe('Entitled Club (Shopify)');
    expect(original[1][0]).toBe('Online Store');
    expect(shopify[1][3]).toBe('0.1');
    expect(shopify[1][4]).toBe('30x20x1');
  });

  it('verify rejects a stale manifest when the input file changes', () => {
    const root = makeTempProject();
    tempRoots.push(root);
    const processor = new CsvProcessor({ projectRoot: root });
    writeCsv(inputPath(root), sampleRows());

    processor.prepareCsv(inputPath(root), new Set(), dimensions, preserveChannel, 'SKU-A');
    fs.appendFileSync(inputPath(root), '\nOnline Store,Product C,SKU-C,1,1x1x1,New', 'utf8');

    expect(() => processor.verifyCsv()).toThrow(/Input file has been modified after output generation/);
  });

  it('verify confirms unrelated columns remain unchanged', () => {
    const root = makeTempProject();
    tempRoots.push(root);
    const processor = new CsvProcessor({ projectRoot: root });
    writeCsv(inputPath(root), [
      headers,
      ['Online Store', 'Product A', 'SKU-A', '1', '1x1x1', 'Shirts'],
      ['Online Store', 'Product B', 'SKU-B', '2', '2x2x2', 'Pants'],
    ]);

    const summary = processor.prepareCsv(inputPath(root), new Set(['NO-MATCH']), dimensions, preserveChannel, 'SKU-A');

    expect(() => processor.verifyCsv()).not.toThrow();
    const output = parseCsv(summary.outputPath);
    expect(output[1][1]).toBe('Product A');
    expect(output[1][5]).toBe('Shirts');
    expect(output[2][1]).toBe('Product B');
    expect(output[2][5]).toBe('Pants');
  });
});
