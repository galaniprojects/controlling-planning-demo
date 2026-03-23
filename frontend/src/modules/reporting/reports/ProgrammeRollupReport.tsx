import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useRole } from '@/contexts/RoleContext';
import { reportsApi, referenceApi, workbenchApi } from '@/api/endpoints';
import { Skeleton } from '@/components/shared/Skeleton';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { SummaryCard } from '@/modules/capacity/shared/SummaryCard';
import { ReportViewer } from '../viewer/ReportViewer';
import { ProgrammeRollupChart } from './ProgrammeRollupChart';
import { formatCurrency, formatPercent, formatCurrencyDetailed } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { FilterConfig } from '@/components/shared/FilterBar';
import type { ProgrammeRollupResponse, LoBRef } from '@/types/api';
import { BarChart3, TrendingUp, TrendingDown, Layers, Users, Save, X } from 'lucide-react';

const RAG_OPTIONS = [
  { value: 'green', label: 'Green' },
  { value: 'amber', label: 'Amber' },
  { value: 'red', label: 'Red' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'planned', label: 'Planned' },
  { value: 'completed', label: 'Completed' },
];

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

function ragBadge(rag: string | null) {
  if (!rag) return <span className="text-xs text-slate-400">{'\u2014'}</span>;
  const colors: Record<string, string> = {
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${colors[rag] ?? 'bg-slate-100 text-slate-500'}`}>
      {rag.charAt(0).toUpperCase() + rag.slice(1)}
    </span>
  );
}

interface ProjectRef {
  id: string;
  name: string;
}

interface CustomGroup {
  id: number;
  name: string;
  project_ids: string[];
}

export function ProgrammeRollupReport() {
  const { currentRoleId } = useRole();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<ProgrammeRollupResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lobs, setLobs] = useState<LoBRef[]>([]);
  const [view, setView] = useState<'chart' | 'table'>('table');
  const [filters, setFilters] = useState<Record<string, string>>({
    lob: '',
    status: '',
    rag: '',
    type: '',
    fiscal_year: '2026',
  });

  // RPT-03: Custom group state
  const [customGroupMode, setCustomGroupMode] = useState(false);
  const [allProjects, setAllProjects] = useState<ProjectRef[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [projectSearch, setProjectSearch] = useState('');
  const [savedGroups, setSavedGroups] = useState<CustomGroup[]>([]);
  const [saveGroupName, setSaveGroupName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);

  useEffect(() => {
    referenceApi.getLobs().then((r) => setLobs(r.items)).catch(() => {});
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

  // RPT-03: load projects and saved groups when custom group mode activates
  useEffect(() => {
    if (!customGroupMode) return;
    workbenchApi.getProjects().then((r) => {
      setAllProjects(r.items.map((p) => ({ id: p.id, name: p.name })));
    }).catch(() => {});
    reportsApi.getCustomGroups().then((r) => setSavedGroups(r.items)).catch(() => {});
  }, [customGroupMode]);

  const fetchData = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (filters.lob) params.lob = filters.lob;
    if (filters.status) params.status = filters.status;
    if (filters.rag) params.rag = filters.rag;
    if (filters.type) params.type = filters.type;
    if (filters.fiscal_year) params.fiscal_year = filters.fiscal_year;
    // RPT-03: pass custom group project IDs
    if (customGroupMode && selectedProjectIds.length > 0) {
      params.project_ids = selectedProjectIds.join(',');
    }

    reportsApi
      .getProgrammeRollup(params)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [filters, customGroupMode, selectedProjectIds, currentRoleId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filterConfigs: FilterConfig[] = [
    {
      key: 'lob',
      label: 'Line of Business',
      options: lobs.map((l) => ({ value: l.id, label: l.name })),
    },
    { key: 'status', label: 'Status', options: STATUS_OPTIONS },
    { key: 'rag', label: 'RAG', options: RAG_OPTIONS },
    { key: 'type', label: 'Type', options: TYPE_OPTIONS },
    { key: 'fiscal_year', label: 'Fiscal Year', options: FISCAL_YEAR_OPTIONS },
  ];

  const handleToggleProject = (pid: string) => {
    setSelectedProjectIds((prev) =>
      prev.includes(pid) ? prev.filter((id) => id !== pid) : [...prev, pid]
    );
  };

  const handleSaveGroup = () => {
    if (!saveGroupName.trim() || selectedProjectIds.length === 0) return;
    reportsApi.createCustomGroup({
      name: saveGroupName.trim(),
      config: { project_ids: selectedProjectIds },
    }).then((g) => {
      setSavedGroups((prev) => [g, ...prev]);
      setSaveGroupName('');
      setShowSaveInput(false);
    }).catch(() => {});
  };

  const handleLoadGroup = (group: CustomGroup) => {
    setSelectedProjectIds(group.project_ids);
  };

  const handleDeleteGroup = (id: number) => {
    reportsApi.deleteCustomGroup(id).then(() => {
      setSavedGroups((prev) => prev.filter((g) => g.id !== id));
    }).catch(() => {});
  };

  const filteredProjects = allProjects.filter((p) =>
    p.name.toLowerCase().includes(projectSearch.toLowerCase())
  );

  if (loading && !data) {
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

  // Group rows by LoB
  const grouped = rows.reduce<Record<string, typeof rows>>((acc, r) => {
    const key = r.lob_name || 'Other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  const kpiRow = (
    <div className="grid grid-cols-5 gap-3">
      <SummaryCard
        label="Projects"
        value={kpis.project_count}
        icon={<Layers className="h-5 w-5" />}
      />
      <SummaryCard
        label="Total Baseline"
        value={formatCurrency(kpis.total_baseline)}
        icon={<BarChart3 className="h-5 w-5" />}
      />
      <SummaryCard
        label="Total Forecast"
        value={formatCurrency(kpis.total_forecast)}
        icon={<TrendingUp className="h-5 w-5" />}
      />
      <SummaryCard
        label="Overall Variance"
        value={formatPercent(kpis.overall_variance_pct)}
        icon={<TrendingDown className="h-5 w-5" />}
      />
      <SummaryCard
        label="RAG Distribution"
        value={`G:${kpis.rag_distribution.green ?? 0} A:${kpis.rag_distribution.amber ?? 0} R:${kpis.rag_distribution.red ?? 0}`}
      />
    </div>
  );

  const tableContent = (
    <div className="space-y-3">
      {/* RPT-03: Custom Group controls */}
      <div className="flex items-center gap-3">
        <Button
          variant={customGroupMode ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            setCustomGroupMode((v) => !v);
            if (customGroupMode) {
              setSelectedProjectIds([]);
              setProjectSearch('');
            }
          }}
        >
          <Users className="h-3.5 w-3.5 mr-1.5" />
          {customGroupMode ? 'Exit Custom Group' : 'Custom Group'}
        </Button>
        {customGroupMode && selectedProjectIds.length > 0 && (
          <span className="text-xs text-slate-500">
            {selectedProjectIds.length} project{selectedProjectIds.length !== 1 ? 's' : ''} selected
          </span>
        )}
      </div>

      {customGroupMode && (
        <div className="border rounded-lg p-3 bg-slate-50 space-y-3">
          <div className="flex gap-3">
            {/* Project selector */}
            <div className="flex-1 space-y-2">
              <Input
                placeholder="Search projects..."
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                className="text-sm h-8"
              />
              <div className="border rounded bg-white max-h-40 overflow-y-auto p-2 space-y-1">
                {filteredProjects.length === 0 ? (
                  <p className="text-xs text-slate-400 py-1">No projects found</p>
                ) : (
                  filteredProjects.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={selectedProjectIds.includes(p.id)}
                        onCheckedChange={() => handleToggleProject(p.id)}
                      />
                      <span className="text-xs text-slate-700">{p.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            {/* Saved groups */}
            <div className="w-56 space-y-2">
              <p className="text-xs font-medium text-slate-500">Saved Groups</p>
              {savedGroups.length === 0 ? (
                <p className="text-xs text-slate-400">No saved groups</p>
              ) : (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {savedGroups.map((g) => (
                    <div key={g.id} className="flex items-center justify-between gap-1 text-xs border rounded px-2 py-1 bg-white">
                      <button
                        className="text-left text-slate-700 hover:text-blue-600 truncate flex-1"
                        onClick={() => handleLoadGroup(g)}
                      >
                        {g.name} ({g.project_ids.length})
                      </button>
                      <button
                        className="text-slate-400 hover:text-red-500 shrink-0"
                        onClick={() => handleDeleteGroup(g.id)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Save current selection */}
              {selectedProjectIds.length > 0 && (
                showSaveInput ? (
                  <div className="flex gap-1">
                    <Input
                      placeholder="Group name..."
                      value={saveGroupName}
                      onChange={(e) => setSaveGroupName(e.target.value)}
                      className="text-xs h-7 flex-1"
                    />
                    <Button size="sm" className="h-7 px-2" onClick={handleSaveGroup}>
                      <Save className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs h-7"
                    onClick={() => setShowSaveInput(true)}
                  >
                    <Save className="h-3 w-3 mr-1" />
                    Save Selection as Group
                  </Button>
                )
              )}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-3 py-2 text-left font-medium text-slate-600">Project</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Status</th>
              <th className="px-3 py-2 text-right font-medium text-slate-600">Baseline</th>
              <th className="px-3 py-2 text-right font-medium text-slate-600">Forecast</th>
              <th className="px-3 py-2 text-right font-medium text-slate-600">Actuals</th>
              <th className="px-3 py-2 text-right font-medium text-slate-600">Remaining</th>
              <th className="px-3 py-2 text-right font-medium text-slate-600">Variance</th>
              <th className="px-3 py-2 text-right font-medium text-slate-600">Var%</th>
              <th className="px-3 py-2 text-center font-medium text-slate-600">RAG</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(grouped).map(([lobName, lobRows]) => (
              <GroupSection key={lobName} lobName={lobName} rows={lobRows} />
            ))}
            {/* Summary row */}
            <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
              <td className="px-3 py-2 text-slate-700" colSpan={2}>
                Total ({rows.length} projects)
              </td>
              <td className="px-3 py-2 text-right text-slate-700">
                {formatCurrencyDetailed(kpis.total_baseline)}
              </td>
              <td className="px-3 py-2 text-right text-slate-700">
                {formatCurrencyDetailed(kpis.total_forecast)}
              </td>
              <td className="px-3 py-2 text-right text-slate-700">
                {formatCurrencyDetailed(rows.reduce((s, r) => s + r.actuals_to_date, 0))}
              </td>
              <td className="px-3 py-2 text-right text-slate-700">
                {formatCurrencyDetailed(rows.reduce((s, r) => s + r.remaining_forecast, 0))}
              </td>
              <td className="px-3 py-2 text-right text-slate-700">
                {formatCurrencyDetailed(kpis.overall_variance)}
              </td>
              <td className="px-3 py-2 text-right text-slate-700">
                {formatPercent(kpis.overall_variance_pct)}
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );

  const handleSaveView = (name: string) => {
    reportsApi.createSavedView({
      report_id: 'programme-rollup',
      name,
      config: {
        filters,
        columns: [],
        grouping: 'lob',
        sort_column: '',
        sort_direction: 'asc',
        viz_type: view,
      },
    }).catch(() => {});
  };

  return (
    <ReportViewer
      title="Programme / Multi-Project Rollup"
      reportId="programme-rollup"
      filters={filterConfigs}
      filterValues={filters}
      onFilterChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
      onFilterClear={() => setFilters({ lob: '', status: '', rag: '', type: '', fiscal_year: '2026' })}
      kpis={kpiRow}
      view={view}
      onViewChange={setView}
      chartContent={<ProgrammeRollupChart data={chart_data} />}
      tableContent={tableContent}
      onSaveView={handleSaveView}
    />
  );
}

function GroupSection({
  lobName,
  rows,
}: {
  lobName: string;
  rows: ProgrammeRollupResponse['rows'];
}) {
  const subtotalBaseline = rows.reduce((s, r) => s + r.baseline_budget, 0);
  const subtotalForecast = rows.reduce((s, r) => s + r.current_forecast, 0);

  return (
    <>
      <tr className="bg-blue-50/50 border-t border-slate-200">
        <td className="px-3 py-1.5 text-xs font-semibold text-blue-700" colSpan={9}>
          {lobName} {'\u2014'} {rows.length} projects | Baseline: {formatCurrency(subtotalBaseline)} | Forecast: {formatCurrency(subtotalForecast)}
        </td>
      </tr>
      {rows.map((r) => (
        <tr key={r.project_id} className="border-t border-slate-100 hover:bg-slate-50">
          <td className="px-3 py-2 text-slate-700">{r.project_name}</td>
          <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
          <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrencyDetailed(r.baseline_budget)}</td>
          <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrencyDetailed(r.current_forecast)}</td>
          <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrencyDetailed(r.actuals_to_date)}</td>
          <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrencyDetailed(r.remaining_forecast)}</td>
          <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrencyDetailed(r.variance)}</td>
          <td className={`px-3 py-2 text-right font-mono text-xs ${r.variance_pct > 5 ? 'text-red-600' : r.variance_pct > 0 ? 'text-amber-600' : 'text-green-600'}`}>
            {formatPercent(r.variance_pct)}
          </td>
          <td className="px-3 py-2 text-center">{ragBadge(r.rag)}</td>
        </tr>
      ))}
    </>
  );
}
