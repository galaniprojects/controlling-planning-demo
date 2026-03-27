import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useRole } from '@/contexts/RoleContext';
import { reportsApi, referenceApi } from '@/api/endpoints';
import { useActiveHierarchy, buildHierarchyFilterConfigs, getMostSpecificEntityFilter, clearLowerHierarchyFilters } from '@/hooks/useActiveHierarchy';
import { Skeleton } from '@/components/shared/Skeleton';
import { SummaryCard } from '@/modules/capacity/shared/SummaryCard';
import { ReportViewer, type ColumnDef } from '../viewer/ReportViewer';
import { YoYChart } from './YoYChart';
import { formatCurrency, formatCurrencyDelta, formatPercent, formatCurrencyDetailed } from '@/lib/formatters';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { FilterConfig } from '@/components/shared/FilterBar';
import type { YoYResponse, LoBRef } from '@/types/api';
import { SortableHeader } from '@/components/shared/SortableHeader';
import { CalendarRange, Calendar, TrendingUp, Activity } from 'lucide-react';

const ALL_COLUMNS: ColumnDef[] = [
  { key: 'lob_name', label: 'LoB' },
  { key: 'project_name', label: 'Project' },
  { key: 'month', label: 'Month' },
  { key: 'fy_current', label: 'FY Current' },
  { key: 'fy_previous', label: 'FY Previous' },
  { key: 'delta', label: 'Delta (\u20ac)' },
  { key: 'delta_pct', label: 'Delta (%)' },
  { key: 'cumulative_current', label: 'Cum. Current' },
  { key: 'cumulative_previous', label: 'Cum. Previous' },
];

const ANNUAL_COLS = ['lob_name', 'project_name', 'fy_current', 'fy_previous', 'delta', 'delta_pct'];
const MONTHLY_COLS = ['lob_name', 'project_name', 'month', 'fy_current', 'fy_previous', 'delta', 'delta_pct', 'cumulative_current', 'cumulative_previous'];

const COST_TYPE_OPTIONS = [
  { value: 'internal', label: 'Internal' },
  { value: 'external', label: 'External' },
  { value: 'all', label: 'All' },
];

const FISCAL_YEAR_OPTIONS = [
  { value: '__all__', label: 'All Years (Lifetime)' },
  ...Array.from({ length: 9 }, (_, i) => ({
    value: String(2021 + i),
    label: `FY ${2021 + i}`,
  })),
];

const MONTH_OPTIONS = [
  { value: '1', label: 'Jan' }, { value: '2', label: 'Feb' },
  { value: '3', label: 'Mar' }, { value: '4', label: 'Apr' },
  { value: '5', label: 'May' }, { value: '6', label: 'Jun' },
  { value: '7', label: 'Jul' }, { value: '8', label: 'Aug' },
  { value: '9', label: 'Sep' }, { value: '10', label: 'Oct' },
  { value: '11', label: 'Nov' }, { value: '12', label: 'Dec' },
];

