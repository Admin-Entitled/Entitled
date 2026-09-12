import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import type { BatchSettings, MappingRow } from '../../shared/types.js';

export async function createBatchFingerprint(
  rows: MappingRow[],
  outputRoot: string,
  settings: BatchSettings,
): Promise<string> {
  const paths = new Set<string>();
  for (const row of rows.filter((candidate) => candidate.enabled && candidate.status === 'valid')) {
    row.orderedInputs.forEach((input) => paths.add(input.image.path));
    (row.sourceImages ?? []).forEach((source) => paths.add(source.path));
  }
  const hashes = new Map<string, string>();
  await Promise.all([...paths].map(async (file) => hashes.set(file, await hashFile(file))));
  const jobs = rows
    .filter((row) => row.enabled && row.status === 'valid')
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((row) => ({
      id: row.id,
      outputName: row.outputName,
      promptHash: sha256(row.completePrompt ?? ''),
      inputs: row.orderedInputs.map((input) => ({
        order: input.order,
        role: input.role,
        path: input.image.path,
        sha256: hashes.get(input.image.path) ?? '',
      })),
      sourceMappings: (row.sourceImages ?? []).map((source) => ({
        path: source.path,
        detectedRole: source.detectedRole,
        role: source.role,
        sha256: hashes.get(source.path) ?? '',
      })),
    }));
  return sha256(
    JSON.stringify({
      outputRoot,
      model: settings.model,
      outputs: settings.outputs,
      aspectRatio: settings.aspectRatio,
      resolution: settings.resolution,
      seed: settings.seed,
      concurrency: settings.concurrency,
      retryLimit: settings.retryLimit,
      overwrite: settings.overwrite,
      allImagesAsReferences: settings.allImagesAsReferences,
      jobs,
    }),
  );
}

async function hashFile(file: string) {
  return sha256(await fs.readFile(file));
}

function sha256(value: string | Buffer) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
