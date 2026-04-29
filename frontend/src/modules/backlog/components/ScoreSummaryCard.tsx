/**
 * ScoreSummaryCard — Read-only display of computed Tech Navigator scores
 * [A-TN-08].
 *
 * Shows three computed scores (Complexity, Value Creation, Composite) plus the
 * derived t-shirt size [A-TN-09] and the budget t-shirt thresholds. Designed to
 * sit above the rubric so changes lower in the page reflect upward in real time.
 *
 * Following the project's dark-mode rules (CLAUDE.md): all colours are semantic
 * Tailwind tokens; status / scale colours always carry a `dark:` variant.
 */

import { Card, CardContent } from '@/components/ui/card';
import { formatCurrencyDetailed, formatNumber } from '@/lib/formatters';
import type {
  TechNavigatorWeights,
  TshirtSize,
} from '@/types/techNavigator';

interface Props {
  complexityScore: number | null;
  valueCreationScore: number | null;
  compositeScore: number | null;
  tshirtSize: TshirtSize | null;
  totalBudget: number | null;
  weights: TechNavigatorWeights;
  /** True while a debounced PUT is in flight. */
  saving?: boolean;
  /** "Saved" indicator visibility — true for ~1.5 s after a successful PUT. */
  saved?: boolean;
}

/** Format a 1-5 weighted score as European-style "x,xx / 5". */
function formatScore(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(2).replace('.', ',')} / 5`;
}

/** Plain "70 % / 30 %" style attribution for the composite formula. */
function formatRankingAttribution(
  ranking: TechNavigatorWeights['ranking'],
): string {
  const total = ranking.value + ranking.complexity;
  if (total <= 0) return '— / —';
  const valuePct = Math.round((ranking.value / total) * 100);
  const complexityPct = 100 - valuePct;
  return `${valuePct} % value · ${complexityPct} % complexity`;
}

/** T-shirt thresholds compact summary line. */
function formatThresholds(t: TechNavigatorWeights['tshirt']): string {
  return [
    `XS ≤ ${formatNumber(t.xs_max)} €`,
    `S ≤ ${formatNumber(t.s_max)} €`,
    `M ≤ ${formatNumber(t.m_max)} €`,
    `L ≤ ${formatNumber(t.l_max)} €`,
    'XL above',
  ].join(' · ');
}

export function ScoreSummaryCard({
  complexityScore,
  valueCreationScore,
  compositeScore,
  tshirtSize,
  totalBudget,
  weights,
  saving = false,
  saved = false,
}: Props) {
  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Computed scores
            </h2>
            <p className="text-xs text-muted-foreground">
              Updates in real time as you complete the rubric below.
            </p>
          </div>
          <div className="text-xs">
            {saving ? (
              <span className="text-muted-foreground">Saving…</span>
            ) : saved ? (
              <span className="text-emerald-600 dark:text-emerald-400">
                Saved
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ScoreTile
            label="Complexity"
            sublabel="higher = simpler / better"
            value={formatScore(complexityScore)}
            tone="complexity"
          />
          <ScoreTile
            label="Value Creation"
            sublabel="higher = more value"
            value={formatScore(valueCreationScore)}
            tone="value"
          />
          <ScoreTile
            label="Composite ranking"
            sublabel={formatRankingAttribution(weights.ranking)}
            value={formatScore(compositeScore)}
            tone="composite"
          />
        </div>

        <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Budget t-shirt
            </span>
            <span className="text-sm font-semibold text-foreground">
              {tshirtSize ?? '—'}
            </span>
            <span className="text-xs text-muted-foreground">
              {totalBudget !== null
                ? `total budget ${formatCurrencyDetailed(totalBudget)}`
                : 'no total budget set'}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Thresholds (admin): {formatThresholds(weights.tshirt)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

interface ScoreTileProps {
  label: string;
  sublabel: string;
  value: string;
  tone: 'complexity' | 'value' | 'composite';
}

function ScoreTile({ label, sublabel, value, tone }: ScoreTileProps) {
  const toneClass =
    tone === 'composite'
      ? 'border-primary/40 bg-primary/5'
      : tone === 'value'
        ? 'border-sky-300/60 bg-sky-50 dark:border-sky-700/60 dark:bg-sky-900/20'
        : 'border-violet-300/60 bg-violet-50 dark:border-violet-700/60 dark:bg-violet-900/20';
  return (
    <div className={`rounded-md border ${toneClass} px-3 py-3`}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </div>
      <div className="text-[11px] text-muted-foreground">{sublabel}</div>
    </div>
  );
}
