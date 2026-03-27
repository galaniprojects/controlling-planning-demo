import { Routes, Route, useLocation } from 'react-router-dom';
import { ModuleGuideButton } from '@/components/shared/ModuleGuideButton';
import { ReportLibrary } from './library/ReportLibrary';
import { ReportViewerWrapper } from './viewer/ReportViewerWrapper';

export function Reporting() {
  const location = useLocation();
  const isAIBuilder = location.pathname.endsWith('/ai-builder');

  return (
    <div className="px-6 py-6 space-y-4">
      {!isAIBuilder && (
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-900">Reporting</h1>
          <ModuleGuideButton moduleId="reporting" />
        </div>
      )}
      <Routes>
        <Route index element={<ReportLibrary />} />
        <Route path=":reportId" element={<ReportViewerWrapper />} />
      </Routes>
    </div>
  );
}
