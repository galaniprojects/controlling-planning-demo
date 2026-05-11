/**
 * FormulaCard — read-only display of the composite scoring formula.
 *
 * Typography-only — no math library. Subscripts via <sub>, fractions via
 * a thin div with a top border. Stays accurate even if weights change
 * because it shows the formula, not the values.
 */

import { Card } from '@/components/ui/card';

export function FormulaCard() {
  return (
    <Card className="p-5 space-y-4">
      <h3 className="text-sm font-semibold text-foreground">
        Composite ranking formula
      </h3>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 font-mono text-sm text-foreground">
        <span className="text-muted-foreground">composite</span>
        <span aria-hidden>=</span>
        <span className="inline-flex flex-col items-center">
          <span className="px-3 pb-1">
            V · w<sub>V</sub> + X · w<sub>C</sub>
          </span>
          <span className="px-3 pt-1 border-t border-foreground/60">
            w<sub>V</sub> + w<sub>C</sub>
          </span>
        </span>
      </div>

      <div className="text-xs text-muted-foreground space-y-1 leading-relaxed">
        <div>
          <span className="font-mono text-foreground">V</span> = Value
          Creation = weighted average of Financial benefit · Payback ·
          Competitive advantage (each 1–5)
        </div>
        <div>
          <span className="font-mono text-foreground">X</span> = Complexity =
          weighted average of Standardization · Usage · Maintenance (each 1–5)
        </div>
        <div>
          <span className="font-mono text-foreground">
            w<sub>V</sub>, w<sub>C</sub>
          </span>{' '}
          = Composite axis weights. The formula normalizes by their sum, so
          they don't need to sum to 100.
        </div>
      </div>
    </Card>
  );
}
