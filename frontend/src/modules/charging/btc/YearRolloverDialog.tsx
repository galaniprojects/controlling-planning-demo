/**
 * Year-rollover dialog per Item 6 of docs/followups/demo-polish-followups.md.
 *
 * Surfaces the existing POST /api/admin/btc-profiles/year-rollover endpoint
 * with three scope choices:
 *  - All profiles in the source year.
 *  - By entity type — multi-select Project / Offering / InternalService.
 *  - Specific entities — multi-select of chargeable entities (filtered to
 *    those that have a profile in the source year).
 *
 * Source year defaults to the most-recent year that has ≥1 profile; target
 * year defaults to source+1. Mirrors CreateBTCProfileDialog's Tabs / Dialog
 * primitives and dark-mode styling per CLAUDE.md.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { chargingApi } from '@/api/endpoints';
import type {
  BTCProfileItem,
  BTCRolloverEntityType,
  BTCYearRolloverResult,
  ChargeableEntityItem,
  ChargeableEntityType,
} from '@/types/api';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Profiles known to the parent list view. Used to derive eligible source
   *  years and the per-entity multi-select options for "Specific entities". */
  existingProfiles: BTCProfileItem[];
  entities: ChargeableEntityItem[];
  /** Called when the rollover succeeds; parent typically refreshes its list. */
  onCompleted: (result: BTCYearRolloverResult) => void;
}

type ScopeTab = 'all' | 'types' | 'entities';

// Map the API's lowercase form ↔ the Chargeable entity_type TitleCase form.
const TYPE_OPTIONS: Array<{
  value: BTCRolloverEntityType;
  label: string;
  matches: ChargeableEntityType;
}> = [
  { value: 'project', label: 'Projects', matches: 'Project' },
  { value: 'offering', label: 'Offerings', matches: 'Offering' },
  { value: 'internal_service', label: 'Internal Services', matches: 'InternalService' },
];