export function YoYReport() {
  const { currentRoleId } = useRole();
  const { topLevelLabel, levels, entityTree } = useActiveHierarchy();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<YoYResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lobs, setLobs] = useState<LoBRef[]>([]);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [cumulative, setCumulative] = useState(true);
  const [showMonthly, setShowMonthly] = useState(false);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({
    lob: '',
    cost_type: '',
    fy_current: '2026',
    fy_previous: '2025',
  });
  const [visibleCols, setVisibleCols] = useState(ANNUAL_COLS);
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

  // RPT-08: sync visible columns when toggle changes
  useEffect(() => {
    setVisibleCols(showMonthly ? MONTHLY_COLS : ANNUAL_COLS);
  }, [showMonthly]);

  const fetchData = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = {};
    const entityFilter = getMostSpecificEntityFilter(filters, levels);
    if (entityFilter) params.lob = entityFilter;
    if (filters.cost_type) params.cost_type = filters.cost_type;
    if (filters.fy_current) params.fy_current = filters.fy_current;
    if (filters.fy_previous) params.fy_previous = filters.fy_previous;
    if (showMonthly) params.show_monthly = 'true';
    if (showMonthly && selectedMonths.length > 0) params.months = selectedMonths.join(',');

    reportsApi
      .getYearOverYear(params)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [filters, showMonthly, selectedMonths, currentRoleId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const hierarchyFilters = buildHierarchyFilterConfigs(levels, entityTree, filters, lobs);
  const filterConfigs: FilterConfig[] = [
    ...hierarchyFilters,
    { key: 'cost_type', label: 'Cost Type', options: COST_TYPE_OPTIONS },
    { key: 'fy_current', label: 'Current Year', options: FISCAL_YEAR_OPTIONS },
    { key: 'fy_previous', label: 'Previous Year', options: FISCAL_YEAR_OPTIONS },
  ];

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => {
      const updated = { ...prev, [key]: value };
      return clearLowerHierarchyFilters(updated, key, levels);
    });
  };

  const onSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  // Sort rows
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
    <div className="space-y-3">
      {/* RPT-08: Monthly detail toggle + month filter */}
      <div className="flex items-center gap-4">
        <Button
          variant={showMonthly ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            setShowMonthly((v) => !v);
            setSelectedMonths([]);
          }}
        >
          {showMonthly ? 'Hide Monthly Detail' : 'Show Monthly Detail'}
        </Button>
        {showMonthly && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500">Months:</span>
            {MONTH_OPTIONS.map((m) => {
              const checked = selectedMonths.includes(m.value);
              return (
                <label key={m.value} className="flex items-center gap-1 cursor-pointer">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() =>
                      setSelectedMonths((prev) =>
                        prev.includes(m.value)
                          ? prev.filter((v) => v !== m.value)
                          : [...prev, m.value]
                      )
                    }
                  />
                  <span className="text-xs text-slate-600">{m.label}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              {show('lob_name') && <SortableHeader column="lob_name" label={topLevelLabel} sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} />}
              {show('project_name') && <SortableHeader column="project_name" label="Project" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} />}
              {show('month') && <SortableHeader column="month" label="Month" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} />}
              {show('fy_current') && <SortableHeader column="fy_current" label={`FY ${kpis.fy_current_label}`} sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} align="right" />}
              {show('fy_previous') && <SortableHeader column="fy_previous" label={`FY ${kpis.fy_previous_label}`} sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} align="right" />}
              {show('delta') && <SortableHeader column="delta" label="Delta (\u20ac)" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} align="right" />}
              {show('delta_pct') && <SortableHeader column="delta_pct" label="Delta (%)" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} align="right" />}
              {show('cumulative_current') && <SortableHeader column="cumulative_current" label={`Cum. FY ${kpis.fy_current_label}`} sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} align="right" />}
              {show('cumulative_previous') && <SortableHeader column="cumulative_previous" label={`Cum. FY ${kpis.fy_previous_label}`} sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} align="right" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.project_id ?? ''}-${r.month ?? ''}-${i}`} className="border-t border-slate-100 hover:bg-slate-50">
                {show('lob_name') && <td className="px-3 py-2 text-slate-600 text-xs">{r.lob_name || '\u2014'}</td>}
                {show('project_name') && <td className="px-3 py-2 text-slate-700 font-medium">{r.project_name || '\u2014'}</td>}
                {show('month') && <td className="px-3 py-2 text-slate-700 font-medium">{r.month || '\u2014'}</td>}
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
                {show('cumulative_current') && <td className="px-3 py-2 text-right font-mono text-xs">{r.cumulative_current != null ? formatCurrencyDetailed(r.cumulative_current) : '\u2014'}</td>}
                {show('cumulative_previous') && <td className="px-3 py-2 text-right font-mono text-xs">{r.cumulative_previous != null ? formatCurrencyDetailed(r.cumulative_previous) : '\u2014'}</td>}
              </tr>
            ))}
            <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
              {show('lob_name') && <td className="px-3 py-2 text-slate-700">Total</td>}
              {show('project_name') && <td className="px-3 py-2 text-slate-700">{!show('lob_name') ? 'Total' : ''}</td>}
              {show('month') && <td />}
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
      onFilterChange={handleFilterChange}
      onFilterClear={() => {
        setFilters({ cost_type: '', fy_current: '2026', fy_previous: '2025' });
        setShowMonthly(false);
        setSelectedMonths([]);
      }}
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
