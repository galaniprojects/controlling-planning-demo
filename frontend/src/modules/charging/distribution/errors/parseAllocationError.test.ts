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

  // ───────────────────────── S-5 hardening ──────────────────────────

  it('returns generic when input is JSON-encoded null (S-5 hardening)', () => {
    const r = parseAllocationError(JSON.stringify(null));
    expect(r.type).toBe('generic');
    // Raw string passes through so the banner shows the original payload
    // for diagnosis rather than silently rewriting it to "Save failed".
    expect(r.message).toBe('null');
  });

  it('returns generic when input is a JSON array (S-5 hardening)', () => {
    // Pre-S-5 the `typeof parsed !== 'object'` guard let arrays through
    // (`typeof [] === 'object'`), and the discriminator would read
    // `cycle_chain` off the Array prototype (always undefined). Tighter
    // guard here surfaces the raw body so an array bug is debuggable.
    const raw = JSON.stringify(['cycle_chain', 'violating_path']);
    const r = parseAllocationError(raw);
    expect(r.type).toBe('generic');
    expect(r.message).toBe(raw);
  });

  it('parses double-encoded JSON with cycle_chain (S-5 hardening)', () => {
    // Some middleware paths stringify the detail twice — `obj.message`
    // ends up being the original JSON object as a string. The parser
    // should unwrap and discriminate on the inner record.
    const inner = {
      message: 'Edge would create a cycle.',
      cycle_chain: ['ITF00001', 'ITF00002', 'ITF00001'],
    };
    const outer = JSON.stringify({ message: JSON.stringify(inner) });
    const r = parseAllocationError(outer);
    expect(r.type).toBe('cycle');
    if (r.type === 'cycle') {
      expect(r.cycleChain).toEqual(['ITF00001', 'ITF00002', 'ITF00001']);
      expect(r.message).toBe('Edge would create a cycle.');
    }
  });

  it('parses double-encoded JSON with violating_path (S-5 hardening)', () => {
    const inner = {
      message: 'Path exceeds max allocation depth.',
      violating_path: ['A', 'B', 'C', 'D', 'E', 'F'],
    };
    const outer = JSON.stringify({ message: JSON.stringify(inner) });
    const r = parseAllocationError(outer);
    expect(r.type).toBe('depth');
    if (r.type === 'depth') {
      expect(r.violatingPath).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    }
  });

  it('falls back to outer message when double-encode parse fails (S-5 hardening)', () => {
    // `message` starts with `{` but isn't valid JSON — don't blow up,
    // just keep treating the outer object as the discriminator source.
    const raw = JSON.stringify({ message: '{not-actually-json}' });
    const r = parseAllocationError(raw);
    expect(r.type).toBe('generic');
    expect(r.message).toBe('{not-actually-json}');
  });

  it('preserves Wave A cycle-chain happy path verbatim', () => {
    // Sanity: the original `cycle_chain` extraction path that Wave A's
    // recovery flow depends on still works after S-5 reshuffling.
    const raw = JSON.stringify({
      message: 'Edge would create a cycle.',
      cycle_chain: ['A', 'B', 'A'],
    });
    const r = parseAllocationError(raw);
    expect(r.type).toBe('cycle');
    if (r.type === 'cycle') {
      expect(r.cycleChain).toEqual(['A', 'B', 'A']);
    }
  });
});