export function YearRolloverDialog({
  open,
  onClose,
  existingProfiles,
  entities,
  onCompleted,
}: Props) {
  const eligibleSourceYears = useMemo(() => {
    const years = new Set<number>();
    existingProfiles.forEach((p) => {
      // Only active profiles are rolled by the backend; mirror that here.
      if (p.status === 'active') years.add(p.year);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [existingProfiles]);

  const defaultSource = eligibleSourceYears[0] ?? new Date().getFullYear();

  const [scope, setScope] = useState<ScopeTab>('all');
  const [sourceYear, setSourceYear] = useState<number>(defaultSource);
  const [targetYear, setTargetYear] = useState<number>(defaultSource + 1);
  const [selectedTypes, setSelectedTypes] = useState<BTCRolloverEntityType[]>([]);
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);
  const [entitySearch, setEntitySearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state on every open/close cycle.
  useEffect(() => {
    if (open) {
      const src = eligibleSourceYears[0] ?? new Date().getFullYear();
      setScope('all');
      setSourceYear(src);
      setTargetYear(src + 1);
      setSelectedTypes([]);
      setSelectedEntityIds([]);
      setEntitySearch('');
      setSubmitting(false);
      setError(null);
    }
  }, [open, eligibleSourceYears]);

  const targetYearOptions = useMemo(() => {
    // Anything strictly greater than source, capped 6 years out for UX.
    const start = sourceYear + 1;
    const arr: number[] = [];
    for (let y = start; y <= start + 5; y++) arr.push(y);
    return arr;
  }, [sourceYear]);

  // Entities that have an active source-year profile — the only ones eligible
  // for "Specific entities" scope.
  const entitiesWithSourceProfile = useMemo(() => {
    const ids = new Set<string>();
    existingProfiles.forEach((p) => {
      if (p.year === sourceYear && p.status === 'active') ids.add(p.entity_id);
    });
    const lower = entitySearch.trim().toLowerCase();
    return entities
      .filter((e) => ids.has(e.id))
      .filter((e) => {
        if (!lower) return true;
        return `${e.name} ${e.identifier}`.toLowerCase().includes(lower);
      });
  }, [existingProfiles, entities, sourceYear, entitySearch]);

  const eligibleProfileCount = useMemo(() => {
    if (scope === 'all') {
      return existingProfiles.filter(
        (p) => p.year === sourceYear && p.status === 'active',
      ).length;
    }
    if (scope === 'types') {
      const typeMatchSet = new Set(
        TYPE_OPTIONS.filter((t) => selectedTypes.includes(t.value)).map((t) => t.matches),
      );
      return existingProfiles.filter((p) => {
        if (p.year !== sourceYear || p.status !== 'active') return false;
        const ent = entities.find((e) => e.id === p.entity_id);
        return ent ? typeMatchSet.has(ent.entity_type) : false;
      }).length;
    }
    // entities scope
    const idSet = new Set(selectedEntityIds);
    return existingProfiles.filter((p) =>
      p.year === sourceYear && p.status === 'active' && idSet.has(p.entity_id),
    ).length;
  }, [scope, existingProfiles, entities, sourceYear, selectedTypes, selectedEntityIds]);

  const toggleType = (type: BTCRolloverEntityType) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  const toggleEntity = (id: string) => {
    setSelectedEntityIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const canSubmit = useMemo(() => {
    if (submitting) return false;
    if (eligibleSourceYears.length === 0) return false;
    if (targetYear <= sourceYear) return false;
    if (scope === 'types' && selectedTypes.length === 0) return false;
    if (scope === 'entities' && selectedEntityIds.length === 0) return false;
    return true;
  }, [
    submitting, eligibleSourceYears.length, sourceYear, targetYear,
    scope, selectedTypes, selectedEntityIds,
  ]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await chargingApi.yearRolloverBTCProfiles({
        source_year: sourceYear,
        target_year: targetYear,
        entity_types: scope === 'types' ? selectedTypes : null,
        entity_ids: scope === 'entities' ? selectedEntityIds : null,
      });
      onCompleted(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Year rollover failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Year rollover</DialogTitle>
          <DialogDescription>
            Copy active BTC profiles from the source year into draft profiles
            for the target year per [F-S2-07]. Profiles already present in the
            target year are skipped (not overwritten).
          </DialogDescription>
        </DialogHeader>

        {eligibleSourceYears.length === 0 ? (
          <Card className="border-amber-500 bg-amber-50 dark:bg-amber-900/20 p-3">
            <p className="text-sm text-amber-800 dark:text-amber-300">
              No active BTC profiles exist yet. Create and activate at least
              one profile before using the year-rollover action.
            </p>
          </Card>
        ) : (
          <>
            {/* Year selectors */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Source year
                </label>
                <Select
                  value={String(sourceYear)}
                  onValueChange={(v) => {
                    const next = Number(v);
                    setSourceYear(next);
                    if (targetYear <= next) setTargetYear(next + 1);
                    setSelectedEntityIds([]);
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleSourceYears.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Target year
                </label>
                <Select
                  value={String(targetYear)}
                  onValueChange={(v) => setTargetYear(Number(v))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {targetYearOptions.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Scope tabs */}
            <Tabs value={scope} onValueChange={(v) => setScope(v as ScopeTab)} className="mt-2">
              <TabsList>
                <TabsTrigger value="all">All profiles</TabsTrigger>
                <TabsTrigger value="types">By entity type</TabsTrigger>
                <TabsTrigger value="entities">Specific entities</TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="mt-3">
                <p className="text-xs text-muted-foreground">
                  All active profiles for {sourceYear} are rolled over to
                  {' '}{targetYear} as new draft profiles.
                </p>
              </TabsContent>

              <TabsContent value="types" className="mt-3 space-y-2">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Pick one or more types
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {TYPE_OPTIONS.map((t) => (
                    <label
                      key={t.value}
                      className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 cursor-pointer hover:bg-accent text-sm text-foreground"
                    >
                      <Checkbox
                        checked={selectedTypes.includes(t.value)}
                        onCheckedChange={() => toggleType(t.value)}
                      />
                      <span>{t.label}</span>
                    </label>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="entities" className="mt-3 space-y-2">
                <Input
                  value={entitySearch}
                  onChange={(e) => setEntitySearch(e.target.value)}
                  placeholder="Search entities by name or identifier…"
                  className="h-9"
                />
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {selectedEntityIds.length} selected ·{' '}
                  {entitiesWithSourceProfile.length} eligible (active profile in {sourceYear})
                </p>
                <div className="border border-border rounded-md max-h-[260px] overflow-y-auto bg-card">
                  {entitiesWithSourceProfile.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      No entities match the current search.
                    </div>
                  ) : (
                    entitiesWithSourceProfile.map((e) => (
                      <label
                        key={e.id}
                        className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-accent border-b border-border last:border-b-0"
                      >
                        <Checkbox
                          checked={selectedEntityIds.includes(e.id)}
                          onCheckedChange={() => toggleEntity(e.id)}
                        />
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-foreground">{e.name}</span>
                          <span className="text-[11px] font-mono text-muted-foreground">
                            {e.identifier} · {e.entity_type}
                          </span>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </TabsContent>
            </Tabs>

            {/* Live count strip */}
            <Card className="px-3 py-2 mt-1 bg-accent/40">
              <p className="text-xs text-foreground">
                <span className="font-semibold">{eligibleProfileCount}</span>{' '}
                profile{eligibleProfileCount === 1 ? '' : 's'} will be rolled over from{' '}
                <span className="font-semibold">{sourceYear}</span> to{' '}
                <span className="font-semibold">{targetYear}</span>.
              </p>
            </Card>
          </>
        )}

        {error && (
          <Card className="border-red-500 bg-red-50 dark:bg-red-900/20 p-3 mt-2">
            <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
          </Card>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? 'Rolling over…' : 'Confirm rollover'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
