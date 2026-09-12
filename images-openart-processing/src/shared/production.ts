import type { BatchSettings } from './types.js';

export const productionTargetWarning =
  'Technical generation supported. Selected OpenArt CLI configuration does not directly match the required 1:1 production output.';

export function productionReadinessWarning(
  provider: 'cli' | 'mock' | 'mcp',
  settings: BatchSettings,
): string | undefined {
  if (provider !== 'cli') return undefined;
  if (
    settings.outputs !== 1 ||
    settings.aspectRatio !== '1:1' ||
    settings.resolution !== '1254x1254'
  )
    return productionTargetWarning;
  return undefined;
}
