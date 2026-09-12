import { z } from 'zod';

export const batchSettingsSchema = z.object({
  model: z.string().min(1),
  aspectRatio: z.string().optional(),
  resolution: z.string().optional(),
  outputs: z.number().int().min(1).max(8),
  seed: z.number().int().optional(),
  concurrency: z.number().int().min(1).max(5),
  retryLimit: z.number().int().min(0).max(10),
  overwrite: z.boolean(),
  allImagesAsReferences: z.boolean(),
});
export function assertBatchSettings(value: unknown) {
  return batchSettingsSchema.parse(value);
}
