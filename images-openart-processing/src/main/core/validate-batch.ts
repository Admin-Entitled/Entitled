import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createBatchFingerprint } from './batch-fingerprint.js';
import { validateOutputDirectory } from './output-directory.js';
import { RUNTIME_PROMPT_SAFETY_CEILING } from './runtime-prompt-compiler.js';
import type {
  BatchSettings,
  MappingRow,
  ProviderStatus,
  ValidationReport,
} from '../../shared/types.js';

/** Local-only validation. This function intentionally has no database side effects and never uploads. */
export async function validateBatch(
  rows: MappingRow[],
  inputRoot: string,
  outputRoot: string,
  settings: BatchSettings,
): Promise<ValidationReport> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const inputs: ValidationReport['inputs'] = [];
  const promptLengths: ValidationReport['promptLengths'] = [];
  const outputPaths: string[] = [];
  const providerStatus: ProviderStatus = {
    connected: false,
    provider: 'cli',
    message: 'Not checked during local validation.',
  };
  if (settings.model !== 'gpt-image-2') errors.push('ENTITLED Catalogue v1 requires GPT Image 2.');
  if (settings.outputs !== 1) errors.push('Each job must request exactly one output.');
  try {
    await validateOutputDirectory(outputRoot, false);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Results folder is not writable.');
  }
  if (!inputRoot) errors.push('Select a product input folder.');
  const validRows = rows.filter((row) => row.enabled);
  if (!validRows.length) errors.push('Select at least one valid product and output.');
  for (const row of validRows) {
    errors.push(...row.errors);
    if (!row.completePrompt)
      errors.push(`Prompt ${row.promptKey} has no compiled provider prompt.`);
    else {
      const length = [...row.completePrompt].length;
      promptLengths.push({
        promptKey: row.promptKey,
        length,
        promptHash: sha256(row.completePrompt),
      });
      if (length >= RUNTIME_PROMPT_SAFETY_CEILING)
        errors.push(
          `Prompt ${row.promptKey} is ${length} characters; maximum safe length is ${RUNTIME_PROMPT_SAFETY_CEILING}.`,
        );
    }
    const output = path.join(outputRoot, row.outputGroup ?? row.product, row.outputName);
    outputPaths.push(output);
    if (row.inputMode === 'flat-front' && !settings.overwrite) {
      try {
        await fs.access(output);
        errors.push(`Output already exists for ${row.product}; choose Replace existing to continue.`);
      } catch {
        /* new output */
      }
    }
    for (const input of row.orderedInputs) {
      const file = path.resolve(input.image.path);
      try {
        const stat = await fs.stat(file);
        await fs.access(file, fs.constants.R_OK);
        const bytes = await fs.readFile(file);
        inputs.push({ path: file, role: input.label, sha256: sha256(bytes), size: stat.size });
      } catch {
        errors.push(`Unreadable provider input: ${input.image.name}`);
      }
    }
  }
  if (new Set(outputPaths).size !== outputPaths.length)
    errors.push('Two selected jobs resolve to the same output path.');
  let fingerprint: string | undefined;
  if (!errors.length) fingerprint = await createBatchFingerprint(validRows, outputRoot, settings);
  return {
    ok: errors.length === 0,
    validatedAt: new Date().toISOString(),
    fingerprint,
    providerStatus,
    products: new Set(validRows.map((row) => row.product)).size,
    jobs: validRows.length,
    errors: [...new Set(errors)],
    warnings,
    inputs: dedupeInputs(inputs),
    promptLengths,
    outputPaths,
  };
}

function dedupeInputs(inputs: ValidationReport['inputs']) {
  const seen = new Map<string, ValidationReport['inputs'][number]>();
  for (const input of inputs)
    if (!seen.has(`${input.path}:${input.role}`)) seen.set(`${input.path}:${input.role}`, input);
  return [...seen.values()];
}

function sha256(value: string | Buffer) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
