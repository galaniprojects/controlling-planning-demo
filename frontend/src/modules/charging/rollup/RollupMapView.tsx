/**
 * Location Cost Rollup map view per [F-RV-03].
 *
 * - Static SVG world map (no tile service per spec).
 * - Bubbles at country level by default; click a country to drill into the
 *   charging locations within it (bubbles redrawn at location-level offsets
 *   around the country centroid).
 * - Bubble size = cost magnitude (square-root scale so doubling cost does
 *   not double the radius).
 * - Bubble color = division (dominant share for the country / location).
 * - Hover reveals a popup with the entity-level breakdown.
 * - Quiet, neutral palette per spec.
 */
import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/shared/Skeleton';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/formatters';
import { useChargingRollupData, type PerLocationCell } from './useChargingRollupData';
import { projectCountry, VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from './countryCoords';
import { WorldMap } from './worldMapPaths';

interface Props {
  year: number;
  version: string;
}

// Quiet palette — semantic-token compatible. `dark:` siblings are not
// strictly necessary because we render bubbles inside an SVG that already
// uses currentColor / direct fills, but we keep them muted enough that the
// map stays a tile rather than the hero.
const DIVISION_COLORS: Record<string, { fill: string; stroke: string; label: string }> = {
  'Corporate IT': { fill: '#3B82F6', stroke: '#1D4ED8', label: 'Corporate IT' },
  'Truck & Bus': { fill: '#F59E0B', stroke: '#B45309', label: 'Truck & Bus' },
  'Rail Vehicle': { fill: '#10B981', stroke: '#047857', label: 'Rail Vehicle' },
  '__other__': { fill: '#94A3B8', stroke: '#475569', label: '(Other)' },
};

function colorFor(division: string | null): typeof DIVISION_COLORS[string] {
  if (!division) return DIVISION_COLORS.__other__;
  return DIVISION_COLORS[division] ?? DIVISION_COLORS.__other__;
}

// Square-root scale clamped to [4, 28] in viewport units.
function bubbleRadius(amount: number, max: number): number {
  if (amount <= 0 || max <= 0) return 0;
  const scaled = Math.sqrt(amount / max) * 28;
  return Math.max(4, Math.min(28, scaled));
}

export function RollupMapView({ year, version }: Props) {
  const data = useChargingRollupData({ year, version });
  const [drillCountry, setDrillCountry] = useState<string | null>(null);
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    title: string;
    subtitle: string;
    breakdown: { label: string; value: number }[];
    total: number;
  } | null>(null);

  const countryEntries = useMemo(() => {
    const entries: {
      iso: string;
      name: string;
      total: number;
      cells: PerLocationCell[];
      division: string | null;
    }[] = [];
    data.byCountry.forEach((bucket, _key) => {
      // Dominant division for the bubble color
      const divTotals = new Map<string, number>();
      bucket.cells.forEach((c) => {
        divTotals.set(c.division ?? '__other__', (divTotals.get(c.division ?? '__other__') ?? 0) + c.amount_eur);
      });
      let topDiv: string | null = null;
      let topAmt = 0;
      divTotals.forEach((amt, div) => {
        if (amt > topAmt) {
          topAmt = amt;
          topDiv = div === '__other__' ? null : div;
        }
      });
      entries.push({
        iso: bucket.country_iso_code,
        name: bucket.country_name,
        total: bucket.total,
        cells: bucket.cells,
        division: topDiv,
      });
    });
    return entries.sort((a, b) => b.total - a.total);
  }, [data.byCountry]);

  const drillEntries = useMemo(() => {
    if (!drillCountry) return [];
    const bucket = Array.from(data.byCountry.values()).find((b) => b.country_iso_code === drillCountry);
    if (!bucket) return [];
    // Group by charging location within this country
    const byLoc = new Map<string, {
      cl_id: string;
      cl_code: string;
      cl_name: string;
      division: string | null;
      total: number;
      cells: PerLocationCell[];
    }>();
    bucket.cells.forEach((c) => {
      const existing = byLoc.get(c.charging_location_id) ?? {
        cl_id: c.charging_location_id,
        cl_code: c.charging_location_code,
        cl_name: c.charging_location_name,
        division: c.division,
        total: 0,
        cells: [],
      };
      existing.total += c.amount_eur;
      existing.cells.push(c);
      byLoc.set(c.charging_location_id, existing);
    });
    return Array.from(byLoc.values()).sort((a, b) => b.total - a.total);
  }, [drillCountry, data.byCountry]);

  if (data.loading) {
    return (
      <Card className="p-4">
        <Skeleton className="h-[480px] w-full" />
      </Card>
    );
  }

  if (data.error) {
    return (
      <Card className="p-6">
        <p className="text-sm text-red-600 dark:text-red-400">{data.error}</p>
      </Card>
    );
  }

  const maxBubble = drillCountry
    ? drillEntries.reduce((m, e) => Math.max(m, e.total), 0)
    : countryEntries.reduce((m, e) => Math.max(m, e.total), 0);

  return (
    <div className="space-y-3">
      {drillCountry && (
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setDrillCountry(null)}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Back to country view
          </Button>
          <span className="text-sm text-muted-foreground">
            Charging locations in{' '}
            <span className="font-medium text-foreground">
              {countryEntries.find((c) => c.iso === drillCountry)?.name ?? drillCountry}
            </span>
          </span>
        </div>
      )}

      <Card className="p-4 relative overflow-hidden">
        <div className="relative">
          <WorldMap />
          {/* Bubble overlay — same SVG viewBox so the bubbles align with
              the world map background. */}
          <svg
            viewBox={`0 0 ${VIEWPORT_WIDTH} ${VIEWPORT_HEIGHT}`}
            className="absolute inset-0 w-full h-full pointer-events-none"
            preserveAspectRatio="xMidYMid meet"
          >
            {!drillCountry &&
              countryEntries.map((c) => {
                const xy = projectCountry(c.iso);
                if (!xy) return null;
                const r = bubbleRadius(c.total, maxBubble);
                if (r === 0) return null;
                const col = colorFor(c.division);
                return (
                  <g
                    key={c.iso}
                    style={{ pointerEvents: 'all', cursor: 'pointer' }}
                    onClick={() => setDrillCountry(c.iso)}
                    onMouseEnter={(e) => {
                      const target = e.currentTarget.getBoundingClientRect();
                      setHover({
                        x: target.left + target.width / 2,
                        y: target.top,
                        title: c.name,
                        subtitle: `${c.cells.length} charging-location lines`,
                        breakdown: c.cells
                          .reduce<{ label: string; value: number }[]>((acc, cell) => {
                            const existing = acc.find((a) => a.label === cell.entity_name);
                            if (existing) existing.value += cell.amount_eur;
                            else acc.push({ label: cell.entity_name, value: cell.amount_eur });
                            return acc;
                          }, [])
                          .sort((a, b) => b.value - a.value)
                          .slice(0, 5),
                        total: c.total,
                      });
                    }}
                    onMouseLeave={() => setHover(null)}
                  >
                    <circle
                      cx={xy.x}
                      cy={xy.y}
                      r={r}
                      fill={col.fill}
                      fillOpacity={0.6}
                      stroke={col.stroke}
                      strokeWidth={1.5}
                    />
                    {r > 10 && (
                      <text
                        x={xy.x}
                        y={xy.y + 3}
                        textAnchor="middle"
                        className="text-[8px] font-mono"
                        fill="white"
                        style={{ fontSize: '8px', pointerEvents: 'none' }}
                      >
                        {c.iso}
                      </text>
                    )}
                  </g>
                );
              })}
            {drillCountry &&
              drillEntries.map((loc, idx) => {
                const centroid = projectCountry(drillCountry);
                if (!centroid) return null;
                // Spread location bubbles around the country centroid in a small ring
                const angle = (idx / Math.max(1, drillEntries.length)) * 2 * Math.PI;
                const ringRadius = 14;
                const x = centroid.x + Math.cos(angle) * ringRadius;
                const y = centroid.y + Math.sin(angle) * ringRadius;
                const r = bubbleRadius(loc.total, maxBubble);
                if (r === 0) return null;
                const col = colorFor(loc.division);
                return (
                  <g
                    key={loc.cl_id}
                    style={{ pointerEvents: 'all', cursor: 'pointer' }}
                    onMouseEnter={(e) => {
                      const target = e.currentTarget.getBoundingClientRect();
                      setHover({
                        x: target.left + target.width / 2,
                        y: target.top,
                        title: loc.cl_name,
                        subtitle: `${loc.cl_code} · ${loc.division ?? '—'}`,
                        breakdown: loc.cells
                          .map((cell) => ({ label: cell.entity_name, value: cell.amount_eur }))
                          .sort((a, b) => b.value - a.value)
                          .slice(0, 5),
                        total: loc.total,
                      });
                    }}
                    onMouseLeave={() => setHover(null)}
                  >
                    <circle
                      cx={x}
                      cy={y}
                      r={r}
                      fill={col.fill}
                      fillOpacity={0.6}
                      stroke={col.stroke}
                      strokeWidth={1.5}
                    />
                  </g>
                );
              })}
          </svg>
          {hover && (
            <div
              className="fixed z-50 max-w-xs bg-card border border-border rounded shadow-lg p-3 text-xs pointer-events-none"
              style={{
                left: hover.x + 12,
                top: hover.y - 10,
                transform: 'translate(-50%, -100%)',
              }}
            >
              <p className="font-semibold text-foreground mb-0.5">{hover.title}</p>
              <p className="text-muted-foreground mb-1.5">{hover.subtitle}</p>
              <p className="font-mono text-sm text-foreground tabular-nums mb-1">
                {formatCurrency(hover.total)}
              </p>
              <div className="border-t border-border pt-1 space-y-0.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Top contributors
                </p>
                {hover.breakdown.map((b) => (
                  <div key={b.label} className="flex justify-between gap-3 text-[11px]">
                    <span className="truncate text-muted-foreground">{b.label}</span>
                    <span className="font-mono tabular-nums text-foreground">
                      {formatCurrency(b.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      <Legend max={maxBubble} />
    </div>
  );
}

function Legend({ max }: { max: number }) {
  const sample = [max, max * 0.5, max * 0.2];
  return (
    <Card className="p-3 flex items-center gap-6 text-xs">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
          Bubble size
        </p>
        <div className="flex items-end gap-3">
          {sample.map((s) => {
            const r = Math.sqrt(s / max) * 14;
            return (
              <div key={s} className="flex flex-col items-center">
                <svg width={r * 2 + 4} height={r * 2 + 4}>
                  <circle
                    cx={r + 2}
                    cy={r + 2}
                    r={r}
                    className="fill-muted-foreground/30 stroke-muted-foreground/60"
                    strokeWidth={1}
                  />
                </svg>
                <span className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                  {formatCurrency(s)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
          Division
        </p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(DIVISION_COLORS).map(([key, val]) => (
            <Badge
              key={key}
              variant="outline"
              className="text-[10px] gap-1.5"
            >
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: val.fill }}
              />
              {val.label}
            </Badge>
          ))}
        </div>
      </div>
    </Card>
  );
}
