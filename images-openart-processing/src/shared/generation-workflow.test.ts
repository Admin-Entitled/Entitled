import { describe, expect, it } from 'vitest';
import { generationConfirmationText } from './generation-confirmation.js';
import { canGenerateBatch } from './generation-gating.js';

describe('simplified generation workflow', () => {
  it('allows generation after successful local validation without a credit estimate', () => {
    expect(
      canGenerateBatch({
        validJobCount: 1,
        invalidJobCount: 0,
        outputRoot: '/results',
        validationIsCurrent: true,
      }),
    ).toBe(true);
  });

  it('requires current local validation and valid durable output prerequisites', () => {
    expect(
      canGenerateBatch({
        validJobCount: 1,
        invalidJobCount: 0,
        outputRoot: '/results',
        validationIsCurrent: false,
      }),
    ).toBe(false);
    expect(
      canGenerateBatch({
        validJobCount: 1,
        invalidJobCount: 1,
        outputRoot: '/results',
        validationIsCurrent: true,
      }),
    ).toBe(false);
  });

  it('builds the simple confirmation without manual authorization controls', () => {
    const text = generationConfirmationText({
      products: 1,
      jobs: 1,
      model: 'GPT Image 2',
      outputRoot: '/results',
    });
    expect(text).toContain('Generate selected images?');
    expect(text).toContain('Products: 1');
    expect(text).toContain('Jobs: 1');
    expect(text).toContain('Output folder: /results');
    expect(text).toContain('OpenArt credits will be used');
  });
});
