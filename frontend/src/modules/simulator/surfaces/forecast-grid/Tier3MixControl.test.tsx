/**
 * T1 — Tier-3 render-null contract for the mix control (spec §8).
 *
 * The seniority/sourcing mix is the lone Tier-3 grid control: for a non-Tier-3
 * author it must NOT be rendered (return null) — not greyed out, not disabled.
 * No jsdom in this project, so we render to static markup (effects don't run,
 * which is fine — we only assert the null vs non-null branch) and mock the hooks
 * + the Radix Select primitive (which needs a DOM) to plain elements.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const useTier3Mock = vi.fn();

vi.mock('../../permissions', () => ({
  useTier3: (...args: unknown[]) => useTier3Mock(...args),
}));

vi.mock('../../useScenarioContext', () => ({
  useScenarioContext: () => ({
    scenarioId: 1,
    tier3Visible: true,
    writeMixChange: vi.fn(),
    revertMixChange: vi.fn(),
  }),
}));

vi.mock('@/api/endpoints', () => ({
  referenceApi: { getRoles: () => Promise.resolve({ items: [] }) },
}));

vi.mock('../../api/scenariosApi', () => ({
  scenariosApi: { getScenarioMix: () => Promise.resolve({ mix_changes: [] }) },
}));

// Radix Select needs a real DOM; replace with passthroughs for static render.
vi.mock('@/components/ui/select', () => {
  const Pass = ({ children }: { children?: unknown }) =>
    createElement('div', null, children as never);
  return {
    Select: Pass,
    SelectContent: Pass,
    SelectItem: Pass,
    SelectTrigger: Pass,
    SelectValue: Pass,
  };
});

import { Tier3MixControl } from './Tier3MixControl';

describe('Tier3MixControl render-null gate', () => {
  beforeEach(() => useTier3Mock.mockReset());

  it('renders nothing for a non-Tier-3 author', () => {
    useTier3Mock.mockReturnValue(false);
    const html = renderToStaticMarkup(
      createElement(Tier3MixControl, {
        projectId: 'p1',
        openMonth: '2026-04',
        onMutated: () => {},
      }),
    );
    expect(html).toBe('');
  });

  it('renders the control for a Tier-3 author', () => {
    useTier3Mock.mockReturnValue(true);
    const html = renderToStaticMarkup(
      createElement(Tier3MixControl, {
        projectId: 'p1',
        openMonth: '2026-04',
        onMutated: () => {},
      }),
    );
    expect(html).toContain('Seniority / sourcing mix');
    expect(html).toContain('Tier 3');
  });
});
