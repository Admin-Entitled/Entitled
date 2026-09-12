import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { imageExtensions, isVisibleFile } from './paths.js';
import { naturalCompare } from './natural-sort.js';
import {
  compileEntitledProviderPrompt,
  RUNTIME_PROMPT_SAFETY_CEILING,
} from './runtime-prompt-compiler.js';
import {
  createProductSourceImages,
  orderEntitledInputs,
  resolvePromptProductInputs,
} from './entitled-roles.js';
import type {
  EntitledPreset,
  MappingRow,
  PresetPrompt,
  ProductScanSummary,
  ProductImageRole,
} from '../../shared/types.js';

export async function loadEntitledPreset(root: string): Promise<EntitledPreset> {
  const presetRoot = path.resolve(root);
  const metadata = JSON.parse(await fs.readFile(path.join(presetRoot, 'preset.json'), 'utf8')) as {
    id: string;
    name: string;
    prompts: Array<{
      number: number;
      name: string;
      file: string;
      reference?: string;
      canonicalFile?: string;
      special?: 'size-chart';
    }>;
    masters?: { imageRules?: string; visualSystem?: string };
  };
  const imageRulesPath = metadata.masters?.imageRules
    ? path.join(presetRoot, metadata.masters.imageRules)
    : undefined;
  const visualSystemPath = metadata.masters?.visualSystem
    ? path.join(presetRoot, metadata.masters.visualSystem)
    : undefined;
  const imageRulesText = await readOptionalText(imageRulesPath);
  const visualSystemText = await readOptionalText(visualSystemPath);
  const masterRulesReady = Boolean(imageRulesText && visualSystemText);
  const prompts: PresetPrompt[] = await Promise.all(
    metadata.prompts.map(async (item) => {
      const file = path.join(presetRoot, item.file);
      const canonicalPath = item.canonicalFile ? path.join(presetRoot, item.canonicalFile) : file;
      const canonicalText = await readOptionalText(canonicalPath);
      const canonicalFound = Boolean(canonicalText);
      const referencePath = item.reference ? path.join(presetRoot, item.reference) : undefined;
      const hasReference = referencePath ? await exists(referencePath) : false;
      const missingReason = !canonicalFound
        ? 'Official prompt text required'
        : !masterRulesReady
          ? 'ENTITLED master rules required'
          : item.special === 'size-chart'
            ? 'Requires approved Prompt 01 output, measurement image, and official ENTITLED logo asset.'
            : undefined;
      return {
        ...item,
        file,
        text: canonicalText ?? '',
        canonicalPath,
        canonicalSha256: canonicalFound ? await sha256File(canonicalPath) : undefined,
        canonicalFound,
        referencePath: hasReference ? referencePath : undefined,
        ready: !missingReason,
        missingReason,
      };
    }),
  );
  return {
    id: metadata.id,
    name: metadata.name,
    prompts,
    imageRulesPath,
    imageRulesSha256: imageRulesPath ? await sha256File(imageRulesPath) : undefined,
    visualSystemPath,
    visualSystemSha256: visualSystemPath ? await sha256File(visualSystemPath) : undefined,
    imageRulesText: imageRulesText ?? undefined,
    visualSystemText: visualSystemText ?? undefined,
    masterRulesReady,
  };
}

export async function scanEntitledProducts(
  inputRoot: string,
  preset: EntitledPreset,
  selectedPromptNumbers: number[],
): Promise<{ rows: MappingRow[]; summaries: ProductScanSummary[] }> {
  const root = path.resolve(inputRoot);
  const productEntries = (await fs.readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && isVisibleFile(entry.name))
    .sort((a, b) => naturalCompare(a.name, b.name));
  const rows: MappingRow[] = [];
  const summaries: ProductScanSummary[] = [];
  for (const entry of productEntries) {
    const product = entry.name;
    const productRoot = path.join(root, product);
    const names = (await fs.readdir(productRoot, { withFileTypes: true }))
      .filter(
        (item) =>
          item.isFile() &&
          isVisibleFile(item.name) &&
          imageExtensions.has(path.extname(item.name).toLowerCase()),
      )
      .map((item) => item.name)
      .sort(naturalCompare);
    const images = createProductSourceImages(
      names.map((name) => ({ path: path.join(productRoot, name), name })),
    );
    const errors: string[] = images.length ? [] : ['No supported product-source images found.'];
    const selectedPrompts = preset.prompts.filter((prompt) =>
      selectedPromptNumbers.includes(prompt.number),
    );
    for (const prompt of selectedPrompts) {
      const rowErrors = [...errors];
      if (!prompt.ready) rowErrors.push(prompt.missingReason ?? 'Prompt is unavailable.');
      const presentation = prompt.referencePath
        ? { path: prompt.referencePath, name: path.basename(prompt.referencePath) }
        : undefined;
      const resolution = resolvePromptProductInputs(prompt.number, images);
      const orderedInputs = orderEntitledInputs(presentation, resolution.included);
      rowErrors.push(...resolution.errors);
      const completePrompt =
        prompt.ready && preset.imageRulesText && preset.visualSystemText
          ? compileEntitledProviderPrompt(
              prompt.text,
              preset.imageRulesText,
              preset.visualSystemText,
              prompt.number,
            )
          : undefined;
      if (completePrompt && completePrompt.length > RUNTIME_PROMPT_SAFETY_CEILING)
        rowErrors.push(
          `Final provider prompt is ${completePrompt.length} characters; the safety ceiling is ${RUNTIME_PROMPT_SAFETY_CEILING}.`,
        );
      rows.push({
        id: `${product}:${String(prompt.number).padStart(2, '0')}`,
        product,
        order: prompt.number,
        promptKey: String(prompt.number).padStart(2, '0'),
        promptFile: path.relative(root, prompt.file),
        references: orderedInputs.map((item) => item.image),
        outputType: prompt.special ?? 'standard',
        presentationReference: presentation,
        productInputs: resolution.included,
        sourceImages: images,
        includedProductInputs: resolution.included,
        excludedProductInputs: resolution.excluded,
        orderedInputs,
        outputName: `${String(prompt.number).padStart(2, '0')}.png`,
        enabled: rowErrors.length === 0,
        status: rowErrors.length ? 'error' : 'valid',
        errors: rowErrors,
        completePrompt: completePrompt?.prompt,
      });
    }
    summaries.push({
      product,
      images,
      selectedPromptNumbers,
      jobCount: selectedPrompts.length,
      errors: [
        ...new Set(rows.filter((row) => row.product === product).flatMap((row) => row.errors)),
      ],
      enabled: true,
    });
  }
  return { rows, summaries };
}

