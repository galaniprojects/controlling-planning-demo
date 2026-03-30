import type { MeasureItem, DimensionItem, ReportExecuteResponse } from '@/types/reportBuilder';
import type { ZoneState } from './useReportBuilder';

/* ── Colour palette ── */

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'oklch(0.65 0.18 250)',
  'oklch(0.70 0.16 330)',
  'oklch(0.60 0.20 60)',
];

export function getChartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

/* ── Shared types ── */

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
}

/* ── Bar chart ── */

export interface BarChartData {
  data: Record<string, string | number>[];
  xKey: string;
  xLabel: string;
  series: ChartSeries[];
  yFormat: string;
}

const TIME_DIMS = new Set(['D16', 'D17', 'D18']);

export function buildBarChartData(
  results: ReportExecuteResponse,
  zones: ZoneState,
): BarChartData | null {
  if (zones.rows.length === 0 && zones.values.length === 0) return null;

  const firstRowDim = zones.rows[0];
  const firstColDim = zones.columns[0] as DimensionItem | undefined;
  const measures = zones.values;

  // Case 1: column dimension exists → group bars by column dim values
  if (firstColDim && firstRowDim) {
    const firstMeasure = measures[0];
    const grouped = groupBy(results.rows, firstRowDim.id);
    const colValues = uniqueValues(results.rows, firstColDim.id);
    const series: ChartSeries[] = colValues.map((v, i) => ({
      key: sanitizeKey(v),
      label: v,
      color: getChartColor(i),
    }));

    const data = Object.entries(grouped).map(([xVal, rows]) => {
      const record: Record<string, string | number> = { x: xVal };
      for (const cv of colValues) {
        const matchingRows = rows.filter((r) => String(r[firstColDim.id]) === cv);
        const sum = matchingRows.reduce((acc, r) => acc + toNum(r[firstMeasure.id]), 0);
        record[sanitizeKey(cv)] = sum;
      }
      return record;
    });

    return { data, xKey: 'x', xLabel: firstRowDim.display_name, series, yFormat: firstMeasure.format };
  }

  // Case 2: no column dim, multiple measures → each measure is a series
  if (firstRowDim && measures.length > 0) {
    const series: ChartSeries[] = measures.map((m, i) => ({
      key: m.id,
      label: m.display_name,
      color: getChartColor(i),
    }));

    const grouped = groupBy(results.rows, firstRowDim.id);
    const data = Object.entries(grouped).map(([xVal, rows]) => {
      const record: Record<string, string | number> = { x: xVal };
      for (const m of measures) {
        record[m.id] = rows.reduce((acc, r) => acc + toNum(r[m.id]), 0);
      }
      return record;
    });

    return { data, xKey: 'x', xLabel: firstRowDim.display_name, series, yFormat: measures[0].format };
  }

  return null;
}

/* ── Line chart ── */

export interface LineChartData {
  data: Record<string, string | number>[];
  xKey: string;
  xLabel: string;
  series: ChartSeries[];
  yFormat: string;
}

export function canShowLineChart(zones: ZoneState): boolean {
  return zones.columns.length > 0 && TIME_DIMS.has(zones.columns[0].id);
}

export function buildLineChartData(
  results: ReportExecuteResponse,
  zones: ZoneState,
): LineChartData | null {
  if (!canShowLineChart(zones)) return null;

  const timeDim = zones.columns[0];
  const firstRowDim = zones.rows[0] as DimensionItem | undefined;
  const firstMeasure = zones.values[0];
  if (!firstMeasure) return null;

  const timeValues = uniqueValues(results.rows, timeDim.id).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );

  // If there's a row dimension, each row dim value is a series
  if (firstRowDim) {
    const seriesValues = uniqueValues(results.rows, firstRowDim.id);
    const series: ChartSeries[] = seriesValues.map((v, i) => ({
      key: sanitizeKey(v),
      label: v,
      color: getChartColor(i),
    }));

    const data = timeValues.map((tv) => {
      const record: Record<string, string | number> = { x: tv };
      for (const sv of seriesValues) {
        const matchingRows = results.rows.filter(
          (r) => String(r[timeDim.id]) === tv && String(r[firstRowDim.id]) === sv,
        );
        record[sanitizeKey(sv)] = matchingRows.reduce((acc, r) => acc + toNum(r[firstMeasure.id]), 0);
      }
      return record;
    });

    return { data, xKey: 'x', xLabel: timeDim.display_name, series, yFormat: firstMeasure.format };
  }

  // No row dim: single line
  const series: ChartSeries[] = [{ key: firstMeasure.id, label: firstMeasure.display_name, color: getChartColor(0) }];
  const data = timeValues.map((tv) => {
    const matchingRows = results.rows.filter((r) => String(r[timeDim.id]) === tv);
    return {
      x: tv,
      [firstMeasure.id]: matchingRows.reduce((acc, r) => acc + toNum(r[firstMeasure.id]), 0),
    };
  });

  return { data, xKey: 'x', xLabel: timeDim.display_name, series, yFormat: firstMeasure.format };
}

/* ── Pie chart ── */

export interface PieChartData {
  data: { name: string; value: number }[];
  colors: string[];
  measureLabel: string;
  measureFormat: string;
  dimensionLabel: string;
  hasMultipleDimsOrMeasures: boolean;
}

export function canShowPieChart(zones: ZoneState): boolean {
  return zones.rows.length > 0;
}

export function buildPieChartData(
  results: ReportExecuteResponse,
  zones: ZoneState,
): PieChartData | null {
  if (!canShowPieChart(zones)) return null;

  const firstRowDim = zones.rows[0];
  const firstMeasure = zones.values[0];
  if (!firstMeasure) return null;

  const grouped = groupBy(results.rows, firstRowDim.id);
  const entries = Object.entries(grouped).map(([name, rows]) => ({
    name,
    value: rows.reduce((acc, r) => acc + toNum(r[firstMeasure.id]), 0),
  }));

  const colors = entries.map((_, i) => getChartColor(i));

  return {
    data: entries,
    colors,
    measureLabel: firstMeasure.display_name,
    measureFormat: firstMeasure.format,
    dimensionLabel: firstRowDim.display_name,
    hasMultipleDimsOrMeasures: zones.rows.length > 1 || zones.values.length > 1,
  };
}

/* ── Helpers ── */

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function groupBy(
  rows: Record<string, string | number | null>[],
  key: string,
): Record<string, Record<string, string | number | null>[]> {
  const result: Record<string, Record<string, string | number | null>[]> = {};
  for (const row of rows) {
    const k = String(row[key] ?? '');
    (result[k] ??= []).push(row);
  }
  return result;
}

function uniqueValues(rows: Record<string, string | number | null>[], key: string): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    seen.add(String(row[key] ?? ''));
  }
  return [...seen];
}

/** Sanitize a string to use as a Recharts dataKey (remove dots, pipes). */
function sanitizeKey(s: string): string {
  return s.replace(/[.|]/g, '_');
}
