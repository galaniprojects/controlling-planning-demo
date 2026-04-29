/**
 * v5 B2 — CostAllocationSurface (Lever 12) per spec §Editable surfaces #12
 * and acceptance criterion 8/9 ("Lever 12 panel exposes Stage 1 + Stage 2
 * mutations" and "Lever 12 panel reuses F4 components").
 *
 * Three sub-tabs:
 *   - Stage 1 (`distribution`)  — embeds `EntityDistributionEditor` with
 *                                 `sandboxScenarioId` + scenario version.
 *   - Stage 2 (`btc`)           — embeds `EntityBTCProfileEditor` with the
 *                                 sandbox `onSandboxSave` wired to
 *                                 `ScenarioContext.setBtcLines`.
 *   - Impact preview            — calls `ScenarioContext.costAllocationImpact`
 *                                 and renders per-charging-location deltas;
 *                                 also embeds `RollupView` in `compact` mode
 *                                 with the scenario version locked.
 */
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/shared/Skeleton';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import { EntityDistributionEditor } from '@/modules/charging/distribution/EntityDistributionEditor';
import { EntityBTCProfileEditor } from '@/modules/charging/btc/EntityBTCProfileEditor';
import { RollupView } from '@/modules/charging/rollup/RollupView';
import { useScenarioContext } from '../useScenarioContext';
import { SurfaceCard } from './SurfaceCard';
import { chargingApi } from '@/api/endpoints';
import type { ChargeableEntityItem } from '@/types/api';
import type { CostAllocationImpactResponse } from '../api/scenariosApi';
import { formatCurrencyCompact } from '@/lib/formatters';

interface Props {
  /** Optional preselected entity id; otherwise the surface offers a picker. */
  entityId?: string;
  year?: number;
}

export function CostAllocationSurface({ entityId: initialEntityId, year = 2026 }: Props) {
  const ctx = useScenarioContext();
  const [entities, setEntities] = useState<ChargeableEntityItem[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string | undefined>(initialEntityId);
  const [tab, setTab] = useState<'distribution' | 'btc' | 'impact'>('distribution');
  const [error, setError] = useState<string | null>(null);

  // Fetch entity list for picker.
  useEffect(() => {
    let cancelled = false;
    chargingApi
      .listEntities({ is_active: true })
      .then((res) => {
        if (cancelled) return;
        setEntities(res.items);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load entities');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleBack = () => setSelectedEntityId(undefined);

  if (!selectedEntityId) {
    return (
      <SurfaceCard
        title="Cost allocation (Lever 12)"
        subtitle="Pick an entity to edit Stage 1 distributions, Stage 2 BTC, and preview impact."
        error={error}
      >
        <Card className="p-3">
          {entities.length === 0 ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <ul className="divide-y divide-border max-h-[420px] overflow-y-auto">
              {entities.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between py-2 gap-3"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{e.name}</p>
                    <p className="text-[11px] font-mono text-muted-foreground">
                      {e.identifier} · {e.entity_type} · {e.is_change_or_run}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedEntityId(e.id)}
                  >
                    Edit in sandbox
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </SurfaceCard>
    );
  }

  return (
    <SurfaceCard
      title="Cost allocation (Lever 12)"
      subtitle={`Entity ${selectedEntityId} · year ${year} · sandbox ${ctx.scenarioVersion}`}
      toolbar={
        <Button variant="ghost" size="sm" onClick={handleBack}>
          <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Pick another entity
        </Button>
      }
      error={error}
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="distribution">Stage 1 distribution</TabsTrigger>
          <TabsTrigger value="btc">Stage 2 BTC</TabsTrigger>
          <TabsTrigger value="impact">Impact preview</TabsTrigger>
        </TabsList>

        <TabsContent value="distribution" className="mt-4">
          <EntityDistributionEditor
            entityId={selectedEntityId}
            year={year}
            version={ctx.scenarioVersion}
            sandboxScenarioId={ctx.scenarioId}
            onBack={handleBack}
          />
        </TabsContent>

        <TabsContent value="btc" className="mt-4">
          <EntityBTCProfileEditor
            entityId={selectedEntityId}
            year={year}
            scenarioVersion={ctx.scenarioVersion}
            onSandboxSave={async (lines) => {
              await ctx.setBtcLines({
                entity_id: selectedEntityId,
                year,
                lines,
              });
            }}
            onBack={handleBack}
          />
        </TabsContent>

        <TabsContent value="impact" className="mt-4">
          <CostAllocationImpactView year={year} />
        </TabsContent>
      </Tabs>
    </SurfaceCard>
  );
}

// ---------------------------------------------------------------------------
// Per-location impact preview
// ---------------------------------------------------------------------------

function CostAllocationImpactView({ year }: { year: number }) {
  const { costAllocationImpact, scenarioVersion, stale } = useScenarioContext();
  const [data, setData] = useState<CostAllocationImpactResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await costAllocationImpact(year);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to compute impact');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  return (
    <div className="space-y-3">
      <Card className="p-3 flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-xs text-muted-foreground">
            Per-charging-location deltas vs anchor for year {year}.
          </p>
          {stale && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
              Sandbox is stale — recalculate may be needed for an up-to-date view.
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </Button>
      </Card>

      {error && (
        <Card className="border-red-500 bg-red-50 dark:bg-red-900/20 p-3">
          <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
        </Card>
      )}

      {loading && !data && <Skeleton className="h-48 w-full" />}

      {data && (
        <Card className="p-3 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Touched entities
              </p>
              <p className="text-lg font-mono tabular-nums">{data.touched_entity_count}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Anchor version
              </p>
              <p className="text-xs font-mono text-muted-foreground">{data.anchor_version}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Sandbox version
              </p>
              <p className="text-xs font-mono text-muted-foreground">{data.scenario_version}</p>
            </div>
          </div>

          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="text-left py-1">Entity</th>
                <th className="text-left py-1">Charging location</th>
                <th className="text-right py-1">Anchor</th>
                <th className="text-right py-1">Sandbox</th>
                <th className="text-right py-1">Delta</th>
              </tr>
            </thead>
            <tbody>
              {data.items.slice(0, 200).map((it) => (
                <tr
                  key={`${it.entity_id}-${it.charging_location_id}`}
                  className="border-t border-border"
                >
                  <td className="py-1">
                    <span className="font-medium">{it.entity_name}</span>
                  </td>
                  <td className="py-1 font-mono text-muted-foreground">
                    {it.charging_location_code}
                  </td>
                  <td className="py-1 text-right font-tabular">
                    {formatCurrencyCompact(it.anchor_amount)}
                  </td>
                  <td className="py-1 text-right font-tabular">
                    {formatCurrencyCompact(it.scenario_amount)}
                  </td>
                  <td
                    className={
                      'py-1 text-right font-tabular font-semibold ' +
                      (it.delta > 0
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : it.delta < 0
                          ? 'text-red-700 dark:text-red-400'
                          : 'text-muted-foreground')
                    }
                  >
                    {it.delta > 0 ? '+' : ''}
                    {formatCurrencyCompact(it.delta)}
                  </td>
                </tr>
              ))}
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-muted-foreground">
                    No per-location deltas yet — apply a Lever 12 edit then refresh.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {data.items.length > 200 && (
            <p className="text-[11px] text-muted-foreground text-right">
              Showing first 200 of {data.items.length} rows.
            </p>
          )}
        </Card>
      )}

      <Card className="p-3">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
          Rollup view (sandbox-locked, compact)
        </p>
        <RollupView
          scenarioVersion={scenarioVersion}
          compact
          defaultYear={year}
        />
      </Card>
    </div>
  );
}
