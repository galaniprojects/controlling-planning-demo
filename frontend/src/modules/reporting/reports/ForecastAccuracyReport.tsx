import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useRole } from '@/contexts/RoleContext';
import { reportsApi, referenceApi } from '@/api/endpoints';
import { Skeleton } from '@/components/shared/Skeleton';
import { SummaryCard } from '@/modules/capacity/shared/SummaryCard';
import { ReportViewer, type ColumnDef } from '../viewer/ReportViewer';
import { ForecastAccuracyChart } from './ForecastAccuracyChart';
import { formatCurrency, formatPercent, formatCurrencyDetailed } from '@/lib/formatters';
import type { FilterConfig } from '@/components/shared/FilterBar';
import type { ForecastAccuracyResponse, LoBRef } from '@/types/api';
import { Target, CheckCircle2, AlertTriangle, TrendingUp } from 'lucide-react';

const ALL_COLUMNS: ColumnDef[] = [
  { key: 'project_name', label: 'Project' },
  { key: 'lob_name', label: 'LoB' },
  { key: 'forecast_value', label: 'Forecast' },
  { key: 'actual_value', label: 'Actual' },
  { key: 'variance', label: 'Variance' },
  { key: 'variance_pct', label: 'Var%' },
  { key: 'accuracy_rating', label: 'Rating' },
];

const TYPE_OPTIONS = [
  { value: 'project', label: 'Project' },
  { value: 'service', label: 'Service' },
];

const HORIZON_OPTIONS = [
  { value: '3', label: '3 months' },
  { value: '6', label: '6 months' },
  { value: '12', label: '12 months' },
];

const FISCAL_YEAR_OPTIONS = [
  { value: '2024', label: 'FY 2024' },
  { value: '2025', label: 'FY 2025' },
  { value: '2026', label: 'FY 2026' },
  { value: '2027', label: 'FY 2027' },
];

