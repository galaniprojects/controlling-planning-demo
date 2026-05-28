import { describe, it, expect } from 'vitest';
import { projectAllocation, previewLineWidth } from './projectAllocation';

describe('previewLineWidth', () => {
  it('returns minimum 1px at 0%', () => {
    expect(previewLineWidth(0)).toBe(1);
  });
  it('grows linearly: 25% → 6px', () => {
    expect(previewLineWidth(25)).toBe(6);
  });
  it('caps at 21px at 100%', () => {
    expect(previewLineWidth(100)).toBe(21);
  });
  it('caps at 21px above 100% (defensive)', () => {
    expect(previewLineWidth(200)).toBe(21);
  });
  it('handles non-finite input', () => {
    expect(previewLineWidth(Number.NaN)).toBe(1);
  });
});

describe('projectAllocation', () => {
  const focal = 100_000;

  it('returns empty projection when no rows and 0 to-business', () => {
    const r = projectAllocation({
      focalEffectiveCost: focal,
      rows: [],
      toBusinessPct: 0,
    });
    expect(r.downstream.length).toBe(0);
    expect(r.toBusinessAmount).toBe(0);
    expect(r.selfRetainedPct).toBe(100);
    expect(r.isOverAllocated).toBe(false);
    expect(r.isComplete).toBe(false);
  });

  it('computes downstream amounts as focal × pct / 100', () => {
    const r = projectAllocation({
      focalEffectiveCost: focal,
      rows: [
        { key: 'a', destinationId: 'A', percentage: 25 },
        { key: 'b', destinationId: 'B', percentage: 40 },
      ],
      toBusinessPct: 10,
    });
    expect(r.downstream[0].amount).toBe(25_000);
    expect(r.downstream[1].amount).toBe(40_000);
    expect(r.toBusinessPct).toBe(10);
    expect(r.toBusinessAmount).toBe(10_000);
    expect(r.distributedPct).toBe(65);
    expect(r.selfRetainedPct).toBe(25);
    expect(r.isOverAllocated).toBe(false);
    expect(r.isComplete).toBe(false);
  });

  it('surfaces pending toBusinessPct (S-2 regression: previewing live edits)', () => {
    // The side panel reads toBusinessPct from the projection, not from
    // cascade.focal.to_business_pct — so an unsaved edit to the
    // To-Business field shows the *pending* value, not the server one.
    const r = projectAllocation({
      focalEffectiveCost: focal,
      rows: [],
      toBusinessPct: 42.5,
    });
    expect(r.toBusinessPct).toBe(42.5);
    expect(r.toBusinessAmount).toBe(42_500);
  });

  it('flags isComplete at exactly 100%', () => {
    const r = projectAllocation({
      focalEffectiveCost: focal,
      rows: [
        { key: 'a', destinationId: 'A', percentage: 60 },
        { key: 'b', destinationId: 'B', percentage: 30 },
      ],
      toBusinessPct: 10,
    });
    expect(r.isComplete).toBe(true);
    expect(r.isOverAllocated).toBe(false);
    expect(r.selfRetainedPct).toBe(0);
  });

  it('flags isOverAllocated when sum exceeds 100', () => {
    const r = projectAllocation({
      focalEffectiveCost: focal,
      rows: [
        { key: 'a', destinationId: 'A', percentage: 70 },
        { key: 'b', destinationId: 'B', percentage: 40 },
      ],
      toBusinessPct: 0,
    });
    expect(r.isOverAllocated).toBe(true);
    expect(r.selfRetainedPct).toBe(-10);
    expect(r.distributedPct).toBe(110);
  });

  it('attaches a stable lineWidthPx per row', () => {
    const r = projectAllocation({
      focalEffectiveCost: focal,
      rows: [
        { key: 'a', destinationId: 'A', percentage: 50 },
      ],
      toBusinessPct: 0,
    });
    expect(r.downstream[0].lineWidthPx).toBe(11);
  });

  it('tolerates floating-point dust around 100%', () => {
    const r = projectAllocation({
      focalEffectiveCost: focal,
      rows: [
        { key: 'a', destinationId: 'A', percentage: 33.333333 },
        { key: 'b', destinationId: 'B', percentage: 33.333333 },
        { key: 'c', destinationId: 'C', percentage: 33.333334 },
      ],
      toBusinessPct: 0,
    });
    // distributedPct rounds to 100.00 — should not be "over"
    expect(r.isOverAllocated).toBe(false);
  });

  it('rounds distributedPct to 2 decimals', () => {
    const r = projectAllocation({
      focalEffectiveCost: focal,
      rows: [
        { key: 'a', destinationId: 'A', percentage: 1.005 },
        { key: 'b', destinationId: 'B', percentage: 2.007 },
      ],
      toBusinessPct: 0,
    });
    expect(r.distributedPct).toBe(3.01);
  });
});
