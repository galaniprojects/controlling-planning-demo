/**
 * Throwaway A/B hook for the External Costs / F&P grid legend variants.
 *
 * Returns the current legend style ('chips' | 'dots') and a toggle function.
 * Persists the choice to `localStorage['creta:legend-style']` so the user's
 * pick survives a refresh while we A/B test the two designs.
 *
 * Both grid surfaces (External Costs monthly grid, F&P MixedGranularityGrid)
 * read from this same hook so flipping the toggle on one grid updates the
 * other on next render.
 *
 * NOTE: this hook is scaffolding. Once we pick a winner, this file plus the
 * loser branch in each legend component get deleted in a follow-up commit.
 */
import { useCallback, useEffect, useState } from 'react';

export type LegendStyle = 'chips' | 'dots';

const STORAGE_KEY = 'creta:legend-style';
const DEFAULT_STYLE: LegendStyle = 'chips';

function readStorage(): LegendStyle {
  if (typeof window === 'undefined') return DEFAULT_STYLE;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === 'dots' || v === 'chips' ? v : DEFAULT_STYLE;
  } catch {
    return DEFAULT_STYLE;
  }
}

export function useLegendStyle(): {
  style: LegendStyle;
  toggle: () => void;
} {
  const [style, setStyle] = useState<LegendStyle>(readStorage);

  // Re-sync if another tab / component mutates the same key.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      const next = e.newValue;
      if (next === 'chips' || next === 'dots') setStyle(next);
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggle = useCallback(() => {
    setStyle((prev) => {
      const next: LegendStyle = prev === 'chips' ? 'dots' : 'chips';
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // storage may be disabled — fall back to in-memory only.
      }
      return next;
    });
  }, []);

  return { style, toggle };
}
