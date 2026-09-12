import { describe, expect, it } from 'vitest';
import { productionReadinessWarning, productionTargetWarning } from '../../shared/production.js';

const settings = {
  model: 'gpt-image-2',
  outputs: 1,
  concurrency: 1,
  retryLimit: 0,
  overwrite: false,
  allImagesAsReferences: false,
};

describe('production readiness warning', () => {
  it('warns when the CLI configuration is not the exact production target', () => {
    expect(productionReadinessWarning('cli', settings)).toBe(productionTargetWarning);
  });

  it('does not warn for mock mode', () => {
    expect(productionReadinessWarning('mock', settings)).toBeUndefined();
  });
});
