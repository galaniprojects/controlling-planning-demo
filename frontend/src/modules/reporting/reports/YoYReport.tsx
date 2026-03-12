import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useRole } from '@/contexts/RoleContext';
import { reportsApi, referenceApi } from '@/api/endpoints';
import { Skeleton } from '@/components/shared/Skeleton';
import { SummaryCard } from '@/modules/capacity/shared/SummaryCard';
import { ReportViewer, type ColumnDef } from '../viewer/ReportViewer';
import { YoYChart } from './YoYChart';
import { formatCurrency, formatCurrencyDelta, formatPercent, formatCurrencyDetailed } from '@/lib/formatters';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { FilterConfig } from '@/components/shared/FilterBar';
import type { YoYResponse, LoBRef } from '@/types/api';
import { CalendarRange, Calendar, TrendingUp, Activity } from 'lucide-react';

const ALL_COLUMNS: ColumnDef[] = [
  { key: 'month', label: 'Month' },
  { key: 'fy_current', label: 'FY Current' },
  { key: 'fy_previous', label: 'FY Previous' },
  { key: 'delta', label: 'Delta (€)' },
  { key: 'delta_pct', label: 'Delta (%)' },
  { key: 'cumulative_current', label: 'Cum. Current' },
  { key: 'cumulative_previous', label: 'Cum. Previous' },
];

const COST_TYPE_OPTIONS = [
  { value: 'internal', label: 'Internal' },
  { value: 'external', label: 'External' },
  { value: 'all', label: 'All' },
];

const FISCAL_YEAR_OPTIONS = [
  { value: '2024', label: 'FY 2024' },
  { value: '2025', label: 'FY 2025' },
  { value: '2026', label: 'FY 2026' },
  { value: '2027', label: 'FY 2027' },
];

