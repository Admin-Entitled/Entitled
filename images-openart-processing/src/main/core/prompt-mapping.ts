import fs from 'node:fs/promises';
import path from 'node:path';
import { imageExtensions, isVisibleFile, numericPrefix, safeOutputName } from './paths.js';
import { naturalCompare } from './natural-sort.js';
import { compileEntitledProviderPrompt } from './runtime-prompt-compiler.js';
import { readManifest } from './manifest.js';
import type { MappingRow, OrderedImageInput, ReferenceImage } from '../../shared/types.js';

async function visibleFiles(directory: string) {
  try {
    return (await fs.readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && isVisibleFile(entry.name))
      .map((entry) => entry.name)
      .sort(naturalCompare);
  } catch {
    return [];
  }
}

async function readPrompt(file: string, prefix?: string) {
  const prompt = await fs.readFile(file, 'utf8');
  return prefix ? `${prefix.trim()}\n\n${prompt.trim()}` : prompt.trim();
}

function roleKey(filename: string) {
  const stem = path.basename(filename, path.extname(filename)).toLowerCase().replace(/\s+/g, '-');
  return stem.replace(/^\d+[_-]?/, '');
}

function reference(pathname: string): ReferenceImage {
  return { path: pathname, name: path.basename(pathname) };
}

export function orderImageInputs(
  presentation: ReferenceImage | undefined,
  products: ReferenceImage[],
  measurement?: ReferenceImage,
  outputType = 'standard',
): OrderedImageInput[] {
  const ordered: OrderedImageInput[] = [];
  if (presentation)
    ordered.push({
      order: ordered.length + 1,
      role: 'presentation',
      label: 'PRESENTATION REFERENCE',
      image: presentation,
    });
  if (outputType.toLowerCase().includes('size-chart') && measurement)
    ordered.push({
      order: ordered.length + 1,
      role: 'measurement',
      label: 'MEASUREMENT SOURCE',
      image: measurement,
    });
  for (const image of products)
    ordered.push({ order: ordered.length + 1, role: 'product', label: 'PRODUCT SOURCE', image });
  return ordered;
}

export function composeProductPrompt(prompt: string, outputType = 'standard') {
  const output = outputType.toLowerCase().includes('size-chart')
    ? 'Preserve the approved measurement layout and make all measurement text legible.'
    : 'Create an ecommerce-ready output using the requested presentation while preserving the actual product faithfully.';
  return [
    'IMAGE ROLE DECLARATION',
    'Image 1 is a presentation reference only. Use it only for composition and presentation. Image 2 and the remaining product photographs are the sole source of truth for the actual garment. Never copy the garment, colour, design, branding, fabric or construction from Image 1.',
    'PRODUCT-SOURCE AUTHORITY RULES',
    'The product source images control garment colour, category, silhouette, proportions, neckline or collar, sleeves, seams, fabric, artwork, logo, label, buttons, trims, and every construction detail. Never replace the product with the garment shown in the presentation reference.',
    'PRESENTATION-REFERENCE LIMITATIONS',
    'Use the presentation reference only for composition, camera angle, framing, garment placement, sleeve positioning, lighting style, shadow style, background appearance, spacing, and ecommerce presentation. It must never control garment identity, colour, category, silhouette, proportions, collar, neckline, placket, buttons, trims, sleeve length, seams, hem, fabric, artwork, logo, labels, branding, or construction details.',
    'NUMBERED PROMPT CONTENT',
    prompt.trim(),
    'GARMENT FIDELITY REQUIREMENTS',
    'Preserve the exact real SKU, garment colour and undertone, artwork, branding and label placement, neckline, collar, placket, buttons, trims, silhouette, proportions, construction, sleeve length, fabric texture, seams, stitching, and hem from the product-source photographs. Remove only temporary wrinkles through professional steaming. Do not redesign, invent details, replace the garment, or copy the garment shown in the presentation reference.',
    'SHORT-SLEEVE FOLD REQUIREMENTS',
    'For short sleeves, preserve the original sleeve length. Give each sleeve exactly one ruler-straight, end-to-end pressed fold, separate from the curved armhole and armhole stitching. Keep the two sleeve folds symmetrical. Reject impossible, doubled, or curved fold constructions.',
    'OUTPUT REQUIREMENTS',
    `${output} Use an exact #EDEBE8 background (RGB 237, 235, 232) when the target contract is being tested. Show the complete garment, centered and uncropped. Use no props, model, hanger, caption, border, watermark, or added text. Generate exactly one image, never a collage.`,
  ].join('\n\n');
}

