import { type ReactNode, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Settings2, Bookmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FilterBar, type FilterConfig } from '@/components/shared/FilterBar';
import { ReportConfigurator } from './ReportConfigurator';
import { SaveViewDialog } from './SaveViewDialog';
import { getCurrentUserId } from '@/api/client';
import { reportsApi } from '@/api/endpoints';

export interface ColumnDef {
  key: string;
  label: string;
}

interface ReportViewerProps {
  title: string;
  reportId: string;
  filters: FilterConfig[];
  filterValues: Record<string, string>;
  onFilterChange: (key: string, value: string) => void;
  onFilterClear: () => void;
  kpis: ReactNode;
  view: 'chart' | 'table';
  onViewChange: (v: 'chart' | 'table') => void;
  chartContent: ReactNode;
  tableContent: ReactNode;
  // Configurator support
  availableColumns?: ColumnDef[];
  visibleColumns?: string[];
  onVisibleColumnsChange?: (cols: string[]) => void;
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  onSortChange?: (col: string, dir: 'asc' | 'desc') => void;
  // Saved views
  onSaveView?: (name: string) => void;
}

export function ReportViewer({
  title,
  reportId,
  filters,
  filterValues,
  onFilterChange,
  onFilterClear,
  kpis,
  view,
  onViewChange,
  chartContent,
  tableContent,
  availableColumns,
  visibleColumns,
  onVisibleColumnsChange,
  sortColumn,
  sortDirection,
  onSortChange,
  onSaveView,
}: ReportViewerProps) {
  const navigate = useNavigate();
  const [configuratorOpen, setConfiguratorOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const hasConfigurator = availableColumns && visibleColumns && onVisibleColumnsChange;

  const handleExport = async () => {
    setExporting(true);
    try {
      const baseUrl = reportsApi.exportReport(reportId);
      const params = new URLSearchParams();
      Object.entries(filterValues).forEach(([k, v]) => {
        if (v) params.set(k, v);
      });
      const qs = params.toString();
      const url = `${baseUrl}${qs ? '?' + qs : ''}`;

      const response = await fetch(url, {
        headers: { 'X-Current-User': getCurrentUserId() },
      });
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const disposition = response.headers.get('Content-Disposition');
      const match = disposition?.match(/filename="(.+)"/);
      a.download = match?.[1] ?? `CRETA_Export.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      // silent fail for demo
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Back link + title */}
      <button
        onClick={() => navigate('/reporting')}
        className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Reports
      </button>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!hasConfigurator}
            onClick={() => setConfiguratorOpen(true)}
          >
            <Settings2 className="h-3.5 w-3.5 mr-1.5" />
            Customize
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!onSaveView}
            onClick={() => setSaveDialogOpen(true)}
          >
            <Bookmark className="h-3.5 w-3.5 mr-1.5" />
            Save View
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            {exporting ? 'Exporting...' : 'Export'}
          </Button>
        </div>
      </div>

      {/* Filters */}
      {filters.length > 0 && (
        <FilterBar
          filters={filters}
          values={filterValues}
          onChange={onFilterChange}
          onClear={onFilterClear}
        />
      )}

      {/* KPI row */}
      {kpis}

      {/* Chart / Table toggle */}
      <Tabs value={view} onValueChange={(v) => onViewChange(v as 'chart' | 'table')}>
        <TabsList>
          <TabsTrigger value="chart">Chart</TabsTrigger>
          <TabsTrigger value="table">Table</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Content */}
      {view === 'chart' ? chartContent : tableContent}

      {/* Configurator drawer */}
      {hasConfigurator && (
        <ReportConfigurator
          open={configuratorOpen}
          onOpenChange={setConfiguratorOpen}
          availableColumns={availableColumns}
          visibleColumns={visibleColumns}
          onVisibleColumnsChange={onVisibleColumnsChange}
          sortColumn={sortColumn ?? ''}
          sortDirection={sortDirection ?? 'asc'}
          onSortChange={onSortChange}
        />
      )}

      {/* Save view dialog */}
      {onSaveView && (
        <SaveViewDialog
          open={saveDialogOpen}
          onOpenChange={setSaveDialogOpen}
          onSave={onSaveView}
        />
      )}
    </div>
  );
}
