import { Routes, Route, useLocation } from 'react-router-dom';
import { ModuleGuideButton } from '@/components/shared/ModuleGuideButton';
import { ModuleHeader } from '@/components/shared/ModuleHeader';
import { ReportLibrary } from './library/ReportLibrary';
import { ReportViewerWrapper } from './viewer/ReportViewerWrapper';
import { ReportBuilder } from './builder/ReportBuilder';

export function Reporting() {
  const location = useLocation();
  const isAIBuilder = location.pathname.endsWith('/ai-builder');
  const isReportBuilder = location.pathname.endsWith('/builder');

  return (
    <div className="px-6 py-6 space-y-4">
      {!isAIBuilder && !isReportBuilder && (
        <ModuleHeader
          title="Reporting"
          actions={<ModuleGuideButton moduleId="reporting" />}
        />
      )}
      <Routes>
        <Route index element={<ReportLibrary />} />
        <Route path="builder" element={<ReportBuilder />} />
        <Route path=":reportId" element={<ReportViewerWrapper />} />
      </Routes>
    </div>
  );
}
