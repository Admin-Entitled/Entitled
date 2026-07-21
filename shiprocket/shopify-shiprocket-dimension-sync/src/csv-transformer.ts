import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';
import { UniversalDimensions } from './config';

export interface CSVColumnMapping {
  skuIndex: number;
  weightIndex: number;
  lengthIndex: number;
  breadthIndex: number;
  heightIndex: number;
}

export class CsvTransformer {
  private outputDir: string;
  private downloadsDir: string;

  constructor() {
    this.outputDir = path.resolve(__dirname, '../output');
    this.downloadsDir = path.resolve(__dirname, '../downloads');
    this.ensureDirectories();
  }

  private ensureDirectories() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
    if (!fs.existsSync(this.downloadsDir)) {
      fs.mkdirSync(this.downloadsDir, { recursive: true });
    }
  }

  /**
   * Helper to parse CSV line respecting double quotes and escaped commas.
   */
  public parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    
    return result.map(val => {
      let trimmed = val.trim();
      if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        trimmed = trimmed.substring(1, trimmed.length - 1);
      }
      return trimmed.replace(/""/g, '"');
    });
  }

  /**
   * Helper to format cell array into a valid CSV line.
   */
  public stringifyCsvLine(cells: string[]): string {
    return cells.map(cell => {
      const escaped = cell.replace(/"/g, '""');
      if (escaped.includes(',') || escaped.includes('"') || escaped.includes('\n') || escaped.includes('\r')) {
        return `"${escaped}"`;
      }
      return escaped;
    }).join(',');
  }

  /**
   * Identifies column indices in headers based on case-insensitive aliases.
   */
  public detectColumns(headers: string[]): CSVColumnMapping {
    let skuIndex = -1;
    let weightIndex = -1;
    let lengthIndex = -1;
    let breadthIndex = -1;
    let heightIndex = -1;

    const skuAliases = ['sku', 'sku code', 'channel sku', 'product sku', 'seller sku'];
    const weightAliases = ['weight', 'weight kg', 'weight_kg', 'product weight'];
    const lengthAliases = ['length', 'length_cm', 'length cm'];
    const breadthAliases = ['breadth', 'width', 'breadth_cm', 'width_cm', 'breadth cm', 'width cm'];
    const heightAliases = ['height', 'height_cm', 'height cm'];

    for (let i = 0; i < headers.length; i++) {
      const h = headers[i].toLowerCase().trim();
      if (skuIndex === -1 && skuAliases.includes(h)) skuIndex = i;
      if (weightIndex === -1 && weightAliases.includes(h)) weightIndex = i;
      if (lengthIndex === -1 && lengthAliases.includes(h)) lengthIndex = i;
      if (breadthIndex === -1 && breadthAliases.includes(h)) breadthIndex = i;
      if (heightIndex === -1 && heightAliases.includes(h)) heightIndex = i;
    }

    // Secondary fallback checks if exact match was not found
    if (skuIndex === -1) {
      skuIndex = headers.findIndex(h => h.toLowerCase().includes('sku'));
    }
    if (weightIndex === -1) {
      weightIndex = headers.findIndex(h => h.toLowerCase().includes('weight'));
    }
    if (lengthIndex === -1) {
      lengthIndex = headers.findIndex(h => h.toLowerCase().includes('length'));
    }
    if (breadthIndex === -1) {
      breadthIndex = headers.findIndex(h => h.toLowerCase().includes('breadth') || h.toLowerCase().includes('width'));
    }
    if (heightIndex === -1) {
      heightIndex = headers.findIndex(h => h.toLowerCase().includes('height'));
    }

    const missing: string[] = [];
    if (skuIndex === -1) missing.push('SKU');
    if (weightIndex === -1) missing.push('Weight');
    if (lengthIndex === -1) missing.push('Length');
    if (breadthIndex === -1) missing.push('Breadth/Width');
    if (heightIndex === -1) missing.push('Height');

    if (missing.length > 0) {
      throw new Error(`CSV Headers detection failed. Missing columns: ${missing.join(', ')}. Available headers: [${headers.join(', ')}]`);
    }

    return { skuIndex, weightIndex, lengthIndex, breadthIndex, heightIndex };
  }

  /**
   * Transforms the CSV data by replacing matching Shopify SKUs with universal dimensions.
   */
  public transform(
    inputCsvPath: string,
    shopifySkus: Set<string>,
    universal: UniversalDimensions
  ): {
    outputPath: string;
    backupPath: string;
    totalRows: number;
    updatedRows: number;
    skippedRows: number;
  } {
    if (!fs.existsSync(inputCsvPath)) {
      throw new Error(`CSV file not found at path: ${inputCsvPath}`);
    }

    const content = fs.readFileSync(inputCsvPath, 'utf8');
    const lines = content.split(/\r?\n/);
    if (lines.length === 0 || !lines[0].trim()) {
      throw new Error('CSV file is empty.');
    }

    const headers = this.parseCsvLine(lines[0]);
    const mapping = this.detectColumns(headers);

    const backupFileName = `shiprocket-channel-products-backup-${Date.now()}.csv`;
    const backupPath = path.join(this.downloadsDir, backupFileName);
    fs.writeFileSync(backupPath, content, 'utf8');
    logger.info(`Backup of downloaded Shiprocket CSV saved at: file://${backupPath}`);

    const outputLines: string[] = [this.stringifyCsvLine(headers)];
    let updatedRows = 0;
    let skippedRows = 0;
    let totalRows = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      totalRows++;
      const cells = this.parseCsvLine(line);
      
      // Ensure row has sufficient cells matching headers
      if (cells.length < headers.length) {
        // Pad cells to match headers to prevent out of bounds
        while (cells.length < headers.length) {
          cells.push('');
        }
      }

      const sku = cells[mapping.skuIndex];

      if (shopifySkus.has(sku)) {
        // Check if values are already correct
        const currentLength = parseFloat(cells[mapping.lengthIndex]);
        const currentBreadth = parseFloat(cells[mapping.breadthIndex]);
        const currentHeight = parseFloat(cells[mapping.heightIndex]);
        const currentWeight = parseFloat(cells[mapping.weightIndex]);

        const matchesLength = Math.abs(currentLength - universal.lengthCm) < 0.01;
        const matchesBreadth = Math.abs(currentBreadth - universal.breadthCm) < 0.01;
        const matchesHeight = Math.abs(currentHeight - universal.heightCm) < 0.01;
        const matchesWeight = Math.abs(currentWeight - universal.weightKg) < 0.005;

        if (matchesLength && matchesBreadth && matchesHeight && matchesWeight) {
          skippedRows++;
          outputLines.push(this.stringifyCsvLine(cells)); // no change
        } else {
          updatedRows++;
          cells[mapping.lengthIndex] = String(universal.lengthCm);
          cells[mapping.breadthIndex] = String(universal.breadthCm);
          cells[mapping.heightIndex] = String(universal.heightCm);
          cells[mapping.weightIndex] = String(universal.weightKg);
          outputLines.push(this.stringifyCsvLine(cells));
        }
      } else {
        skippedRows++;
        outputLines.push(this.stringifyCsvLine(cells));
      }
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFileName = `shiprocket-bulk-update-${timestamp}.csv`;
    const outputPath = path.join(this.outputDir, outputFileName);

    fs.writeFileSync(outputPath, outputLines.join('\n'), 'utf8');
    logger.info(`Prepared updated CSV saved at: file://${outputPath}`);

    return {
      outputPath,
      backupPath,
      totalRows,
      updatedRows,
      skippedRows
    };
  }
}
