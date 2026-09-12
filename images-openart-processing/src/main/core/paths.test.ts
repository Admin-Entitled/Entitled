import { describe, expect, it } from 'vitest';
import { numericPrefix, safeOutputName, versionOutputPath } from './paths.js';
describe('output naming', () => {
  it('versions existing output without overwrite', () =>
    expect(
      versionOutputPath(
        '/tmp/01 result.png',
        (p) => p !== '/tmp/01 result.png' && p !== '/tmp/01 result_v2.png',
      ),
    ).toBe('/tmp/01 result.png'));
  it('finds next available version', () =>
    expect(
      versionOutputPath(
        '/tmp/result.png',
        (p) => p === '/tmp/result.png' || p === '/tmp/result_v2.png',
      ),
    ).toBe('/tmp/result_v3.png'));
});
describe('path safety', () => {
  it('extracts numeric prefixes and sanitizes names', () => {
    expect(numericPrefix('01_front')).toBe('01');
    expect(numericPrefix('front')).toBe('');
    expect(safeOutputName('../unsafe?.png')).toBe('unsafe_.png');
    expect(safeOutputName('')).toBe('result.png');
  });
});