function ratingBadge(rating: string) {
  const colors: Record<string, string> = {
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-700',
  };
  const labels: Record<string, string> = {
    green: '<5%',
    amber: '5–15%',
    red: '>15%',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${colors[rating] ?? 'bg-slate-100 text-slate-500'}`}
    >
      {rating.charAt(0).toUpperCase() + rating.slice(1)} ({labels[rating] ?? ''})
    </span>
  );
}

export function ForecastAccuracyReport() {
  const { currentRoleId } = useRole();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<ForecastAccuracyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lobs, setLobs] = useState<LoBRef[]>([]);
  const [view, setView] = useState<'chart' | 'table'>('table');
  const [filters, setFilters] = useState<Record<string, string>>({
    lob: '',
    type: '',
    horizon: '6',
    fiscal_year: '2026',
  });
  const [visibleCols, setVisibleCols] = useState(ALL_COLUMNS.map((c) => c.key));
  const [sortColumn, setSortColumn] = useState('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Load saved view config if ?view=ID
  useEffect(() => {
    const viewId = searchParams.get('view');
    if (!viewId) return;
    reportsApi.getSavedViews().then((r) => {
      const sv = r.items.find((v) => v.id === Number(viewId));
      if (!sv) return;
      if (sv.config.filters) setFilters((f) => ({ ...f, ...sv.config.filters }));
      if (sv.config.columns?.length) setVisibleCols(sv.config.columns);
      if (sv.config.sort_column) setSortColumn(sv.config.sort_column);
      if (sv.config.sort_direction) setSortDirection(sv.config.sort_direction);
      if (sv.config.viz_type === 'chart' || sv.config.viz_type === 'table') setView(sv.config.viz_type);
    }).catch(() => {});
  }, [searchParams]);

  useEffect(() => {
    referenceApi.getLobs().then((r) => setLobs(r.items)).catch(() => {});
  }, []);

  const fetchData = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (filters.lob) params.lob = filters.lob;
    if (filters.type) params.type = filters.type;
    if (filters.horizon) params.horizon = filters.horizon;
    if (filters.fiscal_year) params.fiscal_year = filters.fiscal_year;

    reportsApi
      .getForecastAccuracy(params)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [filters, currentRoleId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filterConfigs: FilterConfig[] = [
    {
      key: 'lob',
      label: 'Line of Business',
      options: lobs.map((l) => ({ value: l.id, label: l.name })),
    },
    { key: 'type', label: 'Type', options: TYPE_OPTIONS },
    { key: 'horizon', label: 'Forecast Horizon', options: HORIZON_OPTIONS },
    { key: 'fiscal_year', label: 'Fiscal Year', options: FISCAL_YEAR_OPTIONS },
  ];

  // Sort rows — must be before early returns to satisfy Rules of Hooks
  const rows = useMemo(() => {
    if (!data) return [];
    const sorted = [...data.rows];
    if (sortColumn) {
      sorted.sort((a, b) => {
        const av = (a as Record<string, unknown>)[sortColumn];
        const bv = (b as Record<string, unknown>)[sortColumn];
        if (typeof av === 'number' && typeof bv === 'number') return sortDirection === 'asc' ? av - bv : bv - av;
        return sortDirection === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
      });
    }
    return sorted;
  }, [data, sortColumn, sortDirection]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-slate-400">Failed to load report data.</p>;
  }

  const { kpis, chart_data } = data;

  const show = (col: string) => visibleCols.includes(col);

  const biasLabel =
    kpis.bias_direction === 'over'
      ? 'Over-forecast'
      : kpis.bias_direction === 'under'
        ? 'Under-forecast'
        : 'Neutral';

  const kpiRow = (
    <div className="grid grid-cols-4 gap-3">
      <SummaryCard
        label="Avg Accuracy"
        value={`${kpis.avg_accuracy_pct.toFixed(1).replace('.', ',')}%`}
        icon={<Target className="h-5 w-5" />}
      />
      <SummaryCard
        label="Within 5%"
        value={`${kpis.within_5_count} projects`}
        icon={<CheckCircle2 className="h-5 w-5" />}
      />
      <SummaryCard
        label="Above 15% Variance"
        value={`${kpis.above_15_count} projects`}
        icon={<AlertTriangle className="h-5 w-5" />}
      />
      <SummaryCard
        label="Systematic Bias"
        value={`${biasLabel} ${formatCurrency(kpis.bias_amount)}`}
        icon={<TrendingUp className="h-5 w-5" />}
      />
    </div>
  );

  const tableContent = (
    <div className="rounded-lg border border-slate-200 bg-white overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {show('project_name') && <th className="px-3 py-2 text-left font-medium text-slate-600">Project</th>}
            {show('lob_name') && <th className="px-3 py-2 text-left font-medium text-slate-600">LoB</th>}
            {show('forecast_value') && <th className="px-3 py-2 text-right font-medium text-slate-600">Forecast</th>}
            {show('actual_value') && <th className="px-3 py-2 text-right font-medium text-slate-600">Actual</th>}
            {show('variance') && <th className="px-3 py-2 text-right font-medium text-slate-600">Variance</th>}
            {show('variance_pct') && <th className="px-3 py-2 text-right font-medium text-slate-600">Var%</th>}
            {show('accuracy_rating') && <th className="px-3 py-2 text-center font-medium text-slate-600">Rating</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.project_id} className="border-t border-slate-100 hover:bg-slate-50">
              {show('project_name') && <td className="px-3 py-2 text-slate-700">{r.project_name}</td>}
              {show('lob_name') && <td className="px-3 py-2 text-slate-500 text-xs">{r.lob_name}</td>}
              {show('forecast_value') && <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrencyDetailed(r.forecast_value)}</td>}
              {show('actual_value') && <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrencyDetailed(r.actual_value)}</td>}
              {show('variance') && <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrencyDetailed(r.variance)}</td>}
              {show('variance_pct') && (
                <td className={`px-3 py-2 text-right font-mono text-xs ${r.variance_pct > 15 ? 'text-red-600' : r.variance_pct > 5 ? 'text-amber-600' : 'text-green-600'}`}>
                  {formatPercent(r.variance_pct)}
                </td>
              )}
              {show('accuracy_rating') && <td className="px-3 py-2 text-center">{ratingBadge(r.accuracy_rating)}</td>}
            </tr>
          ))}
          <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
            <td className="px-3 py-2 text-slate-700" colSpan={show('lob_name') ? 2 : 1}>
              Total ({rows.length} projects)
            </td>
            {show('forecast_value') && <td className="px-3 py-2 text-right text-slate-700">{formatCurrencyDetailed(rows.reduce((s, r) => s + r.forecast_value, 0))}</td>}
            {show('actual_value') && <td className="px-3 py-2 text-right text-slate-700">{formatCurrencyDetailed(rows.reduce((s, r) => s + r.actual_value, 0))}</td>}
            {show('variance') && <td className="px-3 py-2 text-right text-slate-700">{formatCurrencyDetailed(rows.reduce((s, r) => s + r.variance, 0))}</td>}
            {show('variance_pct') && <td />}
            {show('accuracy_rating') && <td />}
          </tr>
        </tbody>
      </table>
    </div>
  );

  const handleSaveView = (name: string) => {
    reportsApi.createSavedView({
      report_id: 'forecast-accuracy',
      name,
      config: {
        filters,
        columns: visibleCols,
        grouping: '',
        sort_column: sortColumn,
        sort_direction: sortDirection,
        viz_type: view,
      },
    }).catch(() => {});
  };

  return (
    <ReportViewer
      title="Forecast Accuracy"
      reportId="forecast-accuracy"
      filters={filterConfigs}
      filterValues={filters}
      onFilterChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
      onFilterClear={() => setFilters({ lob: '', type: '', horizon: '6', fiscal_year: '2026' })}
      kpis={kpiRow}
      view={view}
      onViewChange={setView}
      chartContent={<ForecastAccuracyChart data={chart_data} />}
      tableContent={tableContent}
      availableColumns={ALL_COLUMNS}
      visibleColumns={visibleCols}
      onVisibleColumnsChange={setVisibleCols}
      sortColumn={sortColumn}
      sortDirection={sortDirection}
      onSortChange={(col, dir) => { setSortColumn(col); setSortDirection(dir); }}
      onSaveView={handleSaveView}
    />
  );
}
