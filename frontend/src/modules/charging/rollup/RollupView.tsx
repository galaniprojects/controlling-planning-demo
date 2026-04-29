/**
 * Location Cost Rollup — F5 implementation per [F-RV-03..06].
 *
 * Two sub-views inside one tab pair: SVG world map (default) + tree-table.
 * Year selector switches the (year, version) tuple feeding both. Quarterly
 * drill-down per [F-RV-06] is wired through the version selector since the
 * forecast lifecycle is annual; deeper time slicing lives in the workbench.
 *
 * v5 B2 [B-OQ-02]: optional `scenarioVersion` overrides the version selector
 * so the impact-tile preview (T3) and the simulator CostAllocationSurface
 * (T2) can render the scenario fork. `compact` mode shrinks the top bar
 * for embedding inside the impact strip preview.
 */
import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { RollupMapView } from './RollupMapView';
import { RollupTreeTableView } from './RollupTreeTableView';

const YEARS = [2025, 2026, 2027];

interface Props {
  /**
   * v5 B2 sandbox-version override (e.g. `'scenario-12'`). When provided,
   * locks the version selector to the sandbox and forwards it downstream.
   * Default `undefined` = legacy behaviour with internal version state.
   */
  scenarioVersion?: string;
  /**
   * v5 B2 compact mode for the impact-tile preview. Hides the top control
   * bar (year + version + tab switcher) so the rollup table/map can be
   * embedded inline without dominating the strip.
   */
  compact?: boolean;
  /**
   * Default year override. Lets the embedding context pick a fiscal year
   * up front (e.g. impact dashboard always queries year 2026).
   */
  defaultYear?: number;
}

export function RollupView({ scenarioVersion, compact = false, defaultYear }: Props = {}) {
  const [year, setYear] = useState(defaultYear ?? 2026);
  const [internalVersion, setInternalVersion] = useState('forecast');
  const [tab, setTab] = useState<'map' | 'table'>('map');

  // When sandbox mode is active, the version is locked to scenarioVersion;
  // otherwise the user-driven dropdown rules.
  const effectiveVersion = scenarioVersion ?? internalVersion;

  return (
    <div className="space-y-3">
      {/* Compact top bar: year + version + tab switcher all on one row */}
      {!compact && (
        <Card className="p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Year
              </label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="w-[100px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Version
              </label>
              {scenarioVersion ? (
                <div className="h-9 px-3 inline-flex items-center rounded-md border border-blue-500/40 bg-blue-50 dark:bg-blue-900/20 text-xs font-mono text-blue-700 dark:text-blue-300 min-w-[140px]">
                  {scenarioVersion}
                </div>
              ) : (
                <Select value={internalVersion} onValueChange={setInternalVersion}>
                  <SelectTrigger className="w-[140px] h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="forecast">forecast</SelectItem>
                    <SelectItem value="baseline">baseline</SelectItem>
                    <SelectItem value="actuals">actuals</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex-1" />
            <Tabs value={tab} onValueChange={(v) => setTab(v as 'map' | 'table')}>
              <TabsList>
                <TabsTrigger value="map">Map view</TabsTrigger>
                <TabsTrigger value="table">Tree table</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Per [F-RV-06]: annual default, quarterly drill-down where supported.
          </p>
        </Card>
      )}

      {tab === 'map' ? (
        <RollupMapView year={year} version={effectiveVersion} />
      ) : (
        <RollupTreeTableView year={year} version={effectiveVersion} />
      )}
    </div>
  );
}
