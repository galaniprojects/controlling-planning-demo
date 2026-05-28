import { describe, it, expect } from 'vitest';
import { parseAllocationError } from './parseAllocationError';

describe('parseAllocationError', () => {
  it('returns generic on empty input', () => {
    const r = parseAllocationError('');
    expect(r.type).toBe('generic');
    expect(r.message).toBe('Save failed');
  });

  it('returns generic on plain string', () => {
    const r = parseAllocationError('Network failure');
    expect(r.type).toBe('generic');
    expect(r.message).toBe('Network failure');
  });

  it('parses a cycle 409 detail', () => {
    const raw = JSON.stringify({
      message: 'Edge would create a cycle.',
      cycle_chain: ['ITF00001', 'ITF00002', 'ITF00001'],
    });
    const r = parseAllocationError(raw);
    expect(r.type).toBe('cycle');
    if (r.type === 'cycle') {
      expect(r.cycleChain).toEqual(['ITF00001', 'ITF00002', 'ITF00001']);
      expect(r.message).toBe('Edge would create a cycle.');
    }
  });

  it('parses a depth violation 409 detail', () => {
    const raw = JSON.stringify({
      message: 'Path exceeds max allocation depth.',
      violating_path: ['A', 'B', 'C', 'D', 'E'],
    });
    const r = parseAllocationError(raw);
    expect(r.type).toBe('depth');
    if (r.type === 'depth') {
      expect(r.violatingPath).toEqual(['A', 'B', 'C', 'D', 'E']);
    }
  });

  it('prefers cycle when both fields somehow present', () => {
    const raw = JSON.stringify({
      message: 'Boom',
      cycle_chain: ['X', 'Y', 'X'],
      violating_path: ['X', 'Y', 'Z'],
    });
    const r = parseAllocationError(raw);
    expect(r.type).toBe('cycle');
  });

  it('returns generic when JSON has no recognised keys', () => {
    const r = parseAllocationError(JSON.stringify({ message: 'Other 409' }));
    expect(r.type).toBe('generic');
    expect(r.message).toBe('Other 409');
  });

  it('returns generic when cycle_chain is empty array', () => {
    const r = parseAllocationError(
      JSON.stringify({ message: 'm', cycle_chain: [] }),
    );
    expect(r.type).toBe('generic');
  });

  it('returns generic when violating_path contains non-strings', () => {
    const r = parseAllocationError(
      JSON.stringify({ message: 'm', violating_path: ['A', 2, 'C'] }),
    );
    expect(r.type).toBe('generic');
  });
});
