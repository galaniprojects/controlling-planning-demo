/**
 * Create-BTC-profile dialog per [F-S2-01..03] [F-S2-07].
 *
 * Three pathways for a new profile:
 *  - Manual: blank profile to be edited line-by-line in the editor.
 *  - Automatic: pick an S-code, snapshot from the current UM matrix.
 *  - Copy from: clone any existing profile by entity + year (the unified
 *    "year rollover / copy" mechanic per [F-S2-07]).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { chargingApi } from '@/api/endpoints';
import type {
  ChargeableEntityItem,
  BTCMode,
  BTCProfileItem,
} from '@/types/api';

interface Props {
  open: boolean;
  onClose: () => void;
  defaultYear: number;
  existingProfiles: BTCProfileItem[];
  entities: ChargeableEntityItem[];
  onCreated: (newProfileId: number) => void;
}

type Tab = 'manual' | 'automatic' | 'copy';

export function CreateBTCProfileDialog({
  open,
  onClose,
  defaultYear,
  existingProfiles,
  entities,
  onCreated,
}: Props) {
  const [tab, setTab] = useState<Tab>('manual');
  const [entitySearch, setEntitySearch] = useState('');
  const [entityId, setEntityId] = useState('');
  const [year, setYear] = useState(defaultYear);
  const [sCode, setSCode] = useState('');
  const [sourceProfileId, setSourceProfileId] = useState<number | null>(null);
  const [profileSearch, setProfileSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setTab('manual');
      setEntityId('');
      setYear(defaultYear);
      setSCode('');
      setSourceProfileId(null);
      setEntitySearch('');
      setProfileSearch('');
      setError(null);
    }
  }, [open, defaultYear]);

  const profilesByEntity = useMemo(() => {
    const map = new Map<string, BTCProfileItem[]>();
    existingProfiles.forEach((p) => {
      const arr = map.get(p.entity_id) ?? [];
      arr.push(p);
      map.set(p.entity_id, arr);
    });
    return map;
  }, [existingProfiles]);

  // Entities still without a profile for the chosen year (skip duplicates per
  // the UniqueConstraint on (entity_id, year)).
  const eligibleEntities = useMemo(() => {
    const lower = entitySearch.trim().toLowerCase();
    return entities.filter((e) => {
      const profiles = profilesByEntity.get(e.id) ?? [];
      const hasYearProfile = profiles.some((p) => p.year === year);
      if (hasYearProfile) return false;
      if (lower) {
        const blob = `${e.name} ${e.identifier}`.toLowerCase();
        if (!blob.includes(lower)) return false;
      }
      return true;
    });
  }, [entities, profilesByEntity, year, entitySearch]);

  const sourceProfileOptions = useMemo(() => {
    const lower = profileSearch.trim().toLowerCase();
    return existingProfiles.filter((p) => {
      const ent = entities.find((e) => e.id === p.entity_id);
      if (!ent) return true;
      if (lower) {
        const blob = `${ent.name} ${ent.identifier}`.toLowerCase();
        if (!blob.includes(lower)) return false;
      }
      return true;
    });
  }, [existingProfiles, entities, profileSearch]);

  const handleCreate = async () => {
    if (!entityId) {
      setError('Pick a target entity.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let profile: BTCProfileItem;
      if (tab === 'manual') {
        profile = await chargingApi.createBTCProfile({
          entity_id: entityId,
          year,
          mode: 'manual' as BTCMode,
          status: 'draft',
          lines: [],
        });
      } else if (tab === 'automatic') {
        if (!sCode.trim()) {
          setError('Enter the S-code for UM lookup.');
          setSaving(false);
          return;
        }
        profile = await chargingApi.createBTCProfile({
          entity_id: entityId,
          year,
          mode: 'automatic' as BTCMode,
          s_code: sCode.trim(),
          status: 'draft',
        });
      } else {
        if (!sourceProfileId) {
          setError('Pick a profile to copy from.');
          setSaving(false);
          return;
        }
        profile = await chargingApi.copyBTCProfileFrom({
          source_profile_id: sourceProfileId,
          target_entity_id: entityId,
          target_year: year,
          target_status: 'draft',
        });
      }
      onCreated(profile.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New BTC profile</DialogTitle>
          <DialogDescription>
            Create a profile per [F-S2-01..03] [F-S2-07]. Manual = edit lines
            yourself. Automatic = snapshot from the User Measurement matrix.
            Copy from = clone an existing profile.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="manual">Manual</TabsTrigger>
            <TabsTrigger value="automatic">Automatic (UM)</TabsTrigger>
            <TabsTrigger value="copy">Copy from…</TabsTrigger>
          </TabsList>

          {/* Common entity / year picker */}
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="space-y-1">
              <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Year
              </label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2025, 2026, 2027].map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Search entity
              </label>
              <Input
                value={entitySearch}
                onChange={(e) => setEntitySearch(e.target.value)}
                placeholder="Identifier or name…"
                className="h-9"
              />
            </div>
          </div>
          <div className="space-y-1 mt-2">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Target entity ({eligibleEntities.length} eligible)
            </label>
            <Select value={entityId} onValueChange={setEntityId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Pick an entity without a profile for this year…" />
              </SelectTrigger>
              <SelectContent className="max-h-[260px]">
                {eligibleEntities.slice(0, 200).map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    <span className="text-sm">{e.name}</span>
                    <span className="text-[11px] font-mono text-muted-foreground ml-2">
                      {e.identifier}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <TabsContent value="manual" className="mt-3">
            <p className="text-xs text-muted-foreground">
              A blank manual profile will be created. Add charging-location
              lines in the editor.
            </p>
          </TabsContent>

          <TabsContent value="automatic" className="mt-3 space-y-2">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              S-code (UM lookup key)
            </label>
            <Input
              value={sCode}
              onChange={(e) => setSCode(e.target.value)}
              placeholder="e.g. S1234"
              className="h-9 font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Per [F-S2-03]: the current UM matrix is snapshotted into the
              profile's lines. Refresh manually via the editor's "Refresh from
              UM" action.
            </p>
          </TabsContent>

          <TabsContent value="copy" className="mt-3 space-y-2">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Search source profiles
            </label>
            <Input
              value={profileSearch}
              onChange={(e) => setProfileSearch(e.target.value)}
              placeholder="Entity name or identifier…"
              className="h-9"
            />
            <Select
              value={sourceProfileId ? String(sourceProfileId) : ''}
              onValueChange={(v) => setSourceProfileId(Number(v))}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Pick a profile to copy…" />
              </SelectTrigger>
              <SelectContent className="max-h-[260px]">
                {sourceProfileOptions.slice(0, 200).map((p) => {
                  const ent = entities.find((e) => e.id === p.entity_id);
                  return (
                    <SelectItem key={p.id} value={String(p.id)}>
                      <span className="text-sm">
                        {ent?.name ?? p.entity_id} · {p.year}
                      </span>
                      <span className="text-[11px] font-mono text-muted-foreground ml-2">
                        {p.mode} · {p.lines.length} lines
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Per [F-S2-07]: source rows are copied verbatim. Mode is preserved.
            </p>
          </TabsContent>
        </Tabs>

        {error && (
          <Card className="border-red-500 bg-red-50 dark:bg-red-900/20 p-3 mt-3">
            <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
          </Card>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving ? 'Creating…' : 'Create profile'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
