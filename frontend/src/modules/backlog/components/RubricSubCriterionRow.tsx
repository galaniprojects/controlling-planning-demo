/**
 * RubricSubCriterionRow — single sub-criterion picker (1-5) with descriptive
 * labels [A-TN-03] [A-TN-04].
 *
 * Layout:
 *   - Header line: title + axis weight (e.g. "40 % of Complexity").
 *   - Subtitle / brief rationale.
 *   - Five score buttons in a row (1 ··· 5). Selected button highlighted.
 *   - Below the buttons: the headline + description text for the currently
 *     hovered or selected level. Hovering temporarily previews; clicking
 *     commits.
 *
 * Reuses shadcn/ui Button via custom buttons here for compact horizontal layout
 * with consistent semantic colours (CLAUDE.md dark-mode rules).
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { SubCriterionRubric } from '../data/rubricLabels';
import type { SubCriterionScore } from '@/types/techNavigator';

interface Props {
  rubric: SubCriterionRubric;
  /** Current 1-5 value, or null when unscored. */
  value: SubCriterionScore;
  /** User clicked a level (1-5) or the "clear" affordance (null). */
  onChange: (next: SubCriterionScore) => void;
  /** Weight as a percentage (e.g. 40 for 40 %). */
  weightPct: number;
  /** Read-only mode (e.g. for executive role) — buttons disabled. */
  readOnly?: boolean;
}

export function RubricSubCriterionRow({
  rubric,
  value,
  onChange,
  weightPct,
  readOnly = false,
}: Props) {
  const [hover, setHover] = useState<1 | 2 | 3 | 4 | 5 | null>(null);

  // Description preview: hovered level wins, then selected, then placeholder.
  const previewLevel = hover ?? value;
  const previewEntry =
    previewLevel === null
      ? null
      : rubric.levels.find((l) => l.level === previewLevel) ?? null;

  const axisLabel =
    rubric.axisLabel === 'complexity' ? 'Complexity' : 'Value Creation';

  return (
    <div
      data-testid={`rubric-row-${rubric.field}`}
      className="rounded-md border border-border bg-card p-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {rubric.title}
          </h3>
          <p className="text-xs text-muted-foreground">{rubric.subtitle}</p>
        </div>
        <span className="text-[11px] font-medium text-muted-foreground">
          {weightPct.toFixed(0)} % of {axisLabel}
        </span>
      </div>

      <div
        className="mt-3 flex gap-1"
        role="radiogroup"
        aria-label={`${rubric.title} score`}
      >
        {([1, 2, 3, 4, 5] as const).map((level) => {
          const selected = value === level;
          return (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`Score ${level} — ${rubric.levels[level - 1].headline}`}
              disabled={readOnly}
              onMouseEnter={() => setHover(level)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(level)}
              onBlur={() => setHover(null)}
              onClick={() => onChange(level)}
              className={cn(
                'flex-1 rounded-md border px-2 py-2 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
                readOnly && 'cursor-not-allowed opacity-60 hover:bg-background',
              )}
            >
              {level}
            </button>
          );
        })}
        {value !== null && !readOnly ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded-md border border-border bg-background px-2 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            aria-label={`Clear ${rubric.title} score`}
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="mt-3 min-h-[3rem] rounded-md bg-muted/40 px-3 py-2">
        {previewEntry ? (
          <>
            <div className="text-xs font-semibold text-foreground">
              Score {previewEntry.level} — {previewEntry.headline}
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {previewEntry.description}
            </p>
          </>
        ) : (
          <p className="text-xs italic text-muted-foreground">
            Hover or click a number above to preview the rubric description.
          </p>
        )}
      </div>
    </div>
  );
}
