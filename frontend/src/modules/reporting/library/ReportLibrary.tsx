import { BarChart3, Building2, Truck, Target, CalendarRange } from 'lucide-react';
import { ReportCard } from './ReportCard';

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
];

export function ReportLibrary() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-medium text-slate-600 mb-3">Standard Reports</h2>
        <div className="grid grid-cols-3 gap-4">
          {REPORTS.map((r) => (
            <ReportCard
              key={r.id}
              id={r.id}
              name={r.name}
              description={r.description}
              icon={r.icon}
            />
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium text-slate-600 mb-3">My Saved Views</h2>
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <p className="text-sm text-slate-400">
            No saved views yet. Open a report and click "Save View" to save your filter configuration.
          </p>
        </div>
      </div>
    </div>
  );
}
