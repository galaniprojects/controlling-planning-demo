import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, Truck, Hash, FileText, DollarSign } from 'lucide-react';
import { useRole } from '@/contexts/RoleContext';
import { reportsApi, referenceApi } from '@/api/endpoints';
import { useActiveHierarchy, buildHierarchyFilterConfigs, getMostSpecificEntityFilter, clearLowerHierarchyFilters } from '@/hooks/useActiveHierarchy';
import { Skeleton } from '@/components/shared/Skeleton';
import { SummaryCard } from '@/components/shared/SummaryCard';
import { ReportViewer } from '../viewer/ReportViewer';
import { VendorSpendCharts } from './VendorSpendCharts';
import { formatCurrency, formatCurrencyDetailed } from '@/lib/formatters';
import type { FilterConfig } from '@/components/shared/FilterBar';
import type { VendorSpendResponse, VendorDrillDownRow, LoBRef } from '@/types/api';
import { ExternalCostStatusBadge } from '@/modules/workbench/forecast/ExternalCostStatusBadge';
import { SortableHeader } from '@/components/shared/SortableHeader';

// Values must match Project.pipeline_stage exactly (backend filters on it).
const STATUS_OPTIONS = [
  { value: 'Approved', label: 'Approved' },
  { value: 'Active', label: 'Active' },
  { value: 'Hyper-maintenance', label: 'Hyper-maintenance' },
  { value: 'Completed', label: 'Completed' },
];

const FISCAL_YEAR_OPTIONS = [
  { value: '__all__', label: 'All Years (Lifetime)' },
  ...Array.from({ length: 9 }, (_, i) => ({
    value: String(2021 + i),
    label: `FY ${2021 + i}`,
  })),
];

