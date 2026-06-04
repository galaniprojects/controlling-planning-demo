import { describe, it, expect } from 'vitest';
import { parseServerTimestamp } from './formatters';

describe('parseServerTimestamp', () => {
  // The backend emits naive UTC; the parsed instant must equal the same
  // wall-clock time interpreted as UTC, regardless of the runner's local zone.
  const expectedUtc = Date.UTC(2026, 5, 4, 10, 30, 0, 0); // 2026-06-04 10:30:00Z

  it('treats a space-separated naive timestamp as UTC', () => {
    expect(parseServerTimestamp('2026-06-04 10:30:00')).toBe(expectedUtc);
  });

  it('treats an ISO "T" naive timestamp as UTC', () => {
    expect(parseServerTimestamp('2026-06-04T10:30:00')).toBe(expectedUtc);
  });

  it('handles fractional seconds (naive)', () => {
    expect(parseServerTimestamp('2026-06-04 10:30:00.000')).toBe(expectedUtc);
  });

  it('respects an explicit Z without double-appending', () => {
    expect(parseServerTimestamp('2026-06-04T10:30:00Z')).toBe(expectedUtc);
  });

  it('respects an explicit numeric offset', () => {
    // 12:30 at +02:00 is 10:30 UTC.
    expect(parseServerTimestamp('2026-06-04T12:30:00+02:00')).toBe(expectedUtc);
  });

  it('returns NaN for unparseable input', () => {
    expect(Number.isNaN(parseServerTimestamp('not-a-date'))).toBe(true);
  });
});
