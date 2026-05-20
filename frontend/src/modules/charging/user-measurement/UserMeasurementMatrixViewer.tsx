/**
 * Read-only UM matrix viewer per FD-2 / spec §2.
 *
 * Lifts the sticky-pivot rendering from the legacy admin
 * `UserMeasurementPanel` (rows = S-code, columns = charging-location code,
 * per-row + per-column totals, European number formatting). No editing —
 * the FD-2 editor for drafts is a separate component
 * (`UserMeasurementMatrixEditor`). Active versions are immutable per
 * [F-UM-02] so this is the surface anyone on any role reads.
 *
 * Integer values per [F-UM-01] — formatted without decimals. Hovering a
 * cell shows the cell's exact value as a tooltip.
 */
import { useMemo } from 'react';
import type { UMCell, UMVersionSummary } from '@/types/userMeasurement';

interface Props {
  version: UMVersionSummary;
  cells: UMCell[];
}

function fmtInt(v: number): string {
  // European thousands separator (`.`), no decimals — UM is integer-only.
  return new Intl.NumberFormat('de-DE').format(v);
}

export function UserMeasurementMatrixViewer({ version, cells }: Props) {
  const pivot = useMemo(() => {
    const sCodes = Array.from(new Set(cells.map((c) => c.s_code))).sort();
    const locCodes = Array.from(
      new Set(cells.map((c) => c.charging_location_code ?? c.charging_location_id)),
    ).sort();
    const lookup = new Map<string, UMCell>();
    for (const c of cells) {
      lookup.set(`${c.s_code}|${c.charging_location_code ?? c.charging_location_id}`, c);
    }

    const rowTotals: Record<string, number> = {};
    const colTotals: Record<string, number> = {};
    let grand = 0;
    for (const c of cells) {
      const lc = c.charging_location_code ?? c.charging_location_id;
      rowTotals[c.s_code] = (rowTotals[c.s_code] ?? 0) + c.value;
      colTotals[lc] = (colTotals[lc] ?? 0) + c.value;
      grand += c.value;
    }
    return { sCodes, locCodes, lookup, rowTotals, colTotals, grand };
  }, [cells]);

  if (cells.length === 0) {
    return (
      <div className="rounded-md border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Version v{version.id} has no cells. {version.status === 'draft'
          ? 'Start in-grid editing or import a CSV to populate it.'
          : 'This active version is empty.'}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border overflow-auto max-h-[60vh]">
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 bg-card z-10">
          <tr className="border-b border-border">
            <th className="px-2 py-2 text-left font-medium text-muted-foreground sticky left-0 bg-card border-r border-border min-w-[140px]">
              S-code \ Charging code
            </th>
            {pivot.locCodes.map((lc) => (
              <th
                key={lc}
                className="px-2 py-2 text-right font-mono font-medium text-muted-foreground min-w-[90px] whitespace-nowrap"
              >
                {lc}
              </th>
            ))}
            <th className="px-2 py-2 text-right font-medium text-foreground bg-muted border-l border-border min-w-[80px]">
              Σ Row
            </th>
          </tr>
        </thead>
        <tbody>
          {pivot.sCodes.map((sc) => (
            <tr
              key={sc}
              className="border-b border-border hover:bg-accent/40"
            >
              <td className="px-2 py-1.5 font-mono font-medium text-foreground sticky left-0 bg-card border-r border-border">
                {sc}
              </td>
              {pivot.locCodes.map((lc) => {
                const cell = pivot.lookup.get(`${sc}|${lc}`);
                if (!cell) {
                  return (
                    <td
                      key={lc}
                      className="px-2 py-1.5 text-right text-muted-foreground/40"
                    >
                      ·
                    </td>
                  );
                }
                return (
                  <td
                    key={lc}
                    className="px-2 py-1.5 text-right tabular-nums text-foreground"
                    title={`Cell value: ${cell.value}`}
                  >
                    {fmtInt(cell.value)}
                  </td>
                );
              })}
              <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-foreground bg-muted border-l border-border">
                {fmtInt(pivot.rowTotals[sc] ?? 0)}
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-border bg-muted">
            <td className="px-2 py-2 font-semibold text-foreground sticky left-0 bg-muted border-r border-border">
              Σ Column
            </td>
            {pivot.locCodes.map((lc) => (
              <td
                key={lc}
                className="px-2 py-2 text-right tabular-nums font-semibold text-foreground"
              >
                {fmtInt(pivot.colTotals[lc] ?? 0)}
              </td>
            ))}
            <td className="px-2 py-2 text-right tabular-nums font-semibold text-foreground border-l border-border">
              {fmtInt(pivot.grand)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
