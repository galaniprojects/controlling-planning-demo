/**
 * QuadrantScatter — live Tech Navigator 2D scatter.
 *
 * Each project is one dot at (value_creation, complexity), sized by t-shirt
 * letter (XS small → XL big), coloured by composite (low grey → high
 * emerald). A diagonal `ReferenceLine` draws the iso-composite line at the
 * should-be cutoff threshold, rotating as `wV / wC` change and shifting as
 * the envelope or sub-criteria change.
 *
 * All math comes from `lib/scoringMath.ts`; this component just paints.
 */

import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import {
  computeCutoffComposite,
  computeProjectScores,
  isoCompositeEndpoints,
  type TshirtSizeLetter,
} from '../lib/scoringMath';
import type {
  TechNavigatorScoringProject,
  TechNavigatorScoringData,
} from '@/types/api';

interface Props {
  projects: TechNavigatorScoringProject[];
  weights: TechNavigatorScoringData['weights'];
  rankingEnvelope: number;
}

interface ScatterPoint {
  id: string;
  name: string;
  V: number;
  C: number;
  composite: number;
  tshirt: TshirtSizeLetter | null;
  z: number; // ZAxis-driven dot size
}

const TSHIRT_SIZE: Record<TshirtSizeLetter, number> = {
  XS: 40,
  S: 80,
  M: 130,
  L: 190,
  XL: 260,
};

/** Map composite (1–5) to an HSL colour via a grey-→-emerald ramp. */
function compositeColor(composite: number): string {
  const clamped = Math.max(1, Math.min(5, composite));
  const t = (clamped - 1) / 4; // 0..1
  // Hue goes 220° (cool slate) -> 150° (emerald). Saturation grows with t.
  const h = 220 - t * 70;
  const s = 15 + t * 50;
  const l = 60 - t * 15;
  return `hsl(${h.toFixed(0)}, ${s.toFixed(0)}%, ${l.toFixed(0)}%)`;
}

export function QuadrantScatter({ projects, weights, rankingEnvelope }: Props) {
  const points: ScatterPoint[] = useMemo(() => {
    const tnWeights = {
      complexity: weights.complexity,
      value_creation: weights.value_creation,
      ranking: weights.ranking,
      tshirt: weights.tshirt,
    };
    return projects
      .map((p) => {
        const s = computeProjectScores(p, tnWeights);
        if (s.composite_score === null || s.value_creation_score === null || s.complexity_score === null) {
          return null;
        }
        return {
          id: p.id,
          name: p.name,
          V: s.value_creation_score,
          C: s.complexity_score,
          composite: s.composite_score,
          tshirt: s.tshirt_size,
          z: s.tshirt_size ? TSHIRT_SIZE[s.tshirt_size] : TSHIRT_SIZE.M,
        };
      })
      .filter((p): p is ScatterPoint => p !== null);
  }, [projects, weights]);

  const cutoffComposite = useMemo(
    () =>
      computeCutoffComposite(
        points.map((p) => ({
          composite_score: p.composite,
          total_budget:
            projects.find((pr) => pr.id === p.id)?.total_budget ?? null,
        })),
        rankingEnvelope,
      ),
    [points, projects, rankingEnvelope],
  );

  const isoLine = useMemo(() => {
    if (cutoffComposite === null) return null;
    return isoCompositeEndpoints(
      cutoffComposite,
      weights.ranking.value,
      weights.ranking.complexity,
    );
  }, [cutoffComposite, weights.ranking.value, weights.ranking.complexity]);

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          Live preview — Tech Navigator quadrant
        </h3>
        <span className="text-xs text-muted-foreground tabular-nums">
          {points.length} projects
        </span>
      </div>
      <Separator />

      <div className="h-[420px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart
            margin={{ top: 16, right: 24, bottom: 36, left: 16 }}
          >
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="V"
              name="Value Creation"
              domain={[1, 5]}
              ticks={[1, 2, 3, 4, 5]}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              label={{
                value: 'Value Creation',
                position: 'insideBottom',
                offset: -12,
                fill: 'var(--muted-foreground)',
                fontSize: 12,
              }}
            />
            <YAxis
              type="number"
              dataKey="C"
              name="Complexity"
              domain={[1, 5]}
              ticks={[1, 2, 3, 4, 5]}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              label={{
                value: 'Complexity',
                angle: -90,
                position: 'insideLeft',
                offset: 8,
                fill: 'var(--muted-foreground)',
                fontSize: 12,
              }}
            />
            <ZAxis type="number" dataKey="z" range={[40, 260]} />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as ScatterPoint;
                return (
                  <div className="rounded border border-border bg-card px-3 py-2 text-xs shadow-md">
                    <div className="font-medium text-foreground">{p.name}</div>
                    <div className="text-muted-foreground tabular-nums mt-1">
                      V {p.V.toFixed(2)} · C {p.C.toFixed(2)} · Composite{' '}
                      <span className="text-foreground">{p.composite.toFixed(2)}</span>
                    </div>
                    {p.tshirt ? (
                      <div className="text-muted-foreground mt-0.5">
                        T-shirt {p.tshirt}
                      </div>
                    ) : null}
                  </div>
                );
              }}
            />
            {isoLine ? (
              <ReferenceLine
                stroke="var(--primary)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                segment={[
                  { x: isoLine.v1, y: isoLine.c1 },
                  { x: isoLine.v2, y: isoLine.c2 },
                ]}
                ifOverflow="hidden"
                label={{
                  value: `iso-composite ${cutoffComposite!.toFixed(2)}`,
                  position: 'insideTopRight',
                  fill: 'var(--primary)',
                  fontSize: 10,
                }}
              />
            ) : null}
            <Scatter
              name="Projects"
              data={points}
              shape={(props: { cx?: number; cy?: number; payload?: ScatterPoint; node?: { z?: number } }) => {
                const { cx = 0, cy = 0, payload, node } = props;
                if (!payload) return <g />;
                const area = (node?.z ?? TSHIRT_SIZE.M);
                const r = Math.sqrt(area / Math.PI);
                return (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={compositeColor(payload.composite)}
                    fillOpacity={0.85}
                    stroke="var(--foreground)"
                    strokeOpacity={0.25}
                    strokeWidth={1}
                  />
                );
              }}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>size = T-shirt (XS → XL)</span>
        <span>colour = composite (low → high)</span>
        {isoLine ? (
          <span>diagonal = iso-composite at the should-be cutoff threshold</span>
        ) : (
          <span className="text-amber-600 dark:text-amber-400">
            cutoff line hidden — no project crosses the budget envelope at these weights
          </span>
        )}
      </div>
    </Card>
  );
}