export function composeEntitledPrompt(
  numberedPrompt: string,
  imageRules: string,
  visualSystem: string,
  promptNumber = 1,
) {
  return compileEntitledProviderPrompt(numberedPrompt, imageRules, visualSystem, promptNumber)
    .prompt;
}

function collectByRole(names: string[], directory: string) {
  const map = new Map<string, string[]>();
  for (const name of names) {
    const key = roleKey(name);
    map.set(key, [...(map.get(key) ?? []), path.join(directory, name)]);
  }
  return map;
}

function pickRole(map: Map<string, string[]>, key: string, kind: string, errors: string[]) {
  const matches = map.get(key) ?? [];
  if (matches.length > 1)
    errors.push(
      `Ambiguous ${kind} role "${key}": ${matches.map((item) => path.basename(item)).join(', ')}`,
    );
  if (!matches.length) errors.push(`Missing ${kind} for role "${key}"`);
  return matches.length === 1 ? reference(matches[0]) : undefined;
}

function globMatches(name: string, patterns: string[]) {
  return patterns.some((pattern) => {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
    return new RegExp(`^${escaped}$`, 'i').test(name.replaceAll('\\', '/'));
  });
}

async function existingReference(file: string | undefined, errors: string[], kind: string) {
  if (!file) return undefined;
  try {
    await fs.access(file);
    return reference(file);
  } catch {
    errors.push(`Missing ${kind}: ${file}`);
    return undefined;
  }
}

