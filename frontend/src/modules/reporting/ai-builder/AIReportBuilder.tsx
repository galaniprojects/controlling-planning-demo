import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, Settings } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/shared/Skeleton';
import { ModuleGuideButton } from '@/components/shared/ModuleGuideButton';
import { aiReportBuilderApi } from '@/api/endpoints';
import { ChatPanel } from './ChatPanel';
import { ReportPreview } from './ReportPreview';
import { useAIReportChat } from './useAIReportChat';
import type { AIBuilderStatus } from '@/types/api';

export function AIReportBuilder() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<AIBuilderStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const chat = useAIReportChat();

  useEffect(() => {
    aiReportBuilderApi
      .getStatus()
      .then(setStatus)
      .catch(() => setStatus({ available: false, message: 'Failed to check AI builder status.' }))
      .finally(() => setStatusLoading(false));
  }, []);

  if (statusLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!status?.available) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate('/reporting')}
          className="flex items-center gap-1.5 text-sm text-primary/80 hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Reports
        </button>
        <SetupRequiredCard message={status?.message} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/reporting')}
            className="flex items-center gap-1.5 text-sm text-primary/80 hover:text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4.5 w-4.5 text-indigo-600 dark:text-indigo-400" />
            <h1 className="text-base font-semibold text-foreground">
              AI Report Builder
            </h1>
            <Badge className="bg-indigo-100 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400 text-[10px] px-1.5 py-0">
              AI-powered
            </Badge>
          </div>
        </div>
        <ModuleGuideButton moduleId="ai_report_builder" />
      </div>

      {/* Main content: two-panel layout */}
      <div
        className="flex gap-4"
        style={{ height: 'calc(100vh - 160px)' }}
      >
        {/* Chat panel */}
        <Card className="w-[380px] shrink-0 flex flex-col overflow-hidden">
          <ChatPanel
            messages={chat.messages}
            isLoading={chat.isLoading}
            onSendMessage={chat.sendMessage}
            onReset={chat.reset}
          />
        </Card>

        {/* Report preview */}
        <div className="flex-1 overflow-y-auto">
          {chat.reportSpec ? (
            <ReportPreview report={chat.reportSpec} />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
                  <Sparkles className="h-7 w-7 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Your report will appear here
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Describe what you need in the chat panel
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SetupRequiredCard({ message }: { message?: string | null }) {
  const navigate = useNavigate();

  return (
    <Card className="max-w-lg mx-auto mt-12 p-8 text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-50 dark:bg-amber-900/30 mb-4">
        <Settings className="h-7 w-7 text-amber-600 dark:text-amber-400" />
      </div>
      <h2 className="text-base font-semibold text-foreground mb-2">
        Setup Required
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        {message || 'The AI Report Builder requires an Anthropic API key to function.'}
      </p>
      <p className="text-xs text-muted-foreground mb-6">
        Go to Administration and set your API key in Planning Parameters under the Integrations section.
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={() => navigate('/admin?section=parameters')}
      >
        <Settings className="h-3.5 w-3.5 mr-1.5" />
        Go to Administration
      </Button>
    </Card>
  );
}
