import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  FidelityPreflightReport,
  MappingRow,
  PreflightAsset,
  ReferenceImage,
} from '../../shared/types.js';
import { composeProductPrompt } from './prompt-mapping.js';
import { validateOutputDirectory } from './output-directory.js';

export interface FidelityPreflightInput {
  presentationPath: string;
  productPaths: string[];
  promptPath: string;
  outputRoot: string;
  model: string;
  supportedSettings: Record<string, unknown>;
  estimatedCredits?: number;
}

export async function createFidelityPreflight(input: FidelityPreflightInput) {
  const outputRoot = await validateOutputDirectory(input.outputRoot, false);
  const presentation = await inspectAsset(input.presentationPath, 1, 'presentation_reference');
  const products = await Promise.all(
    [...new Set(input.productPaths.map((item) => path.resolve(item)))]
      .sort(naturalPathCompare)
      .map((file, index) => inspectAsset(file, index + 2, 'product_source')),
  );
  if (!products.length) throw new Error('Select at least one real product-source image.');
  if (products.some((asset) => asset.path === presentation.path))
    throw new Error('The presentation reference cannot also be a product-source image.');
  const promptPath = path.resolve(input.promptPath);
  if (path.extname(promptPath).toLowerCase() !== '.txt')
    throw new Error('Prompt 01 must be a UTF-8 .txt file.');
  if (!/^01(?:[_.\s-]|$)|^prompt[_.\s-]?01/i.test(path.basename(promptPath)))
    throw new Error('Select the numbered Prompt 01 file, not another prompt.');
  const promptText = (await fs.readFile(promptPath, 'utf8')).trim();
  if (!promptText) throw new Error('Prompt 01 is empty.');
  const completePrompt = composeProductPrompt(promptText, 'standard');
  const proposedOutputPath = path.join(outputRoot, 'RAW-GARMENT-FIDELITY-TEST', 'Prompt-01.png');
  const report: FidelityPreflightReport = {
    label: 'RAW GARMENT FIDELITY TEST — NOT FINAL PRODUCTION OUTPUT',
    createdAt: new Date().toISOString(),
    enabledJobCount: 1,
    presentationReference: presentation,
    productSources: products,
    promptPath,
    promptText,
    completePrompt,
    orderedProviderInputs: [presentation, ...products].map((asset) => ({
      order: asset.order,
      role: asset.role,
      localPath: asset.path,
    })),
    model: input.model,
    supportedSettings: input.supportedSettings,
    unsupportedProductionSettings: [
      'The CLI exposes no generation flag for exact 1:1 aspect ratio; the observed default is 4:3.',
      'The CLI exposes no custom 1254×1254 dimensions; the observed 2K result was 1792×1344.',
      'The CLI exposes no quality flag; the observed configuration is medium rather than high.',
      'The CLI exposes no auto-enhance flag; the model form default is false but cannot be submitted through this CLI.',
      'The CLI exposes no output-format or exact-background flag; PNG and #EDEBE8 remain unverified production requirements.',
    ],
    estimatedCredits: input.estimatedCredits,
    durableOutputDirectory: outputRoot,
    proposedOutputPath,
    generationSubmitted: false,
  };
  const row = createFidelityRow(input, presentation, products, promptPath, completePrompt);
  return { report, row };
}

function createFidelityRow(
  input: FidelityPreflightInput,
  presentation: PreflightAsset,
  products: PreflightAsset[],
  promptPath: string,
  completePrompt: string,
): MappingRow {
  const orderedInputs = [
    {
      order: 1,
      role: 'presentation' as const,
      label: 'PRESENTATION REFERENCE',
      image: toReference(presentation),
    },
    ...products.map((asset, index) => ({
      order: index + 2,
      role: 'product' as const,
      label: 'PRODUCT SOURCE',
      image: toReference(asset),
    })),
  ];
  return {
    id: 'RAW-GARMENT-FIDELITY-TEST:01',
    product: 'RAW-GARMENT-FIDELITY-TEST',
    order: 1,
    promptKey: '01',
    promptFile: promptPath,
    references: orderedInputs.map((item) => item.image),
    outputType: 'standard',
    presentationReference: toReference(presentation),
    productInputs: products.map(toReference),
    orderedInputs,
    outputName: 'Prompt-01.png',
    enabled: true,
    status: 'valid',
    errors: [],
    completePrompt,
  };
}

async function inspectAsset(
  file: string,
  order: number,
  role: PreflightAsset['role'],
): Promise<PreflightAsset> {
  const resolved = path.resolve(file);
  const bytes = await fs.readFile(resolved);
  const info = imageInfo(bytes, path.extname(resolved).toLowerCase());
  if (!info) throw new Error(`Could not validate image dimensions or format: ${resolved}`);
  return {
    order,
    role,
    path: resolved,
    name: path.basename(resolved),
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    ...info,
  };
}

function imageInfo(bytes: Buffer, extension: string) {
  if (bytes.subarray(0, 8).equals(Buffer.from('\x89PNG\r\n\x1a\n', 'binary')))
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), format: 'PNG' };
  if (
    bytes.subarray(0, 4).equals(Buffer.from('RIFF')) &&
    bytes.subarray(8, 12).equals(Buffer.from('WEBP'))
  )
    return webpInfo(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpegInfo(bytes);
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) return undefined;
  return undefined;
}

function webpInfo(bytes: Buffer) {
  const chunk = bytes.toString('ascii', 12, 16);
  if (chunk === 'VP8X')
    return {
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3),
      format: 'WEBP',
    };
  return { format: 'WEBP' };
}

function jpegInfo(bytes: Buffer) {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if (
      [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
        marker,
      )
    )
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
        format: 'JPEG',
      };
    offset += 2 + length;
  }
  return undefined;
}

function toReference(asset: PreflightAsset): ReferenceImage {
  return { path: asset.path, name: asset.name };
}

function naturalPathCompare(left: string, right: string) {
  return path.basename(left).localeCompare(path.basename(right), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}