async function scanManifestWorkspace(
  root: string,
  manifest: NonNullable<Awaited<ReturnType<typeof readManifest>>>,
) {
  const referenceDir = path.join(root, 'references');
  const promptsDir = path.join(root, 'prompts');
  const inputDir = path.join(root, 'input');
  const referenceNames = (await visibleFiles(referenceDir)).filter((name) =>
    imageExtensions.has(path.extname(name).toLowerCase()),
  );
  const referenceMap = collectByRole(referenceNames, referenceDir);
  const promptNames = (await visibleFiles(promptsDir)).filter(
    (name) => path.extname(name).toLowerCase() === '.txt',
  );
  const promptMap = collectByRole(promptNames, promptsDir);
  const products = (await fs.readdir(inputDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && isVisibleFile(entry.name))
    .map((entry) => entry.name)
    .sort(naturalCompare);
  const rows: MappingRow[] = [];
  for (const product of products) {
    const productRoot = path.join(inputDir, product);
    const direct = await visibleFiles(productRoot);
    const nested = await visibleFiles(path.join(productRoot, 'images'));
    const imageNames = [...direct, ...nested.map((name) => path.join('images', name))].filter(
      (name) => imageExtensions.has(path.extname(name).toLowerCase()),
    );
    const productMap = collectByRole(imageNames, productRoot);
    for (const assignment of manifest
      .filter((item) => item.enabled)
      .sort((a, b) => a.order - b.order)) {
      const errors: string[] = [];
      const role = roleKey(assignment.promptKey);
      const defaultPrompt = pickRole(promptMap, role, 'prompt', errors);
      const promptPath = assignment.promptFile
        ? await existingReference(path.resolve(root, assignment.promptFile), errors, 'prompt')
        : defaultPrompt;
      const explicitPresentation = assignment.presentationReference
        ? path.resolve(root, assignment.presentationReference)
        : undefined;
      if (explicitPresentation && !explicitPresentation.startsWith(`${referenceDir}${path.sep}`))
        errors.push('Presentation reference must come from references/, never input/.');
      const presentation =
        (await existingReference(explicitPresentation, errors, 'presentation reference')) ??
        (explicitPresentation
          ? undefined
          : pickRole(referenceMap, role, 'presentation reference', errors));
      let productInputs: ReferenceImage[];
      if (assignment.productPatterns?.length) {
        const matched = assignment
          .productPatterns!.flatMap((pattern) =>
            imageNames.filter((name) => globMatches(name, [pattern])),
          )
          .filter((name, index, all) => all.indexOf(name) === index);
        productInputs = matched.map((name) => reference(path.join(productRoot, name)));
        if (!productInputs.length)
          errors.push(`Missing product source image for manifest role "${role}"`);
      } else {
        const productInput = pickRole(productMap, role, 'product source image', errors);
        productInputs = productInput ? [productInput] : [];
      }
      const outputType =
        assignment.outputType ?? (role === 'size-chart' ? 'size-chart' : 'standard');
      const explicitMeasurement = assignment.measurementReference
        ? path.resolve(root, assignment.measurementReference)
        : undefined;
      const measurement = explicitMeasurement
        ? await existingReference(explicitMeasurement, errors, 'measurement source')
        : undefined;
      const orderedInputs = orderImageInputs(presentation, productInputs, measurement, outputType);
      if (!presentation)
        errors.push('Generation is blocked until a presentation reference is mapped.');
      if (!productInputs.length)
        errors.push('Generation is blocked until at least one product source image is mapped.');
      if (!promptPath) errors.push('Generation is blocked until a prompt is mapped.');
      const promptText = promptPath ? await fs.readFile(promptPath.path, 'utf8') : '';
      rows.push({
        id: `${product}:${role}`,
        product,
        order: assignment.order,
        promptKey: role,
        promptFile: promptPath ? path.relative(root, promptPath.path) : undefined,
        references: orderedInputs.map((item) => item.image),
        outputType,
        presentationReference: presentation,
        measurementReference: measurement,
        productInputs,
        orderedInputs,
        outputName: safeOutputName(assignment.outputName || `${role}.png`),
        enabled: assignment.enabled,
        status: errors.length ? 'error' : 'valid',
        errors,
        completePrompt: promptPath ? composeProductPrompt(promptText, outputType) : undefined,
      });
    }
  }
  return rows;
}

async function scanReusableWorkspace(root: string): Promise<MappingRow[]> {
  const referenceDir = path.join(root, 'references');
  const promptsDir = path.join(root, 'prompts');
  const inputDir = path.join(root, 'input');
  const referenceNames = (await visibleFiles(referenceDir)).filter((name) =>
    imageExtensions.has(path.extname(name).toLowerCase()),
  );
  const promptNames = (await visibleFiles(promptsDir)).filter(
    (name) => path.extname(name).toLowerCase() === '.txt',
  );
  const referenceMap = collectByRole(referenceNames, referenceDir);
  const promptMap = collectByRole(promptNames, promptsDir);
  const manifest = await readManifest(root);
  if (manifest?.length) return scanManifestWorkspace(root, manifest);
  const products = (await fs.readdir(inputDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && isVisibleFile(entry.name))
    .map((entry) => entry.name)
    .sort(naturalCompare);
  const rows: MappingRow[] = [];
  for (const product of products) {
    const productRoot = path.join(inputDir, product);
    const imageDirectory = path.join(productRoot, 'images');
    const direct = await visibleFiles(productRoot);
    const nested = await visibleFiles(imageDirectory);
    const imageNames = [...direct, ...nested.map((name) => path.join('images', name))].filter(
      (name) => imageExtensions.has(path.extname(name).toLowerCase()),
    );
    const productMap = collectByRole(imageNames, productRoot);
    const roles = [
      ...new Set([...promptMap.keys(), ...referenceMap.keys(), ...productMap.keys()]),
    ].sort(naturalCompare);
    for (const [index, role] of roles.entries()) {
      const errors: string[] = [];
      const promptPath = pickRole(promptMap, role, 'prompt', errors);
      const presentation = pickRole(referenceMap, role, 'presentation reference', errors);
      const productInput = pickRole(productMap, role, 'product source image', errors);
      const measurement =
        role === 'size-chart'
          ? pickRole(referenceMap, role, 'measurement source', errors)
          : undefined;
      const outputType = role === 'size-chart' ? 'size-chart' : 'standard';
      const productInputs = productInput ? [productInput] : [];
      const orderedInputs = orderImageInputs(presentation, productInputs, measurement, outputType);
      if (!presentation)
        errors.push('Generation is blocked until a presentation reference is mapped.');
      if (!productInputs.length)
        errors.push('Generation is blocked until at least one product source image is mapped.');
      if (!promptPath) errors.push('Generation is blocked until a prompt is mapped.');
      const promptText = promptPath ? await fs.readFile(promptPath.path, 'utf8') : '';
      rows.push({
        id: `${product}:${role}`,
        product,
        order: index + 1,
        promptKey: role,
        promptFile: promptPath ? path.relative(root, promptPath.path) : undefined,
        references: orderedInputs.map((item) => item.image),
        outputType,
        presentationReference: presentation,
        measurementReference: measurement,
        productInputs,
        orderedInputs,
        outputName: safeOutputName(`${role}.png`),
        enabled: true,
        status: errors.length ? 'error' : 'valid',
        errors,
        completePrompt: promptPath ? composeProductPrompt(promptText, outputType) : undefined,
      });
    }
  }
  return rows;
}

async function scanLegacyBatch(
  inputRoot: string,
  allImagesAsReferences = false,
): Promise<MappingRow[]> {
  const rootMaster = await fs
    .readFile(path.join(inputRoot, 'master_prompt.txt'), 'utf8')
    .catch(() => undefined);
  const products = (await fs.readdir(inputRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && isVisibleFile(entry.name))
    .map((entry) => entry.name)
    .sort(naturalCompare);
  const rows: MappingRow[] = [];
  for (const product of products) {
    const productPath = path.join(inputRoot, product);
    const imageDir = path.join(productPath, 'images');
    const promptsDir = path.join(productPath, 'prompts');
    const images = (await visibleFiles(imageDir)).filter((name) =>
      imageExtensions.has(path.extname(name).toLowerCase()),
    );
    const promptNames = (await visibleFiles(promptsDir)).filter(
      (name) => path.extname(name).toLowerCase() === '.txt',
    );
    const promptMaster = await fs
      .readFile(path.join(productPath, 'master_prompt.txt'), 'utf8')
      .catch(() => undefined);
    const manifest = await readManifest(productPath);
    const promptByStem = new Map(
      promptNames.map((name) => [path.basename(name, path.extname(name)).toLowerCase(), name]),
    );
    const promptByPrefix = new Map<string, string[]>();
    for (const name of promptNames) {
      const prefix = numericPrefix(path.basename(name, path.extname(name)));
      if (prefix) promptByPrefix.set(prefix, [...(promptByPrefix.get(prefix) ?? []), name]);
    }
    const assignments =
      manifest ??
      promptNames.map((name, index) => ({
        order: index + 1,
        promptKey: path.basename(name, path.extname(name)),
        promptFile: path.posix.join('prompts', name),
        referencePatterns: [],
        outputName: `${path.basename(name, path.extname(name))}_result.png`,
        enabled: true,
      }));
    for (const assignment of assignments.sort((a, b) => a.order - b.order)) {
      const promptFileName = path.basename(assignment.promptFile);
      const promptStem = path.basename(promptFileName, path.extname(promptFileName)).toLowerCase();
      const prefix = numericPrefix(promptStem);
      const exact = promptByStem.get(promptStem);
      const prefixMatches = prefix ? (promptByPrefix.get(prefix) ?? []) : [];
      const errors: string[] = [];
      const actualPrompt = exact ?? (prefixMatches.length === 1 ? prefixMatches[0] : undefined);
      if (!actualPrompt)
        errors.push(
          prefixMatches.length > 1
            ? `Ambiguous prompt mapping for ${promptFileName}`
            : `Missing prompt for ${promptFileName}`,
        );
      const matched = allImagesAsReferences
        ? images
        : images.filter((name) =>
            name.toLowerCase().startsWith(
              path
                .basename(actualPrompt ?? promptFileName, '.txt')
                .toLowerCase()
                .replace(/\.txt$/, ''),
            ),
          );
      if (!matched.length) errors.push(`Missing product source image for ${promptFileName}`);
      const products = matched.map((name): ReferenceImage => ({
        name,
        path: path.join(imageDir, name),
      }));
      const completePrompt = actualPrompt
        ? await readPrompt(path.join(promptsDir, actualPrompt), promptMaster ?? rootMaster)
        : undefined;
      const orderedInputs = orderImageInputs(undefined, products);
      errors.push(
        'Legacy batch has no separate presentation reference. Use references/, prompts/, and input/ workspace structure.',
      );
      rows.push({
        id: `${product}:${assignment.promptKey}`,
        product,
        order: assignment.order,
        promptKey: assignment.promptKey,
        promptFile: actualPrompt ? path.posix.join('prompts', actualPrompt) : assignment.promptFile,
        references: products,
        outputType: 'legacy',
        productInputs: products,
        orderedInputs,
        outputName: safeOutputName(assignment.outputName),
        enabled: assignment.enabled,
        status: errors.length ? 'error' : 'valid',
        errors,
        completePrompt: completePrompt ? composeProductPrompt(completePrompt, 'legacy') : undefined,
      });
    }
  }
  return rows;
}

export async function scanBatch(inputRoot: string, allImagesAsReferences = false) {
  const entries = await fs.readdir(inputRoot, { withFileTypes: true });
  return entries.some((entry) => entry.isDirectory() && entry.name === 'references') &&
    entries.some((entry) => entry.isDirectory() && entry.name === 'input')
    ? scanReusableWorkspace(inputRoot)
    : scanLegacyBatch(inputRoot, allImagesAsReferences);
}
