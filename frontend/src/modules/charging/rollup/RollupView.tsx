/**
 * Location Cost Rollup — F5 implementation per [F-RV-03..06].
 *
 * Two sub-views inside one tab pair: SVG world map (default) + tree-table.
 * Year selector switches the (year, version) tuple feeding both. Quarterly
 * drill-down per [F-RV-06] is wired through the version selector since the
 * forecast lifecycle is annual; deeper time slicing lives in the workbench.
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

export function RollupView() {
  const [year, setYear] = useState(2026);
  const [version, setVersion] = useState('forecast');
  const [tab, setTab] = useState<'map' | 'table'>('map');

  return (
    <div className="space-y-3">
      {/* Compact top bar: year + version + tab switcher all on one row */}
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
            <Select value={version} onValueChange={setVersion}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="forecast">forecast</SelectItem>
                <SelectItem value="baseline">baseline</SelectItem>
                <SelectItem value="actuals">actuals</SelectItem>
              </SelectContent>
            </Select>
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

      {tab === 'map' ? (
        <RollupMapView year={year} version={version} />
      ) : (
        <RollupTreeTableView year={year} version={version} />
      )}
    </div>
  );
}
