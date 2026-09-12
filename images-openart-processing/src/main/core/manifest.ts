import fs from 'node:fs/promises';
import path from 'node:path';
import type { ManifestRow } from '../../shared/types.js';
function csvCells(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
    } else current += char;
  }
  cells.push(current.trim());
  return cells;
}
export function parseManifest(content: string): ManifestRow[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const header = csvCells(lines[0]).map((v) => v.toLowerCase());
  const required = [
    'order',
    'prompt_key',
    'prompt_file',
    'reference_patterns',
    'output_name',
    'enabled',
  ];
  for (const field of required)
    if (!header.includes(field)) throw new Error(`Manifest is missing required column: ${field}`);
  return lines.slice(1).map((line, index) => {
    const cells = csvCells(line);
    const row = Object.fromEntries(header.map((key, i) => [key, cells[i] ?? '']));
    const order = Number(row.order);
    if (!Number.isInteger(order)) throw new Error(`Manifest row ${index + 2} has an invalid order`);
    return {
      order,
      promptKey: row.prompt_key,
      promptFile: row.prompt_file,
      referencePatterns: row.reference_patterns
        .split('|')
        .map((v) => v.trim())
        .filter(Boolean),
      outputName: row.output_name,
      enabled: row.enabled.toLowerCase() !== 'false',
      presentationReference: row.presentation_reference || undefined,
      productPatterns: row.product_patterns
        ? row.product_patterns
            .split('|')
            .map((value) => value.trim())
            .filter(Boolean)
        : undefined,
      measurementReference: row.measurement_reference || undefined,
      outputType: row.output_type || undefined,
    };
  });
}
export async function readManifest(productPath: string) {
  try {
    return parseManifest(await fs.readFile(path.join(productPath, 'manifest.csv'), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}
