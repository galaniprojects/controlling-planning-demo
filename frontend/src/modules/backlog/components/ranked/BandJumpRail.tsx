/**
 * BandJumpRail — sticky right rail with jump buttons to each cutoff band.
 * [A-BK-17]
 */

import { ChevronDown } from 'lucide-react';

interface Band {
  id: string;
  label: string;
}

interface Props {
  bands: Band[];
}

export function BandJumpRail({ bands }: Props) {
  if (bands.length === 0) return null;

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-20 flex flex-col gap-1.5">
      {bands.map((band) => (
        <button
          key={band.id}
          type="button"
          onClick={() => scrollTo(band.id)}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown className="size-3" aria-hidden />
          {band.label}
        </button>
      ))}
    </div>
  );
}
