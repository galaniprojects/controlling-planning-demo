/**
 * DefineShell — common layout chrome for `/define/new` and
 * `/define/:projectId`. Owns:
 *   - The module header + breadcrumb back to Backlog.
 *   - The "Open in Workbench" action (visible only at DoI ≥ 3).
 *   - The sticky DoI overlay banner.
 *   - The 4-tab strip (Identity / Tech Navigator / Financials /
 *     Approval & Milestones) with per-tab dirty pips.
 *
 * Children render the active tab body. Tabs-builder owns the TN +
 * Financials tab content; sweep-builder ports the autosave-free
 * progress-tracker-exempt sweep. Shell-builder ships Identity here
 * and slots for the other three.
 */

import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ModuleHeader } from '@/components/shared/ModuleHeader';
import { ModuleGuideButton } from '@/components/shared/ModuleGuideButton';
import { DoIBadge } from '@/components/shared/DoIBadge';
import { PipelineTransitionMenu } from '@/components/shared/PipelineTransitionMenu';
import { cn } from '@/lib/utils';
import type { PipelineState } from '@/types/pipeline';
import type { DefineTabId } from '@/modules/backlog/components/detail/DoIRequirementsRegistry';
import { DoIOverlay } from './DoIOverlay';

export type TabDirtyState = Record<DefineTabId, boolean>;

interface Props {
  projectId: string | null;
  projectName: string | null;
  pipeline: PipelineState | null;
  activeTab: DefineTabId;
  onTabChange: (tab: DefineTabId, anchor?: string) => void;
  dirty: TabDirtyState;
  /** Identity tab body. */
  identity: ReactNode;
  /** Tech Navigator tab body (provided by tabs-builder; placeholder until then). */
  techNavigator: ReactNode;
  /** Financials tab body (provided by tabs-builder). */
  financials: ReactNode;
  /** Approval & milestones tab body (provided by sweep-builder). */
  approvalMilestones: ReactNode;
  /** Called after a controller stage transition so the page can refetch. */
  onPipelineChanged?: () => void;
}

const TAB_DEFS: { id: DefineTabId; label: string }[] = [
  { id: 'identity', label: 'Identity' },
  { id: 'tech_navigator', label: 'Tech Navigator' },
  { id: 'financials', label: 'Financials' },
  { id: 'approval_milestones', label: 'Approval & Milestones' },
];

export function DefineShell({
  projectId,
  projectName,
  pipeline,
  activeTab,
  onTabChange,
  dirty,
  identity,
  techNavigator,
  financials,
  approvalMilestones,
  onPipelineChanged,
}: Props) {
  const navigate = useNavigate();
  const currentDoi = pipeline?.gate_status?.current_doi ?? pipeline?.doi ?? null;
  const approved = (currentDoi ?? 0) >= 3;
  const titleText =
    projectName?.trim() ||
    (projectId ? 'Unnamed project' : 'New project');

  function openWorkbench() {
    if (!projectId) return;
    navigate(`/workbench/${projectId}`);
  }

  return (
    <div className="px-6 py-6 space-y-5">
      {/* Breadcrumb */}
      <nav className="text-xs text-muted-foreground" aria-label="Breadcrumb">
        <button
          type="button"
          onClick={() => navigate('/backlog')}
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
        >
          <ChevronLeft className="size-3" aria-hidden />
          Backlog
        </button>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">Define</span>
      </nav>

      <ModuleHeader
        title={
          <span className="inline-flex items-center gap-3">
            <span className="truncate max-w-[60ch]">{titleText}</span>
            {pipeline ? (
              <DoIBadge doi={currentDoi} />
            ) : (
              <Badge variant="outline" className="text-xs">
                {projectId ? '…' : 'New'}
              </Badge>
            )}
          </span>
        }
        subtitle={
          projectId
            ? 'Project home — edit identity, scoring, financials, and approval state at any DoI level.'
            : 'New project — enter a name to create the record. Other fields can be completed iteratively as DoI gates require them.'
        }
        actions={
          <>
            {projectId ? (
              <PipelineTransitionMenu
                projectId={projectId}
                state={pipeline}
                onChanged={() => onPipelineChanged?.()}
              />
            ) : null}
            <Button
              variant={approved ? 'default' : 'outline'}
              size="sm"
              disabled={!approved}
              onClick={openWorkbench}
              title={
                approved
                  ? 'Open in Workbench for operational editing'
                  : 'Available once project is approved (DoI 3+)'
              }
            >
              Open in Workbench
              <ChevronRight className="size-4" aria-hidden />
            </Button>
            <ModuleGuideButton moduleId="backlog" />
          </>
        }
      />

      {/* Sticky overlay — under the header but above the tabs. */}
      <div className="sticky top-0 z-20 -mx-6 px-6 py-2 bg-background/95 backdrop-blur-sm">
        <DoIOverlay
          hasProject={Boolean(projectId)}
          pipeline={pipeline}
          onNavigateToTab={onTabChange}
          onOpenWorkbench={openWorkbench}
        />
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => onTabChange(v as DefineTabId)}
        className="w-full"
      >
        <TabsList variant="line" className="border-b border-border w-full justify-start">
          {TAB_DEFS.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="gap-2">
              <span>{t.label}</span>
              <DirtyPip dirty={dirty[t.id]} />
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="identity" className="pt-5">
          {identity}
        </TabsContent>
        <TabsContent value="tech_navigator" className="pt-5">
          {techNavigator}
        </TabsContent>
        <TabsContent value="financials" className="pt-5">
          {financials}
        </TabsContent>
        <TabsContent value="approval_milestones" className="pt-5">
          {approvalMilestones}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DirtyPip({ dirty }: { dirty: boolean }) {
  return (
    <span
      aria-hidden
      title={dirty ? 'Unsaved changes' : ''}
      className={cn(
        'inline-block size-1.5 rounded-full transition-colors',
        dirty ? 'bg-amber-500 dark:bg-amber-400' : 'bg-transparent',
      )}
    />
  );
}

/** Placeholder rendered until a teammate ships their tab content. */
export function TabPlaceholder({
  title,
  owner,
}: {
  title: string;
  owner: string;
}) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/30 px-6 py-10 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1">
        Coming soon — owned by {owner}. The shell, overlay, and routing are
        live; this tab will land in the same redesign.
      </p>
    </div>
  );
}
