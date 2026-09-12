import { expect, it } from 'vitest';
import { formatIstTimestamp } from './timestamp.js';

it('formats UTC timestamps in IST for operators', () => {
  expect(formatIstTimestamp('2026-09-12T19:56:15.000Z')).toBe('13 Sep 2026, 1:26:15 AM IST');
});
