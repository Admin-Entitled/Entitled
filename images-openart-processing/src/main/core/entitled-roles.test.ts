import { describe, expect, it } from 'vitest';
import {
  createProductSourceImages,
  detectProductImageRole,
  orderEntitledInputs,
  resolvePromptProductInputs,
} from './entitled-roles.js';

const sources = createProductSourceImages(
  ['1-front.jpeg', '2-back.jpeg', '3-detail.jpeg', '4-label.jpeg', '5-fabric.jpeg'].map((name) => ({
    path: `/product/${name}`,
    name,
  })),
);

describe('Entitled product image roles', () => {
  it('detects roles from tokens, not numeric position', () => {
    expect(detectProductImageRole('1-front.jpeg').role).toBe('FRONT');
    expect(detectProductImageRole('2-back.jpeg').role).toBe('BACK');
    expect(detectProductImageRole('3-detail.jpeg').role).toBe('DETAIL');
    expect(detectProductImageRole('4-label.jpeg').role).toBe('LABEL_BRANDING');
    expect(detectProductImageRole('10-texture.webp').role).toBe('FABRIC');
    expect(detectProductImageRole('1.jpg').role).toBe('UNASSIGNED');
  });

  it('excludes BACK from Prompt 01 and preserves role order', () => {
    const result = resolvePromptProductInputs(1, sources);
    expect(result.included.map((item) => item.name)).toEqual([
      '1-front.jpeg',
      '3-detail.jpeg',
      '4-label.jpeg',
      '5-fabric.jpeg',
    ]);
    expect(result.excluded.map((item) => item.name)).toEqual(['2-back.jpeg']);
    expect(
      orderEntitledInputs({ path: '/ref.png', name: 'ref.png' }, result.included).map(
        (item) => item.image.name,
      ),
    ).toEqual(['ref.png', '1-front.jpeg', '3-detail.jpeg', '4-label.jpeg', '5-fabric.jpeg']);
  });

  it('requires and prioritizes BACK for Prompt 08', () => {
    const result = resolvePromptProductInputs(8, sources);
    expect(result.errors).toEqual([]);
    expect(result.included.map((item) => item.role)).toEqual([
      'BACK',
      'FRONT',
      'DETAIL',
      'LABEL_BRANDING',
      'FABRIC',
    ]);
  });

  it('uses only FABRIC and DETAIL for Prompt 09', () => {
    const result = resolvePromptProductInputs(9, sources);
    expect(result.included.map((item) => item.name)).toEqual(['5-fabric.jpeg', '3-detail.jpeg']);
    expect(result.excluded.map((item) => item.name)).toEqual([
      '1-front.jpeg',
      '2-back.jpeg',
      '4-label.jpeg',
    ]);
  });

  it('blocks unassigned and ambiguous primary roles', () => {
    const ambiguous = createProductSourceImages([
      { path: '/product/1-front.jpeg', name: '1-front.jpeg' },
      { path: '/product/2-front.jpeg', name: '2-front.jpeg' },
      { path: '/product/3-unknown.jpeg', name: '3-unknown.jpeg' },
    ]);
    const result = resolvePromptProductInputs(1, ambiguous);
    expect(result.errors.some((error) => error.includes('Ambiguous FRONT'))).toBe(true);
    expect(result.errors.some((error) => error.includes('Unassigned'))).toBe(true);
  });

  it('keeps ordinary product photos out of Prompt 10', () => {
    const result = resolvePromptProductInputs(10, sources);
    expect(result.included).toEqual([]);
    expect(result.excluded).toHaveLength(sources.length);
  });
});
