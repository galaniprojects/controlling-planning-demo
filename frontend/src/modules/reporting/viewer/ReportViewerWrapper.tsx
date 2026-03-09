import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock } from 'lucide-react';
import { ProgrammeRollupReport } from '../reports/ProgrammeRollupReport';
import { CCFinancialReport } from '../reports/CCFinancialReport';
import { VendorSpendReport } from '../reports/VendorSpendReport';

const REPORT_TITLES: Record<string, string> = {
  'programme-rollup': 'Programme / Multi-Project Rollup',
  'cc-financial-summary': 'Cost Center Financial Summary',
  'vendor-spend': 'Vendor Spend Analysis',
  'forecast-accuracy': 'Forecast Accuracy',
  'year-over-year': 'Year-over-Year Comparison',
};

export function ReportViewerWrapper() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();

  if (!reportId || !REPORT_TITLES[reportId]) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate('/reporting')}
          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Reports
        </button>
        <p className="text-sm text-slate-400">Report not found.</p>
      </div>
    );
  }

  // Placeholder for reports coming in Session 5B
  if (reportId === 'forecast-accuracy' || reportId === 'year-over-year') {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate('/reporting')}
          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Reports
        </button>
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
          <Clock className="h-8 w-8 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-slate-600">
            {REPORT_TITLES[reportId]}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            This report is coming soon.
          </p>
        </div>
      </div>
    );
  }

  switch (reportId) {
    case 'programme-rollup':
      return <ProgrammeRollupReport />;
    case 'cc-financial-summary':
      return <CCFinancialReport />;
    case 'vendor-spend':
      return <VendorSpendReport />;
    default:
      return null;
  }
}
