import { useEffect, useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, Truck, Hash, FileText, DollarSign } from 'lucide-react';
import { useRole } from '@/contexts/RoleContext';
import { reportsApi, referenceApi } from '@/api/endpoints';
import { Skeleton } from '@/components/shared/Skeleton';
import { SummaryCard } from '@/modules/capacity/shared/SummaryCard';
import { ReportViewer } from '../viewer/ReportViewer';
import { VendorSpendCharts } from './VendorSpendCharts';
import { formatCurrency, formatCurrencyDetailed } from '@/lib/formatters';
import type { FilterConfig } from '@/components/shared/FilterBar';
import type { VendorSpendResponse, VendorDrillDownRow, LoBRef } from '@/types/api';
import { ExternalCostStatusBadge } from '@/modules/workbench/forecast/ExternalCostStatusBadge';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'planned', label: 'Planned' },
  { value: 'completed', label: 'Completed' },
];

export function VendorSpendReport() {
  const { currentRoleId } = useRole();
  const [data, setData] = useState<VendorSpendResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lobs, setLobs] = useState<LoBRef[]>([]);
  const [view, setView] = useState<'chart' | 'table'>('table');
  const [filters, setFilters] = useState<Record<string, string>>({
    vendor: '',
    lob: '',
    status: '',
  });
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null);
  const [drillDown, setDrillDown] = useState<VendorDrillDownRow[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);

  useEffect(() => {
    referenceApi.getLobs().then((r) => setLobs(r.items)).catch(() => {});
  }, []);

  const fetchData = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (filters.vendor) params.vendor = filters.vendor;
    if (filters.lob) params.lob = filters.lob;
    if (filters.status) params.status = filters.status;

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

  const filterConfigs: FilterConfig[] = [
    { key: 'vendor', label: 'Vendor', options: vendorOptions },
    {
      key: 'lob',
      label: 'Line of Business',
      options: lobs.map((l) => ({ value: l.id, label: l.name })),
    },
    { key: 'status', label: 'Project Status', options: STATUS_OPTIONS },
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
    <div className="rounded-lg border border-slate-200 bg-white overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="px-3 py-2 text-left font-medium text-slate-600 w-8" />
            <th className="px-3 py-2 text-left font-medium text-slate-600">Vendor</th>
            <th className="px-3 py-2 text-right font-medium text-slate-600">Ordered</th>
            <th className="px-3 py-2 text-right font-medium text-slate-600">Invoiced</th>
            <th className="px-3 py-2 text-right font-medium text-slate-600">Open</th>
            <th className="px-3 py-2 text-right font-medium text-slate-600">Accruals</th>
            <th className="px-3 py-2 text-right font-medium text-slate-600"># Projects</th>
            <th className="px-3 py-2 text-right font-medium text-slate-600"># POs</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
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
          <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
            <td />
            <td className="px-3 py-2 text-slate-700">
              Total ({rows.length} vendors)
            </td>
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

  return (
    <ReportViewer
      title="Vendor Spend Analysis"
      filters={filterConfigs}
      filterValues={filters}
      onFilterChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
      onFilterClear={() => setFilters({ vendor: '', lob: '', status: '' })}
      kpis={kpiRow}
      view={view}
      onViewChange={setView}
      chartContent={<VendorSpendCharts bar={chart_data.bar} />}
      tableContent={tableContent}
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
        className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-3 py-2 text-slate-400">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </td>
        <td className="px-3 py-2 text-slate-700 font-medium">{row.vendor_name}</td>
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
          <td colSpan={8} className="bg-blue-50/30 px-6 py-3">
            {drillLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : drillDown.length === 0 ? (
              <p className="text-xs text-slate-400">No detail records.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-blue-100">
                    <th className="py-1 text-left font-medium text-slate-500">Project</th>
                    <th className="py-1 text-left font-medium text-slate-500">Month</th>
                    <th className="py-1 text-left font-medium text-slate-500">Cost Type</th>
                    <th className="py-1 text-right font-medium text-slate-500">Amount</th>
                    <th className="py-1 text-center font-medium text-slate-500">Status</th>
                    <th className="py-1 text-left font-medium text-slate-500">PO #</th>
                  </tr>
                </thead>
                <tbody>
                  {drillDown.map((d, i) => (
                    <tr key={i} className="border-t border-blue-50">
                      <td className="py-1 text-slate-600">{d.project_name}</td>
                      <td className="py-1 text-slate-600">{d.month}</td>
                      <td className="py-1 text-slate-600">{d.cost_type}</td>
                      <td className="py-1 text-right font-mono">
                        {formatCurrencyDetailed(d.amount)}
                      </td>
                      <td className="py-1 text-center">
                        {d.status ? <ExternalCostStatusBadge status={d.status} /> : '—'}
                      </td>
                      <td className="py-1 text-slate-500">{d.po_number || '—'}</td>
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