export function YoYReport() {
  const { currentRoleId } = useRole();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<YoYResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lobs, setLobs] = useState<LoBRef[]>([]);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [cumulative, setCumulative] = useState(true);
  const [filters, setFilters] = useState<Record<string, string>>({
    lob: '',
    cost_type: '',
    fy_current: '2026',
    fy_previous: '2025',
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
    if (filters.cost_type) params.cost_type = filters.cost_type;
    if (filters.fy_current) params.fy_current = filters.fy_current;
    if (filters.fy_previous) params.fy_previous = filters.fy_previous;

    reportsApi
      .getYearOverYear(params)
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
    { key: 'cost_type', label: 'Cost Type', options: COST_TYPE_OPTIONS },
    { key: 'fy_current', label: 'Current Year', options: FISCAL_YEAR_OPTIONS },
    { key: 'fy_previous', label: 'Previous Year', options: FISCAL_YEAR_OPTIONS },
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

  const trajectoryLabel =
    kpis.trajectory === 'higher'
      ? 'Spending Higher'
      : kpis.trajectory === 'lower'
        ? 'Spending Lower'
        : 'On Track';

  const kpiRow = (
    <div className="grid grid-cols-4 gap-3">
      <SummaryCard
        label={`FY ${kpis.fy_current_label} YTD`}
        value={formatCurrency(kpis.fy_current_ytd)}
        icon={<CalendarRange className="h-5 w-5" />}
      />
      <SummaryCard
        label={`FY ${kpis.fy_previous_label} YTD`}
        value={formatCurrency(kpis.fy_previous_ytd)}
        icon={<Calendar className="h-5 w-5" />}
      />
      <SummaryCard
        label="YTD Delta"
        value={formatCurrencyDelta(kpis.ytd_delta)}
        icon={<TrendingUp className="h-5 w-5" />}
      />
      <SummaryCard
        label="Trajectory"
        value={trajectoryLabel}
        icon={<Activity className="h-5 w-5" />}
      />
    </div>
  );

  const chartContent = (
    <div>
      <div className="flex justify-end mb-2">
        <Tabs
          value={cumulative ? 'cumulative' : 'monthly'}
          onValueChange={(v) => setCumulative(v === 'cumulative')}
        >
          <TabsList>
            <TabsTrigger value="cumulative">Cumulative</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <YoYChart
        data={chart_data}
        cumulative={cumulative}
        currentLabel={kpis.fy_current_label}
        previousLabel={kpis.fy_previous_label}
      />
    </div>
  );

  const tableContent = (
    <div className="rounded-lg border border-slate-200 bg-white overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {show('month') && <th className="px-3 py-2 text-left font-medium text-slate-600">Month</th>}
            {show('fy_current') && <th className="px-3 py-2 text-right font-medium text-slate-600">FY {kpis.fy_current_label}</th>}
            {show('fy_previous') && <th className="px-3 py-2 text-right font-medium text-slate-600">FY {kpis.fy_previous_label}</th>}
            {show('delta') && <th className="px-3 py-2 text-right font-medium text-slate-600">Delta (€)</th>}
            {show('delta_pct') && <th className="px-3 py-2 text-right font-medium text-slate-600">Delta (%)</th>}
            {show('cumulative_current') && <th className="px-3 py-2 text-right font-medium text-slate-600">Cum. FY {kpis.fy_current_label}</th>}
            {show('cumulative_previous') && <th className="px-3 py-2 text-right font-medium text-slate-600">Cum. FY {kpis.fy_previous_label}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.month} className="border-t border-slate-100 hover:bg-slate-50">
              {show('month') && <td className="px-3 py-2 text-slate-700 font-medium">{r.month}</td>}
              {show('fy_current') && <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrencyDetailed(r.fy_current)}</td>}
              {show('fy_previous') && <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrencyDetailed(r.fy_previous)}</td>}
              {show('delta') && (
                <td className={`px-3 py-2 text-right font-mono text-xs ${r.delta > 0 ? 'text-red-600' : r.delta < 0 ? 'text-green-600' : ''}`}>
                  {formatCurrencyDetailed(r.delta)}
                </td>
              )}
              {show('delta_pct') && (
                <td className={`px-3 py-2 text-right font-mono text-xs ${r.delta_pct > 0 ? 'text-red-600' : r.delta_pct < 0 ? 'text-green-600' : ''}`}>
                  {formatPercent(r.delta_pct)}
                </td>
              )}
              {show('cumulative_current') && <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrencyDetailed(r.cumulative_current)}</td>}
              {show('cumulative_previous') && <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrencyDetailed(r.cumulative_previous)}</td>}
            </tr>
          ))}
          <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
            {show('month') && <td className="px-3 py-2 text-slate-700">Total</td>}
            {show('fy_current') && <td className="px-3 py-2 text-right text-slate-700">{formatCurrencyDetailed(rows.reduce((s, r) => s + r.fy_current, 0))}</td>}
            {show('fy_previous') && <td className="px-3 py-2 text-right text-slate-700">{formatCurrencyDetailed(rows.reduce((s, r) => s + r.fy_previous, 0))}</td>}
            {show('delta') && <td className="px-3 py-2 text-right text-slate-700">{formatCurrencyDetailed(rows.reduce((s, r) => s + r.delta, 0))}</td>}
            {show('delta_pct') && <td />}
            {show('cumulative_current') && <td />}
            {show('cumulative_previous') && <td />}
          </tr>
        </tbody>
      </table>
    </div>
  );

  const handleSaveView = (name: string) => {
    reportsApi.createSavedView({
      report_id: 'year-over-year',
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
      title="Year-over-Year Comparison"
      reportId="year-over-year"
      filters={filterConfigs}
      filterValues={filters}
      onFilterChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
      onFilterClear={() => setFilters({ lob: '', cost_type: '', fy_current: '2026', fy_previous: '2025' })}
      kpis={kpiRow}
      view={view}
      onViewChange={setView}
      chartContent={chartContent}
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
