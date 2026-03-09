import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FilterBar, type FilterConfig } from '@/components/shared/FilterBar';

interface ReportViewerProps {
  title: string;
  filters: FilterConfig[];
  filterValues: Record<string, string>;
  onFilterChange: (key: string, value: string) => void;
  onFilterClear: () => void;
  kpis: ReactNode;
  view: 'chart' | 'table';
  onViewChange: (v: 'chart' | 'table') => void;
  chartContent: ReactNode;
  tableContent: ReactNode;
}

export function ReportViewer({
  title,
  filters,
  filterValues,
  onFilterChange,
  onFilterClear,
  kpis,
  view,
  onViewChange,
  chartContent,
  tableContent,
}: ReportViewerProps) {
  const navigate = useNavigate();

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
          <Button variant="outline" size="sm" disabled>
            Customize
          </Button>
          <Button variant="outline" size="sm" disabled>
            Save View
          </Button>
          <Button variant="outline" size="sm" disabled>
            Export
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
    </div>
  );
}
