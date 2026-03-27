import { useEffect, useState } from 'react';
import { BarChart3, Building2, Truck, Target, CalendarRange, Sparkles } from 'lucide-react';
import { ReportCard } from './ReportCard';
import { SavedViewCard } from './SavedViewCard';
import { reportsApi } from '@/api/endpoints';
import type { SavedViewItem } from '@/types/api';

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
  const [savedViews, setSavedViews] = useState<SavedViewItem[]>([]);

  useEffect(() => {
    reportsApi.getSavedViews().then((r) => setSavedViews(r.items)).catch(() => {});
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

      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">My Saved Views</h2>
        {savedViews.length > 0 ? (
          <div className="grid grid-cols-3 gap-4">
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