export async function scanFlatFrontImages(
  inputRoot: string,
  preset: EntitledPreset,
): Promise<{ rows: MappingRow[]; summaries: ProductScanSummary[] }> {
  const root = path.resolve(inputRoot);
  const prompt = preset.prompts.find((item) => item.number === 1);
  if (!prompt) throw new Error('Prompt 01 is unavailable in the selected preset.');
  const names = (await fs.readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && isVisibleFile(entry.name) && imageExtensions.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort(naturalCompare);
  const presentation = prompt.referencePath ? { path: prompt.referencePath, name: path.basename(prompt.referencePath) } : undefined;
  const completePrompt = prompt.ready && preset.imageRulesText && preset.visualSystemText
    ? compileEntitledProviderPrompt(prompt.text, preset.imageRulesText, preset.visualSystemText, 1).prompt
    : undefined;
  const seen = new Set<string>();
  const rows = names.map((name) => {
    const product = path.basename(name, path.extname(name));
    const duplicate = seen.has(product.toLowerCase());
    seen.add(product.toLowerCase());
    const image = { path: path.join(root, name), name };
    const source = { ...image, detectedRole: 'FRONT' as const, role: 'FRONT' as const };
    const errors = [
      ...(duplicate ? ['Duplicate SKU name (case-insensitive).'] : []),
      ...(!prompt.ready ? [prompt.missingReason ?? 'Prompt 01 is unavailable.'] : []),
      ...(!presentation ? ['Prompt 01 presentation reference is missing.'] : []),
      ...(completePrompt && completePrompt.length > RUNTIME_PROMPT_SAFETY_CEILING ? [`Final provider prompt exceeds the safety ceiling.`] : []),
    ];
    return {
      id: `flat:${product}:01`, product, order: 1, promptKey: '01', promptFile: path.relative(root, prompt.file),
      references: [ ...(presentation ? [presentation] : []), image ], outputType: 'standard', presentationReference: presentation,
      productInputs: [source], sourceImages: [source], includedProductInputs: [source], excludedProductInputs: [],
      orderedInputs: [ ...(presentation ? [{ order: 1, role: 'presentation' as const, label: 'PRESENTATION REFERENCE', image: presentation }] : []),
        { order: presentation ? 2 : 1, role: 'product' as const, label: 'PRODUCT SOURCE', image } ],
      outputName: `${product}.png`, outputGroup: 'Prompt 01', inputMode: 'flat-front', enabled: errors.length === 0,
      status: errors.length ? 'error' as const : 'valid' as const, errors, completePrompt,
    } satisfies MappingRow;
  });
  return { rows, summaries: [{ product: 'Flat Front-Image Batch', images: rows.map((row) => row.sourceImages![0]), selectedPromptNumbers: [1], jobCount: rows.length, errors: rows.flatMap((row) => row.errors), enabled: true }] };
}

export function applyEntitledRoleOverride(
  row: MappingRow,
  sourcePath: string,
  role: ProductImageRole,
): MappingRow {
  const sources = (row.sourceImages ?? []).map((source) =>
    source.path === sourcePath ? { ...source, role } : source,
  );
  const resolution = resolvePromptProductInputs(row.order, sources);
  const orderedInputs = orderEntitledInputs(row.presentationReference, resolution.included);
  const errors = [...resolution.errors];
  if (!row.completePrompt) errors.push('Prompt is unavailable.');
  return {
    ...row,
    productInputs: resolution.included,
    sourceImages: sources,
    includedProductInputs: resolution.included,
    excludedProductInputs: resolution.excluded,
    references: orderedInputs.map((input) => input.image),
    orderedInputs,
    enabled: errors.length === 0,
    status: errors.length ? 'error' : 'valid',
    errors: [...new Set(errors)],
  };
}

async function readOptionalText(file: string | undefined) {
  if (!file) return undefined;
  try {
    const value = (await fs.readFile(file, 'utf8')).trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

async function sha256File(file: string) {
  return crypto
    .createHash('sha256')
    .update(await fs.readFile(file))
    .digest('hex');
}

async function exists(file: string) {
  return fs
    .access(file)
    .then(() => true)
    .catch(() => false);
}
