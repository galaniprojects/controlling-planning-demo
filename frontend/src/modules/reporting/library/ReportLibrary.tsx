import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Building2, Truck, Target, CalendarRange, Sparkles, LayoutGrid, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ReportCard } from './ReportCard';
import { SavedViewCard } from './SavedViewCard';
import { reportsApi, reportBuilderApi } from '@/api/endpoints';
import type { SavedViewItem } from '@/types/api';
import type { SavedReportSummary, SharedReportSummary } from '@/types/reportBuilder';

const REPORTS = [
  {
    id: 'programme-rollup',
    name: 'Programme / Multi-Project Rollup',
    description: 'Consolidated financial overview across all projects with baseline vs. forecast vs. actuals comparison.',
    icon: <BarChart3 className="h-6 w-6" />,
  },
  {
    id: 'cc-financial-summary',
    name: 'Cost Center Financial Summary',
    description: 'Per-cost-center analysis of internal and external costs across projects.',
    icon: <Building2 className="h-6 w-6" />,
  },
  {
    id: 'vendor-spend',
    name: 'Vendor Spend Analysis',
    description: 'External vendor spending with procurement status tracking and drill-down.',
    icon: <Truck className="h-6 w-6" />,
  },
  {
    id: 'forecast-accuracy',
    name: 'Forecast Accuracy',
    description: 'Retrospective analysis comparing historical forecasts against actual spend.',
    icon: <Target className="h-6 w-6" />,
  },
  {
    id: 'year-over-year',
    name: 'Year-over-Year Comparison',
    description: 'Spending trajectory analysis comparing current and previous fiscal years.',
    icon: <CalendarRange className="h-6 w-6" />,
  },
  {
    id: 'ai-builder',
    name: 'AI Report Builder',
    description: 'Describe the report you need in natural language and let AI generate tables, charts, and KPIs.',
    icon: <Sparkles className="h-6 w-6" />,
    accent: true,
  },
];

export function ReportLibrary() {
  const navigate = useNavigate();
  const [savedViews, setSavedViews] = useState<SavedViewItem[]>([]);
  const [customReports, setCustomReports] = useState<SavedReportSummary[]>([]);
  const [sharedReports, setSharedReports] = useState<SharedReportSummary[]>([]);

  useEffect(() => {
    reportsApi.getSavedViews().then((r) => setSavedViews(r.items)).catch(() => {});
    reportBuilderApi.listSaved().then((r) => setCustomReports(r.items)).catch(() => {});
    reportBuilderApi.listShared().then((r) => setSharedReports(r.items)).catch(() => {});
  }, []);

  const handleRename = async (id: number, name: string) => {
    try {
      await reportsApi.updateSavedView(id, { name });
      setSavedViews((views) =>
        views.map((v) => (v.id === id ? { ...v, name, modified_at: new Date().toISOString() } : v)),
      );
    } catch {
      // silent fail for demo
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await reportsApi.deleteSavedView(id);
      setSavedViews((views) => views.filter((v) => v.id !== id));
    } catch {
      // silent fail for demo
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Standard Reports</h2>
        <div className="grid grid-cols-3 gap-4">
          {REPORTS.map((r) => (
            <ReportCard
              key={r.id}
              id={r.id}
              name={r.name}
              description={r.description}
              icon={r.icon}
              accent={'accent' in r && !!r.accent}
            />
          ))}
        </div>
      </div>

      <div className="border-t border-border pt-6">
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Build Your Own</h2>
        <div
          onClick={() => navigate('/reporting/builder')}
          className="cursor-pointer rounded-lg border border-border bg-card p-5 shadow-sm hover:shadow-md transition-shadow border-l-4 border-l-primary"
        >
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-primary/10 p-2 text-primary">
              <LayoutGrid className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Report Builder</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Build custom reports by selecting dimensions and measures. Drag them into rows, columns, filters, and values to create cross-tabulated views.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Shared Reports */}
      {sharedReports.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Shared Reports</h2>
          <div className="grid grid-cols-3 gap-4">
            {sharedReports.map((r) => (
              <div
                key={`shared-${r.id}`}
                onClick={() => navigate(`/reporting/builder?reportId=${r.id}`)}
                className="cursor-pointer rounded-lg border border-border bg-card p-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-md bg-accent p-2 text-muted-foreground">
                    <Users className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground text-sm truncate">{r.name}</h3>
                      {r.permission && (
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {r.permission === 'can_edit' ? 'Can edit' : 'View only'}
                        </Badge>
                      )}
                    </div>
                    {r.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.description}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground mt-1">by {r.created_by}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">My Saved Views</h2>
        {savedViews.length > 0 || customReports.length > 0 ? (
          <div className="grid grid-cols-3 gap-4">
            {/* Custom Report Builder reports */}
            {customReports.map((r) => (
              <div
                key={`custom-${r.id}`}
                onClick={() => navigate(`/reporting/builder?reportId=${r.id}`)}
                className="cursor-pointer rounded-lg border border-border bg-card p-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-md bg-primary/10 p-2 text-primary">
                    <LayoutGrid className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground text-sm truncate">{r.name}</h3>
                      <Badge variant="secondary" className="text-[10px] shrink-0">Custom</Badge>
                    </div>
                    {r.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.description}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {/* Standard report saved views */}
            {savedViews.map((v) => (
              <SavedViewCard
                key={v.id}
                view={v}
                onRename={handleRename}
                onDelete={handleDelete}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-muted/50 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No saved views yet. Open a report and click "Save View" to save your filter configuration.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
