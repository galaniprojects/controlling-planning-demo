import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useRole } from '@/contexts/RoleContext';
import { reportsApi, referenceApi } from '@/api/endpoints';
import { Skeleton } from '@/components/shared/Skeleton';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { SummaryCard } from '@/modules/capacity/shared/SummaryCard';
import { ReportViewer } from '../viewer/ReportViewer';
import { CCFinancialCharts } from './CCFinancialCharts';
import { formatCurrency, formatPercent, formatCurrencyDetailed } from '@/lib/formatters';
import type { FilterConfig } from '@/components/shared/FilterBar';
import type { CCFinancialResponse, RefCostCenter } from '@/types/api';
import { Building2, DollarSign, Users, Truck, Layers } from 'lucide-react';

const TYPE_OPTIONS = [
  { value: 'project', label: 'Project' },
  { value: 'service', label: 'Service' },
];

const FISCAL_YEAR_OPTIONS = [
  { value: '__all__', label: 'All Years (Lifetime)' },
  ...Array.from({ length: 9 }, (_, i) => ({
    value: String(2021 + i),
    label: `FY ${2021 + i}`,
  })),
];

export function CCFinancialReport() {
  const { currentRoleId, context } = useRole();
  const [searchParams] = useSearchParams();
  const role = context?.role ?? '';
  const [data, setData] = useState<CCFinancialResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [costCenters, setCostCenters] = useState<RefCostCenter[]>([]);
  const [view, setView] = useState<'chart' | 'table'>('table');
  const [filters, setFilters] = useState<Record<string, string>>({
    cost_center: '',
    type: '',
    fiscal_year: '2026',
  });

  // Pre-set cost center for CC Owner
  useEffect(() => {
    if (role === 'cost_center_owner' && context?.managed_cost_center_id) {
      setFilters((f) => ({ ...f, cost_center: context.managed_cost_center_id! }));
    } else {
      setFilters((f) => ({ ...f, cost_center: '' }));
    }
  }, [currentRoleId, role, context?.managed_cost_center_id]);

  useEffect(() => {
    referenceApi.getCostCenters().then((r) => setCostCenters(r.items)).catch(() => {});
  }, []);

  // Load saved view config if ?view=ID
  useEffect(() => {
    const viewId = searchParams.get('view');
    if (!viewId) return;
    reportsApi.getSavedViews().then((r) => {
      const sv = r.items.find((v) => v.id === Number(viewId));
      if (!sv) return;
      if (sv.config.filters) setFilters((f) => ({ ...f, ...sv.config.filters }));
      if (sv.config.viz_type === 'chart' || sv.config.viz_type === 'table') setView(sv.config.viz_type);
    }).catch(() => {});
  }, [searchParams]);

  const fetchData = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (filters.cost_center) params.cost_center = filters.cost_center;
    if (filters.type) params.type = filters.type;
    if (filters.fiscal_year) params.fiscal_year = filters.fiscal_year;

    reportsApi
      .getCCFinancialSummary(params)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [filters, currentRoleId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filterConfigs: FilterConfig[] = [
    {
      key: 'cost_center',
      label: 'Cost Center',
      options: costCenters.map((cc) => ({ value: cc.id, label: cc.name })),
    },
    { key: 'type', label: 'Type', options: TYPE_OPTIONS },
    { key: 'fiscal_year', label: 'Fiscal Year', options: FISCAL_YEAR_OPTIONS },
  ];

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

  const { kpis, rows, chart_data } = data;

  const kpiRow = (
    <div className="grid grid-cols-5 gap-3">
      <SummaryCard
        label="Total Budget"
        value={formatCurrency(kpis.total_budget_allocated)}
        icon={<DollarSign className="h-5 w-5" />}
      />
      <SummaryCard
        label="Total Actuals"
        value={formatCurrency(kpis.total_actuals)}
        icon={<Building2 className="h-5 w-5" />}
      />
      <SummaryCard
        label="Internal Cost"
        value={formatCurrency(kpis.total_internal_cost)}
        icon={<Users className="h-5 w-5" />}
      />
      <SummaryCard
        label="External Cost"
        value={formatCurrency(kpis.total_external_cost)}
        icon={<Truck className="h-5 w-5" />}
      />
      <SummaryCard
        label="Projects"
        value={kpis.active_project_count}
        icon={<Layers className="h-5 w-5" />}
      />
    </div>
  );

  const tableContent = (
    <div className="rounded-lg border border-slate-200 bg-white overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="px-3 py-2 text-left font-medium text-slate-600">Project</th>
            <th className="px-3 py-2 text-right font-medium text-slate-600">Internal Hours</th>
            <th className="px-3 py-2 text-right font-medium text-slate-600">Internal Cost</th>
            <th className="px-3 py-2 text-right font-medium text-slate-600">External Cost</th>
            <th className="px-3 py-2 text-right font-medium text-slate-600">Total</th>
            <th className="px-3 py-2 text-right font-medium text-slate-600">% of CC Budget</th>
            <th className="px-3 py-2 text-center font-medium text-slate-600">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.project_id} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-3 py-2 text-slate-700">{r.project_name}</td>
              <td className="px-3 py-2 text-right font-mono text-xs">
                {r.internal_hours.toLocaleString('de-DE')}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs">
                {formatCurrencyDetailed(r.internal_cost)}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs">
                {formatCurrencyDetailed(r.external_cost)}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs font-semibold">
                {formatCurrencyDetailed(r.total_cost)}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs">
                {r.pct_of_cc_budget.toFixed(1).replace('.', ',')}%
              </td>
              <td className="px-3 py-2 text-center">
                <StatusBadge status={r.status} />
              </td>
            </tr>
          ))}
          {/* Summary row */}
          <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
            <td className="px-3 py-2 text-slate-700">
              Total ({rows.length} projects)
            </td>
            <td className="px-3 py-2 text-right font-mono text-xs">
              {rows.reduce((s, r) => s + r.internal_hours, 0).toLocaleString('de-DE')}
            </td>
            <td className="px-3 py-2 text-right font-mono text-xs">
              {formatCurrencyDetailed(kpis.total_internal_cost)}
            </td>
            <td className="px-3 py-2 text-right font-mono text-xs">
              {formatCurrencyDetailed(kpis.total_external_cost)}
            </td>
            <td className="px-3 py-2 text-right font-mono text-xs">
              {formatCurrencyDetailed(kpis.total_actuals)}
            </td>
            <td />
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );

  const handleSaveView = (name: string) => {
    reportsApi.createSavedView({
      report_id: 'cc-financial-summary',
      name,
      config: {
        filters,
        columns: [],
        grouping: '',
        sort_column: '',
        sort_direction: 'asc',
        viz_type: view,
      },
    }).catch(() => {});
  };

  return (
    <ReportViewer
      title="Cost Center Financial Summary"
      reportId="cc-financial-summary"
      filters={filterConfigs}
      filterValues={filters}
      onFilterChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
      onFilterClear={() => setFilters({ cost_center: '', type: '', fiscal_year: '2026' })}
      kpis={kpiRow}
      view={view}
      onViewChange={setView}
      chartContent={<CCFinancialCharts pie={chart_data.pie} trend={chart_data.trend} />}
      tableContent={tableContent}
      onSaveView={handleSaveView}
    />
  );
}
