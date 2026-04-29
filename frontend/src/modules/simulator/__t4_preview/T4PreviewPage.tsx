/**
 * v5 B2 T4 — Visual-verification harness (TEMPORARY).
 *
 * Mounts the catalogue + promote surfaces in isolation against a
 * fake `ScenarioContext` value. Used to take light/dark screenshots
 * before T1's full workspace shell ships, when the natural mounting
 * path for these surfaces does not yet exist.
 *
 * Removed before merge — the lead's smoke walk runs against the fully
 * integrated workspace.
 */

import { useState } from 'react';
import { ScenarioCtx, type ScenarioContextValue, type ChangeSummaryEntry } from '../ScenarioContext';
import type {
  ImpactDashboardResponse,
  PromotePreviewResponse,
  PromoteExecuteResponse,
  ApplyToForecastResponse,
  CostAllocationImpactResponse,
} from '../api/scenariosApi';
import type { ScenarioDetail } from '@/types/api';
import { BulkActionsPanel } from '../catalogue/BulkActionsPanel';
import { PromoteReviewPage } from '../promote/PromoteReviewPage';
import { PromoteAuditDrawer } from '../promote/PromoteAuditDrawer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ResourcesSection } from '../workspace/sidebar/ResourcesSection';
import { PeopleMasterSurface } from '../surfaces/PeopleMasterSurface';
import { CapacityParametersSurface } from '../surfaces/CapacityParametersSurface';
import { useTheme } from '@/contexts/ThemeContext';

const FAKE_DETAIL: ScenarioDetail = {
  metadata: {
    id: 999,
    name: 'Demo scenario (T4 preview)',
    description: '15% across-the-board cut + accelerate ERP migration',
    status: 'private',
    author_name: 'Anna Meier',
  },
  actions: [
    {
      id: 1001,
      action_order: 1,
      scope: 'portfolio',
      action_type: 'across_the_board_cut',
      project_id: null,
      parameters: { percentage: 15 },
      impact_delta: { budget_delta: -480000 },
      group_label: null,
    },
    {
      id: 1002,
      action_order: 2,
      scope: 'project',
      action_type: 'accelerate_project',
      project_id: 'PRJ-001',
      parameters: { months: 3 },
      impact_delta: { budget_delta: 12500 },
      group_label: null,
    },
    {
      id: 1003,
      action_order: 3,
      scope: 'project',
      action_type: 'change_external_rate',
      project_id: 'PRJ-014',
      parameters: { role_type_id: 'ROLE-DEV', new_rate: 130 },
      impact_delta: { budget_delta: 14000 },
      group_label: null,
    },
  ],
  impact_dashboard: {
    total_budget_original: 12000000,
    total_budget_adjusted: 11546500,
    total_budget_delta: -453500,
    rag_distribution: { green: 5, amber: 7, red: 2 },
    headline: '',
    time_frame_breakdown: [],
  },
  project_states: [
    {
      project_id: 'PRJ-001',
      project_name: 'ERP Migration',
      original_budget: 1450000,
      adjusted_budget: 1465000,
      budget_delta: 15000,
      original_rag: 'green',
      adjusted_rag: 'green',
      is_affected: true,
    },
    {
      project_id: 'PRJ-014',
      project_name: 'Cloud Foundation',
      original_budget: 920000,
      adjusted_budget: 934000,
      budget_delta: 14000,
      original_rag: 'amber',
      adjusted_rag: 'amber',
      is_affected: true,
    },
  ],
  capacity_impacts: [],
};

const FAKE_PREVIEW: PromotePreviewResponse = {
  scenario_id: 999,
  anchor_forecast_version_id: 12,
  decisions: [
    {
      action_id: 1001,
      action_type: 'across_the_board_cut',
      lever_category: 'forecast_grid',
      routing_type: 'direct_forecast_update',
      target_id: null,
      requires_review: false,
      message: 'Across-the-board cut applied as direct forecast update on owned projects.',
    },
    {
      action_id: 1002,
      action_type: 'accelerate_project',
      lever_category: 'forecast_grid',
      routing_type: 'change_request',
      target_id: 'PRJ-001',
      requires_review: true,
      message: 'Other-PL forecast change — generates a CR for PL acknowledgment.',
    },
    {
      action_id: 1003,
      action_type: 'change_external_rate',
      lever_category: 'rate_table',
      routing_type: 'rate_table_update',
      target_id: null,
      requires_review: true,
      message: 'Rate table update routed via admin path with effective date.',
    },
  ],
};

