import { describe, it, expect } from 'vitest';
import { distributeQuarterly, quarterMonths } from './quarterMath';

describe('quarterMonths', () => {
  it('expands Q1 / Q2 / Q3 / Q4 to their three months', () => {
    expect(quarterMonths('2026-Q1')).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(quarterMonths('2026-Q2')).toEqual(['2026-04', '2026-05', '2026-06']);
    expect(quarterMonths('2026-Q3')).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(quarterMonths('2026-Q4')).toEqual(['2026-10', '2026-11', '2026-12']);
  });
});

describe('distributeQuarterly', () => {
  it('splits an evenly-divisible total into equal thirds', () => {
    const out = distributeQuarterly(300, quarterMonths('2026-Q2'));
    expect(out.get('2026-04')).toBe(100);
    expect(out.get('2026-05')).toBe(100);
    expect(out.get('2026-06')).toBe(100);
  });

  it('applies the cent remainder to the last month', () => {
    // 100 / 3 = 33.33 each; last gets the remainder so the sum is exact.
    const out = distributeQuarterly(100, quarterMonths('2026-Q2'));
    expect(out.get('2026-04')).toBe(33.33);
    expect(out.get('2026-05')).toBe(33.33);
    expect(out.get('2026-06')).toBe(33.34);
    const sum =
      (out.get('2026-04') ?? 0) +
      (out.get('2026-05') ?? 0) +
      (out.get('2026-06') ?? 0);
    expect(Math.round(sum * 100) / 100).toBe(100);
  });

  it('preserves the exact total for an awkward value', () => {
    const months = quarterMonths('2026-Q3');
    const out = distributeQuarterly(1000.07, months);
    const sum = months.reduce((s, m) => s + (out.get(m) ?? 0), 0);
    expect(Math.round(sum * 100) / 100).toBe(1000.07);
  });

  it('returns an empty map for no months', () => {
    expect(distributeQuarterly(100, []).size).toBe(0);
  });

  it('handles zero total', () => {
    const out = distributeQuarterly(0, quarterMonths('2026-Q1'));
    expect(out.get('2026-01')).toBe(0);
    expect(out.get('2026-03')).toBe(0);
  });
});