export function VendorSpendReport() {
  const { currentRoleId } = useRole();
  const { topLevelLabel, levels, entityTree } = useActiveHierarchy();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<VendorSpendResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lobs, setLobs] = useState<LoBRef[]>([]);
  const [costTypes, setCostTypes] = useState<{ id: string; name: string }[]>([]);
  const [view, setView] = useState<'chart' | 'table'>('table');
  const [filters, setFilters] = useState<Record<string, string>>({
    vendor: '',
    lob: '',
    status: '',
    fiscal_year: '2026',
    expense_cost_type: '',
  });
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null);
  const [drillDown, setDrillDown] = useState<VendorDrillDownRow[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);
  const [sortColumn, setSortColumn] = useState('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    referenceApi.getLobs().then((r) => setLobs(r.items)).catch(() => {});
    referenceApi.getCostTypes().then((r) => setCostTypes(r.items)).catch(() => {});
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
    if (filters.vendor) params.vendor = filters.vendor;
    const entityFilter = getMostSpecificEntityFilter(filters, levels);
    if (entityFilter) params.lob = entityFilter;
    if (filters.status) params.status = filters.status;
    if (filters.fiscal_year) params.fiscal_year = filters.fiscal_year;
    if (filters.expense_cost_type) params.expense_cost_type = filters.expense_cost_type;

    reportsApi
      .getVendorSpend(params)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [filters, currentRoleId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleVendor = (vendorName: string) => {
    if (expandedVendor === vendorName) {
      setExpandedVendor(null);
      setDrillDown([]);
      return;
    }
    setExpandedVendor(vendorName);
    setDrillLoading(true);
    reportsApi
      .getVendorDrillDown(vendorName)
      .then((r) => setDrillDown(r.items))
      .catch(() => setDrillDown([]))
      .finally(() => setDrillLoading(false));
  };

  // Build vendor filter options from data
  const vendorOptions = data
    ? data.rows.map((r) => ({ value: r.vendor_name, label: r.vendor_name }))
    : [];

  const hierarchyFilters = buildHierarchyFilterConfigs(levels, entityTree, filters, lobs);
  const filterConfigs: FilterConfig[] = [
    { key: 'vendor', label: 'Vendor', options: vendorOptions },
    ...hierarchyFilters,
    { key: 'status', label: 'Project Status', options: STATUS_OPTIONS },
    { key: 'fiscal_year', label: 'Fiscal Year', options: FISCAL_YEAR_OPTIONS },
    { key: 'expense_cost_type', label: 'Expense Cost Type', options: costTypes.map((t) => ({ value: t.id, label: t.name })) },
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

  const sortedRows = useMemo(() => {
    if (!data || !sortColumn) return data?.rows ?? [];
    const sorted = [...data.rows];
    sorted.sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortColumn];
      const bv = (b as Record<string, unknown>)[sortColumn];
      if (typeof av === 'number' && typeof bv === 'number') return sortDirection === 'asc' ? av - bv : bv - av;
      return sortDirection === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
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
    return <p className="text-sm text-muted-foreground">Failed to load report data.</p>;
  }

  const { kpis, rows, chart_data } = data;

  const kpiRow = (
    <div className="grid grid-cols-4 gap-3">
      <SummaryCard
        label="Total Vendor Spend"
        value={formatCurrency(kpis.total_vendor_spend)}
        icon={<DollarSign className="h-5 w-5" />}
      />
      <SummaryCard
        label="Active Vendors"
        value={kpis.active_vendor_count}
        icon={<Truck className="h-5 w-5" />}
      />
      <SummaryCard
        label="Purchase Orders"
        value={kpis.total_po_count}
        icon={<FileText className="h-5 w-5" />}
      />
      <SummaryCard
        label="Open Commitments"
        value={formatCurrency(kpis.open_commitments)}
        icon={<Hash className="h-5 w-5" />}
      />
    </div>
  );

  const tableContent = (
    <div className="rounded-lg border border-border bg-card overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="px-3 py-2 text-left font-medium text-muted-foreground w-8" />
            <SortableHeader column="vendor_name" label="Vendor" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} />
            <SortableHeader column="expense_cost_type" label="Expense Cost Type" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} />
            <SortableHeader column="total_ordered" label="Ordered" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} align="right" />
            <SortableHeader column="total_invoiced" label="Invoiced" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} align="right" />
            <SortableHeader column="total_open" label="Open" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} align="right" />
            <SortableHeader column="total_accruals" label="Accruals" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} align="right" />
            <SortableHeader column="project_count" label="# Projects" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} align="right" />
            <SortableHeader column="po_count" label="# POs" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} align="right" />
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((r) => (
            <VendorRow
              key={r.vendor_name}
              row={r}
              isExpanded={expandedVendor === r.vendor_name}
              onToggle={() => toggleVendor(r.vendor_name)}
              drillDown={expandedVendor === r.vendor_name ? drillDown : []}
              drillLoading={expandedVendor === r.vendor_name && drillLoading}
            />
          ))}
          {/* Summary row */}
          <tr className="border-t-2 border-border bg-muted/50 font-semibold">
            <td />
            <td className="px-3 py-2 text-foreground">
              Total ({rows.length} vendors)
            </td>
            <td />
            <td className="px-3 py-2 text-right font-mono text-xs">
              {formatCurrencyDetailed(rows.reduce((s, r) => s + r.total_ordered, 0))}
            </td>
            <td className="px-3 py-2 text-right font-mono text-xs">
              {formatCurrencyDetailed(rows.reduce((s, r) => s + r.total_invoiced, 0))}
            </td>
            <td className="px-3 py-2 text-right font-mono text-xs">
              {formatCurrencyDetailed(rows.reduce((s, r) => s + r.total_open, 0))}
            </td>
            <td className="px-3 py-2 text-right font-mono text-xs">
              {formatCurrencyDetailed(rows.reduce((s, r) => s + r.total_accruals, 0))}
            </td>
            <td />
            <td className="px-3 py-2 text-right font-mono text-xs">
              {rows.reduce((s, r) => s + r.po_count, 0)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  const handleSaveView = (name: string) => {
    reportsApi.createSavedView({
      report_id: 'vendor-spend',
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
      title="Vendor Spend Analysis"
      reportId="vendor-spend"
      filters={filterConfigs}
      filterValues={filters}
      onFilterChange={handleFilterChange}
      onFilterClear={() => setFilters({ vendor: '', status: '', fiscal_year: '2026', expense_cost_type: '' })}
      kpis={kpiRow}
      view={view}
      onViewChange={setView}
      chartContent={<VendorSpendCharts bar={chart_data.bar} />}
      tableContent={tableContent}
      onSaveView={handleSaveView}
    />
  );
}

function VendorRow({
  row,
  isExpanded,
  onToggle,
  drillDown,
  drillLoading,
}: {
  row: VendorSpendResponse['rows'][number];
  isExpanded: boolean;
  onToggle: () => void;
  drillDown: VendorDrillDownRow[];
  drillLoading: boolean;
}) {
  return (
    <>
      <tr
        className="border-t border-border hover:bg-accent cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-3 py-2 text-muted-foreground">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </td>
        <td className="px-3 py-2 text-foreground font-medium">{row.vendor_name}</td>
        <td className="px-3 py-2 text-muted-foreground text-xs">{(row as Record<string, unknown>).expense_cost_type as string || '\u2014'}</td>
        <td className="px-3 py-2 text-right font-mono text-xs">
          {formatCurrencyDetailed(row.total_ordered)}
        </td>
        <td className="px-3 py-2 text-right font-mono text-xs">
          {formatCurrencyDetailed(row.total_invoiced)}
        </td>
        <td className="px-3 py-2 text-right font-mono text-xs">
          {formatCurrencyDetailed(row.total_open)}
        </td>
        <td className="px-3 py-2 text-right font-mono text-xs">
          {formatCurrencyDetailed(row.total_accruals)}
        </td>
        <td className="px-3 py-2 text-right text-xs">{row.project_count}</td>
        <td className="px-3 py-2 text-right text-xs">{row.po_count}</td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={9} className="bg-primary/5 px-6 py-3">
            {drillLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : drillDown.length === 0 ? (
              <p className="text-xs text-muted-foreground">No detail records.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="py-1 text-left font-medium text-muted-foreground">Project</th>
                    <th className="py-1 text-left font-medium text-muted-foreground">Month</th>
                    <th className="py-1 text-left font-medium text-muted-foreground">Cost Type</th>
                    <th className="py-1 text-right font-medium text-muted-foreground">Amount</th>
                    <th className="py-1 text-center font-medium text-muted-foreground">Status</th>
                    <th className="py-1 text-left font-medium text-muted-foreground">PO #</th>
                  </tr>
                </thead>
                <tbody>
                  {drillDown.map((d, i) => (
                    <tr key={i} className="border-t border-border/30">
                      <td className="py-1 text-muted-foreground">{d.project_name}</td>
                      <td className="py-1 text-muted-foreground">{d.month}</td>
                      <td className="py-1 text-muted-foreground">{d.cost_type}</td>
                      <td className="py-1 text-right font-mono">
                        {formatCurrencyDetailed(d.amount)}
                      </td>
                      <td className="py-1 text-center">
                        {d.status ? <ExternalCostStatusBadge status={d.status} /> : '—'}
                      </td>
                      <td className="py-1 text-muted-foreground">{d.po_number || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
