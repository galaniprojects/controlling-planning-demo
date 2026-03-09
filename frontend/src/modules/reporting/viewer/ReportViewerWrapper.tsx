import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ProgrammeRollupReport } from '../reports/ProgrammeRollupReport';
import { CCFinancialReport } from '../reports/CCFinancialReport';
import { VendorSpendReport } from '../reports/VendorSpendReport';
import { ForecastAccuracyReport } from '../reports/ForecastAccuracyReport';
import { YoYReport } from '../reports/YoYReport';

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

  switch (reportId) {
    case 'programme-rollup':
      return <ProgrammeRollupReport />;
    case 'cc-financial-summary':
      return <CCFinancialReport />;
    case 'vendor-spend':
      return <VendorSpendReport />;
    case 'forecast-accuracy':
      return <ForecastAccuracyReport />;
    case 'year-over-year':
      return <YoYReport />;
    default:
      return null;
  }
}