function makeFakeContext(scenarioId: number): ScenarioContextValue {
  const noopAsync = async () => {
    /* no-op */
  };
  const summaryEntries: ChangeSummaryEntry[] = [];
  return {
    scenarioId,
    scenarioVersion: `scenario-${scenarioId}`,
    detail: FAKE_DETAIL,
    impact: null,
    loading: false,
    error: null,
    stale: true,
    changeSummaryEntries: summaryEntries,
    anchorVersionId: 12,
    isOwner: true,
    canPromote: true,
    canApplyToForecast: false,
    tier3Visible: true,
    ccOwnerScopeCcId: null,
    visibility: 'private',
    archived: false,
    reload: noopAsync,
    updateMetadata: noopAsync,
    publish: noopAsync,
    unpublish: noopAsync,
    archive: noopAsync,
    rebase: noopAsync,
    applyAction: async () => FAKE_DETAIL,
    removeAction: noopAsync,
    reorderActions: noopAsync,
    createDistribution: async () => ({}),
    updateDistribution: async () => ({}),
    deleteDistribution: async () => ({}),
    setToBusiness: async () => ({}),
    setBtcLines: async () => ({}),
    costAllocationImpact: async () => ({} as CostAllocationImpactResponse),
    recalculate: async () => ({} as ImpactDashboardResponse),
    promotePreview: async () => FAKE_PREVIEW,
    promoteExecute: async (): Promise<PromoteExecuteResponse> => ({
      scenario_id: scenarioId,
      promotion_id: 99,
      promoted_at: new Date().toISOString(),
      promoted_count: 2,
      skipped_count: 0,
      summary: [
        {
          action_id: 1001,
          routing_type: 'direct_forecast_update',
          status: 'promoted',
          message: 'Direct forecast update applied (demo stub).',
        },
        {
          action_id: 1002,
          routing_type: 'change_request',
          status: 'promoted',
          message: 'CR generated for PRJ-001.',
        },
      ],
    }),
    applyToForecast: async () =>
      ({ scenario_id: scenarioId } as unknown as ApplyToForecastResponse),
    appendChange: () => undefined,
  };
}

interface Props {
  /** Force a Tier-3 mode for capturing PL (no Tier 3) screenshots. */
  hideTier3?: boolean;
}

export function T4PreviewPage({ hideTier3 = false }: Props) {
  const ctxValue = makeFakeContext(999);
  if (hideTier3) ctxValue.tier3Visible = false;

  const [tab, setTab] = useState<
    'catalogue' | 'promote' | 'tier3-resources' | 'tier3-people' | 'tier3-capacity'
  >('catalogue');
  const [auditOpen, setAuditOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  return (
    <ScenarioCtx.Provider value={ctxValue}>
      <div className="mx-auto w-full max-w-7xl space-y-4 p-6">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              T4 visual-verification harness
            </h1>
            <p className="text-sm text-muted-foreground">
              Catalogue / Promote / Tier-3 surfaces against a fake ScenarioContext.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="outline">
              Tier 3 visible: {ctxValue.tier3Visible ? 'yes' : 'no'}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setTheme(theme === 'dark' ? 'light' : 'dark')
              }
            >
              Toggle theme ({theme})
            </Button>
          </div>
        </header>

        <nav className="flex flex-wrap gap-2">
          {[
            ['catalogue', 'Bulk actions'],
            ['promote', 'Promote review'],
            ['tier3-resources', 'Sidebar Resources'],
            ['tier3-people', 'PeopleMasterSurface'],
            ['tier3-capacity', 'CapacityParametersSurface'],
          ].map(([id, label]) => (
            <Button
              key={id}
              size="sm"
              variant={tab === id ? 'default' : 'outline'}
              onClick={() => setTab(id as typeof tab)}
            >
              {label}
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setAuditOpen(true)}
          >
            Open audit drawer
          </Button>
        </nav>

        {tab === 'catalogue' && (
          <Card>
            <CardHeader>
              <CardTitle>BulkActionsPanel</CardTitle>
            </CardHeader>
            <CardContent>
              <BulkActionsPanel />
            </CardContent>
          </Card>
        )}

        {tab === 'promote' && <PromoteReviewPage />}

        {tab === 'tier3-resources' && (
          <Card>
            <CardHeader>
              <CardTitle>Sidebar — Resources section</CardTitle>
            </CardHeader>
            <CardContent>
              <ResourcesSection
                onSelectSurface={(t) => {
                  if (t.kind === 'surface') {
                    setTab(t.surfaceKey === 'people_master' ? 'tier3-people' : 'tier3-capacity');
                  }
                }}
              />
            </CardContent>
          </Card>
        )}

        {tab === 'tier3-people' && <PeopleMasterSurface />}
        {tab === 'tier3-capacity' && <CapacityParametersSurface />}

        <PromoteAuditDrawer
          scenarioId={999}
          open={auditOpen}
          onOpenChange={setAuditOpen}
        />
      </div>
    </ScenarioCtx.Provider>
  );
}
