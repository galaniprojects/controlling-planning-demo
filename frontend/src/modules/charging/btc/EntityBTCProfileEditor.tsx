/**
 * Single-entity BTC profile editor per [F-S2-02..05].
 *
 * Modes:
 *   - manual    add-only line list with searchable charging-location picker,
 *               sum-to-100 gate on save per [F-S2-02].
 *   - automatic S-code dropdown, read-only preview, "Refresh from UM" action
 *               with diff preview before commit per [F-S2-03..04].
 *
 * Mode-change UX per [F-S2-05]:
 *   - automatic → manual : verbatim inherit, no warning needed.
 *   - manual → automatic : warning-with-values-visible dialog before discard.
 *
 * v5 B2 [B-OQ-02]: optional `scenarioVersion?: string` + `onSandboxSave`
 * callback let the simulator CostAllocationSurface mount this editor in
 * sandbox mode. When `scenarioVersion` is provided + `onSandboxSave` is
 * given, the manual-save handler routes the line list through the scenario
 * sandbox instead of the canonical Charging API. Mode toggling and the UM
 * "Refresh from UM" path are disabled in sandbox mode (see [B-ES-01] —
 * Lever 12 sandbox stays on the line-overlay path; mode switches and UM
 * snapshots are canonical-only operations).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Plus, Trash2, AlertTriangle, RefreshCw, Save, Search,
  CheckCircle2,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/shared/Skeleton';
import { LocationLabel } from '@/components/shared/LocationLabel';
import { chargingApi, adminD3Api } from '@/api/endpoints';
import type {
  BTCProfileItem,
  BTCMode,
  BTCRefreshDiffResult,
  ChargeableEntityItem,
  ChargingLocationItem,
} from '@/types/api';

/**
 * Two ways to mount this editor:
 *
 *   <EntityBTCProfileEditor profileId={123} onBack={...} />
 *   <EntityBTCProfileEditor entityId="ce-..." year={2026} onBack={...} />
 *
 * The (entityId, year) form fetches the active profile via the entity-keyed
 * endpoint; if no profile exists the component shows a "no profile yet" panel
 * so the Workbench BTC tab can still render. Used by F6 / [E-09].
 *
 * The legacy (profileId) form is the path used by BTCProfileListView.
 *
 * v5 B2 [B-OQ-02]: when `scenarioVersion` is provided + `onSandboxSave` is
 * supplied, the manual-save submit branch routes the line list through the
 * scenario sandbox (Lever 12 BTC overlay) instead of writing canonical rows.
 */
type CommonProps = {
  /**
   * v5 B2 sandbox-version sentinel (e.g. `'scenario-12'`). When present the
   * editor is in sandbox mode: the canonical UM refresh + mode-switch are
   * disabled and `onSandboxSave` (if also provided) handles the line submit.
   */
  scenarioVersion?: string;
  /**
   * Sandbox submit handler. Called with the draft line list when sandbox
   * mode is active. Surfaces wire this to ScenarioContext.setBtcLines().
   * Required when `scenarioVersion` is provided; otherwise unused.
   */
  onSandboxSave?: (
    lines: { charging_location_id: string; percentage: number }[],
  ) => Promise<void>;
};

/**
 * `onBack` is optional. List-view callers (BTCProfileListView,
 * Charging Distribution surface) provide it to return to the parent list.
 * Workbench / Run Portfolio embed the editor with its own page-level Back
 * button and omit this prop so the inner Back button is suppressed
 * (per v5.1 user feedback — duplicate dead Back button next to the title).
 */
type Props =
  | (CommonProps & { profileId: number; entityId?: never; year?: never; onBack?: () => void })
  | (CommonProps & { profileId?: never; entityId: string; year: number; onBack?: () => void });

interface DraftLine {
  charging_location_id: string;
  percentage: number;
}

/** European integer formatting (`.` thousands, no decimals) — UM is integer-only. */
function fmtUmInt(v: number): string {
  return new Intl.NumberFormat('de-DE').format(v);
}

export function EntityBTCProfileEditor(props: Props) {
  const { onBack, scenarioVersion, onSandboxSave } = props;
  const sandboxMode = Boolean(scenarioVersion);
  const [profile, setProfile] = useState<BTCProfileItem | null>(null);
  const [entity, setEntity] = useState<ChargeableEntityItem | null>(null);
  const [chargingLocations, setChargingLocations] = useState<ChargingLocationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // True when caller passed entityId+year and no profile yet exists for that pair.
  const [profileMissing, setProfileMissing] = useState(false);

  // Manual editor draft (only used when mode === 'manual')
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [refreshDiff, setRefreshDiff] = useState<BTCRefreshDiffResult | null>(null);
  const [refreshOpen, setRefreshOpen] = useState(false);
  const [modeChangeOpen, setModeChangeOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    setProfileMissing(false);
    try {
      // Pick the charging-locations endpoint based on caller path. The
      // legacy (profileId) caller is controller-only so the admin
      // endpoint is fine; the (entityId+year) caller may run as PL /
      // exec / cc-owner so we use the read-only charging-namespaced
      // endpoint.
      const locsPromise = props.profileId !== undefined
        ? adminD3Api.getChargingLocations()
        : chargingApi.listChargingLocationsReadOnly();

      let prof: BTCProfileItem | null = null;
      let ent: ChargeableEntityItem | null = null;

      if (props.profileId !== undefined) {
        // Legacy (profileId) path used by BTCProfileListView.
        prof = await chargingApi.getBTCProfile(props.profileId);
        ent = await chargingApi.getEntity(prof.entity_id);
      } else {
        // (entityId, year) path used by Workbench BTC tab per [E-09].
        ent = await chargingApi.getEntity(props.entityId);
        try {
          prof = await chargingApi.getEntityBTCProfile(props.entityId, props.year);
        } catch (e: unknown) {
          // 404 is expected when no profile yet exists — surface a creation
          // prompt rather than failing the whole panel.
          const msg = e instanceof Error ? e.message : '';
          if (msg.toLowerCase().includes('not found') || msg.includes('404')) {
            setProfileMissing(true);
            prof = null;
          } else {
            throw e;
          }
        }
      }

      const locs = await locsPromise;
      setProfile(prof);
      setEntity(ent);
      setChargingLocations(locs.items);
      setDraft(
        prof
          ? prof.lines.map((l) => ({
              charging_location_id: l.charging_location_id,
              percentage: l.percentage,
            }))
          : [],
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch when caller-provided keys change.
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.profileId, props.entityId, props.year]);

  const draftSum = useMemo(
    () => draft.reduce((s, l) => s + (Number(l.percentage) || 0), 0),
    [draft],
  );
  const draftSumsTo100 = Math.abs(draftSum - 100) < 0.01;

  const locationById = useMemo(() => {
    const map = new Map<string, ChargingLocationItem>();
    chargingLocations.forEach((c) => map.set(c.id, c));
    return map;
  }, [chargingLocations]);

  const isAutomatic = profile?.mode === 'automatic';
  const isManual = profile?.mode === 'manual';
  // FD-4 [F-S2-01]: InternalService BTC is derivation-only. Hide manual
  // editor blocks, the mode-switch button, and the ModeChangeDialog for
  // these entities. Backend rejects manual creation + mode-changes regardless;
  // this is the front-of-house enforcement.
  const isInternalService = entity?.entity_type === 'InternalService';

  // === Manual line edits ===
  const setLineDraftPct = (idx: number, value: string) => {
    const next = [...draft];
    next[idx] = { ...next[idx], percentage: Number(value) || 0 };
    setDraft(next);
  };
  const removeDraftLine = (idx: number) => {
    setDraft(draft.filter((_, i) => i !== idx));
  };
  const addDraftLine = (line: DraftLine) => {
    setDraft([...draft, line]);
  };

  const handleSaveManual = async () => {
    if (!profile) return;
    if (!draftSumsTo100) {
      setError('Manual profiles must sum to 100% per [F-S2-02].');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // v5 B2 [B-OQ-02]: in sandbox mode, route to the scenario Lever 12
      // BTC-line overlay rather than writing canonical rows. The scenario
      // engine merges the overlay at impact-calc time per spec line 880.
      if (sandboxMode && onSandboxSave) {
        await onSandboxSave(draft);
        // No canonical-row update; the scenario context owns reload/recalc.
      } else {
        const updated = await chargingApi.updateBTCProfile(profile.id, { lines: draft });
        setProfile(updated);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDryRunRefresh = async () => {
    if (!profile) return;
    setError(null);
    try {
      const diff = await chargingApi.refreshBTCFromUM(profile.id, { dry_run: true });
      setRefreshDiff(diff);
      setRefreshOpen(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Refresh failed');
    }
  };

  const handleCommitRefresh = async () => {
    if (!profile) return;
    setSaving(true);
    setError(null);
    try {
      await chargingApi.refreshBTCFromUM(profile.id, { dry_run: false });
      setRefreshOpen(false);
      setRefreshDiff(null);
      fetchData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Commit failed');
    } finally {
      setSaving(false);
    }
  };

  // FD-4 [F-S2-02]: explicit activate hits POST /btc-profiles/{id}/activate.
  // Automatic profiles get re-snapshotted against the *currently active*
  // UM version at this moment; manual profiles get a fresh sum-to-100 check.
  // Disabled in sandbox mode (Lever 12 keeps canonical-only ops out of scope).
  const handleActivate = async () => {
    if (!profile) return;
    setSaving(true);
    setError(null);
    try {
      await chargingApi.activateBTCProfile(profile.id, {});
      fetchData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Activate failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!entity) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">Failed to load BTC profile.</p>
        {onBack && (
          <Button variant="outline" size="sm" onClick={onBack} className="mt-4">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
          </Button>
        )}
      </Card>
    );
  }

  if (profileMissing && !profile) {
    // (entityId, year) path: entity exists but no profile yet — show a prompt.
    const targetYear = (props.year ?? new Date().getFullYear()) as number;
    return (
      <Card className="p-6 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">No BTC profile yet</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {entity.name} ({entity.identifier}) has no Business-Transfer Charging
            profile for {targetYear}. A controller can create one in the
            Charging & Allocations module.
          </p>
        </div>
        {onBack && (
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
          </Button>
        )}
      </Card>
    );
  }

  if (!profile) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">Failed to load BTC profile.</p>
        {onBack && (
          <Button variant="outline" size="sm" onClick={onBack} className="mt-4">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
          </Button>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
            </Button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">{entity.name}</h2>
              <Badge variant="secondary" className="text-[10px]">
                {entity.entity_type}
              </Badge>
              <Badge
                variant="outline"
                className={
                  profile.mode === 'automatic'
                    ? 'text-[10px] border-blue-500 text-blue-700 dark:text-blue-400'
                    : 'text-[10px]'
                }
              >
                {profile.mode}
              </Badge>
              <Badge
                variant="outline"
                className={
                  profile.status === 'active'
                    ? 'text-[10px] border-emerald-500 text-emerald-700 dark:text-emerald-400'
                    : 'text-[10px] border-amber-500 text-amber-700 dark:text-amber-400'
                }
              >
                {profile.status}
              </Badge>
            </div>
            <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
              {entity.identifier} · year {profile.year}
              {profile.s_code && ` · S-code ${profile.s_code}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* FD-4 [F-S2-02]: explicit Activate CTA for draft profiles
              (all entity types). Triggers re-snapshot against current UM
              for automatic profiles + sum-to-100 revalidation for manual. */}
          {profile.status === 'draft' && !sandboxMode && (
            <Button variant="default" size="sm" onClick={handleActivate} disabled={saving}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              {saving ? 'Activating…' : 'Activate'}
            </Button>
          )}
          {isAutomatic && !sandboxMode ? (
            <Button variant="outline" size="sm" onClick={handleDryRunRefresh}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Advance UM snapshot
            </Button>
          ) : null}
          {/* v5 B2: hide canonical-only operations in sandbox mode.
              UM refresh and mode-switch always write canonical rows;
              Lever 12 sandbox keeps them disabled by design ([B-ES-01]).
              FD-4 [F-S2-01]: hide mode-switch entirely for InternalService —
              the backend rejects mode-changes for them. */}
          {!sandboxMode && !isInternalService && (
            <Button variant="outline" size="sm" onClick={() => setModeChangeOpen(true)}>
              Switch to {profile.mode === 'manual' ? 'automatic' : 'manual'}
            </Button>
          )}
          {sandboxMode && (
            <Badge
              variant="outline"
              className="text-[10px] border-blue-500 text-blue-700 dark:text-blue-400"
            >
              Sandbox edit
            </Badge>
          )}
        </div>
      </div>

      {error && (
        <Card className="border-red-500 bg-red-50 dark:bg-red-900/20 p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-red-700 dark:text-red-400 mt-0.5" />
          <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
        </Card>
      )}

      {/* Sum status */}
      <Card className="p-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
              Lines
            </label>
            <p className="text-lg font-mono text-foreground tabular-nums">
              {isManual ? draft.length : profile.lines.length}
            </p>
          </div>
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
              Σ percentages
            </label>
            <p
              className={
                'text-lg font-mono tabular-nums ' +
                (Math.abs((isManual ? draftSum : profile.lines.reduce((s, l) => s + l.percentage, 0)) - 100) < 0.01
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-amber-700 dark:text-amber-400')
              }
            >
              {(isManual ? draftSum : profile.lines.reduce((s, l) => s + l.percentage, 0)).toFixed(2)}%
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Per [F-S2-02]: must sum to 100%
            </p>
          </div>
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
              UM snapshot
            </label>
            <p className="text-sm text-foreground">
              {profile.um_snapshot_at ? (
                new Date(profile.um_snapshot_at).toLocaleDateString('en-GB')
              ) : (
                <span className="text-muted-foreground">never</span>
              )}
            </p>
          </div>
        </div>
      </Card>

      {/* Lines table */}
      <Card>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              <LocationLabel kind="charging" /> distribution
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAutomatic
                ? (isInternalService
                  ? 'Automatic mode — InternalService BTC is derivation-only from UM. Advance the snapshot to pick up newer UM data.'
                  : 'Automatic mode — values snapshotted from UM. To override, switch to manual.')
                : 'Manual mode — add lines, sum must equal 100% before save.'}
            </p>
          </div>
          {isManual && !isInternalService && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add line
              </Button>
              <Button size="sm" onClick={handleSaveManual} disabled={saving || !draftSumsTo100}>
                <Save className="h-3.5 w-3.5 mr-1" />
                {saving ? 'Saving…' : 'Save profile'}
              </Button>
            </div>
          )}
        </div>
        {(isManual ? draft : profile.lines).length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            No lines yet. {isManual && 'Add at least one charging location.'}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <LocationLabel kind="charging" text="Charging location" />
                </TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Region / Country</TableHead>
                <TableHead>Division</TableHead>
                {/* FD-5 [F-DSH-01]: automatic profiles render the triple —
                    raw UM integer + allocation key + derived %, % primary. */}
                {isAutomatic && <TableHead className="text-right">Raw UM</TableHead>}
                {isAutomatic && <TableHead>Allocation key</TableHead>}
                <TableHead className="text-right">Percentage</TableHead>
                {isManual && <TableHead className="text-right pr-4">Remove</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(isManual ? draft : profile.lines).map((l, idx) => {
                const cl = locationById.get(l.charging_location_id);
                const pct = 'percentage' in l ? l.percentage : 0;
                const rawUm = 'raw_um_value' in l ? l.raw_um_value ?? null : null;
                return (
                  <TableRow key={`${l.charging_location_id}-${idx}`}>
                    <TableCell className="text-sm font-medium">
                      {cl?.name ?? l.charging_location_id}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {cl?.code ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {[cl?.region_name, cl?.country_iso_code].filter(Boolean).join(' / ') || '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {cl?.division ?? '—'}
                    </TableCell>
                    {isAutomatic && (
                      <TableCell className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                        {rawUm != null ? fmtUmInt(rawUm) : '—'}
                      </TableCell>
                    )}
                    {isAutomatic && (
                      <TableCell className="text-xs text-muted-foreground">
                        {profile.allocation_key ?? '—'}
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      {isManual ? (
                        <Input
                          type="number"
                          min={0.01}
                          max={100}
                          step={0.01}
                          value={pct}
                          onChange={(e) => setLineDraftPct(idx, e.target.value)}
                          className="w-[100px] h-8 ml-auto font-mono text-right"
                        />
                      ) : (
                        <span className="font-mono text-sm tabular-nums">
                          {pct.toFixed(2)}%
                        </span>
                      )}
                    </TableCell>
                    {isManual && (
                      <TableCell className="text-right pr-4">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeDraftLine(idx)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <AddLineDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        chargingLocations={chargingLocations}
        usedIds={new Set(draft.map((l) => l.charging_location_id))}
        availableHeadroom={Math.max(0, 100 - draftSum)}
        onAdd={(line) => {
          addDraftLine(line);
          setAddOpen(false);
        }}
      />

      <RefreshDiffDialog
        open={refreshOpen}
        diff={refreshDiff}
        onClose={() => {
          setRefreshOpen(false);
          setRefreshDiff(null);
        }}
        onCommit={handleCommitRefresh}
        committing={saving}
        locationById={locationById}
      />

      {/* FD-4 [F-S2-01]: ModeChangeDialog is hidden for InternalService —
          the backend rejects mode-changes for them. */}
      {!isInternalService && (
        <ModeChangeDialog
          open={modeChangeOpen}
          currentMode={profile.mode}
          currentLines={profile.lines}
          currentSum={profile.lines.reduce((s, l) => s + l.percentage, 0)}
          onClose={() => setModeChangeOpen(false)}
          onConfirm={async (newMode, sCode) => {
            if (!profile) return;
            setSaving(true);
            setError(null);
            try {
              await chargingApi.changeBTCMode(profile.id, {
                new_mode: newMode,
                s_code: sCode,
                confirm: true,
              });
              setModeChangeOpen(false);
              fetchData();
            } catch (e: unknown) {
              setError(e instanceof Error ? e.message : 'Mode change failed');
            } finally {
              setSaving(false);
            }
          }}
          committing={saving}
          locationById={locationById}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add-line dialog (manual mode only)
// ---------------------------------------------------------------------------
interface AddLineProps {
  open: boolean;
  onClose: () => void;
  chargingLocations: ChargingLocationItem[];
  usedIds: Set<string>;
  availableHeadroom: number;
  onAdd: (line: DraftLine) => void;
}

function AddLineDialog({
  open, onClose, chargingLocations, usedIds, availableHeadroom, onAdd,
}: AddLineProps) {
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [divisionFilter, setDivisionFilter] = useState<string>('all');
  const [chosenId, setChosenId] = useState('');
  const [pct, setPct] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setRegionFilter('all');
      setDivisionFilter('all');
      setChosenId('');
      setPct('');
      setError(null);
    }
  }, [open]);

  const regions = useMemo(() => {
    const set = new Set<string>();
    chargingLocations.forEach((c) => c.region_name && set.add(c.region_name));
    return Array.from(set).sort();
  }, [chargingLocations]);
  const divisions = useMemo(() => {
    const set = new Set<string>();
    chargingLocations.forEach((c) => c.division && set.add(c.division));
    return Array.from(set).sort();
  }, [chargingLocations]);

  const candidates = useMemo(() => {
    const lower = search.trim().toLowerCase();
    return chargingLocations.filter((c) => {
      if (!c.is_active) return false;
      if (usedIds.has(c.id)) return false;
      if (regionFilter !== 'all' && c.region_name !== regionFilter) return false;
      if (divisionFilter !== 'all' && c.division !== divisionFilter) return false;
      if (lower) {
        const blob = `${c.name} ${c.code}`.toLowerCase();
        if (!blob.includes(lower)) return false;
      }
      return true;
    });
  }, [chargingLocations, usedIds, search, regionFilter, divisionFilter]);

  const handleAdd = () => {
    if (!chosenId) {
      setError('Pick a charging location.');
      return;
    }
    const value = Number(pct);
    if (Number.isNaN(value) || value <= 0 || value > 100) {
      setError('Percentage must be between 0 (exclusive) and 100.');
      return;
    }
    if (value > availableHeadroom + 0.001) {
      setError(`Only ${availableHeadroom.toFixed(2)}% headroom remains before reaching 100%.`);
      return;
    }
    onAdd({ charging_location_id: chosenId, percentage: value });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Add <LocationLabel kind="charging" iconOnly className="text-base" /> line
          </DialogTitle>
          <DialogDescription>
            Available headroom before sum-to-100: {availableHeadroom.toFixed(2)}%
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Region
              </label>
              <Select value={regionFilter} onValueChange={setRegionFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All regions</SelectItem>
                  {regions.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Division
              </label>
              <Select value={divisionFilter} onValueChange={setDivisionFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All divisions</SelectItem>
                  {divisions.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Search
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Code or name…"
                className="h-9 pl-8"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <LocationLabel kind="charging" text={`Charging location (${candidates.length} match)`} />
            </label>
            <Select value={chosenId} onValueChange={setChosenId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Pick a location…" />
              </SelectTrigger>
              <SelectContent className="max-h-[260px]">
                {candidates.slice(0, 200).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="text-sm">{c.name}</span>
                    <span className="text-[11px] font-mono text-muted-foreground ml-2">
                      {c.code}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Percentage
            </label>
            <Input
              type="number"
              min={0.01}
              max={100}
              step={0.01}
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              className="h-9 font-mono"
              placeholder="e.g. 25.00"
            />
          </div>

          {error && (
            <Card className="border-red-500 bg-red-50 dark:bg-red-900/20 p-3">
              <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={!chosenId || !pct}>
            Add line
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Refresh-from-UM dry-run / commit dialog
// ---------------------------------------------------------------------------
interface RefreshDiffProps {
  open: boolean;
  diff: BTCRefreshDiffResult | null;
  onClose: () => void;
  onCommit: () => void;
  committing: boolean;
  locationById: Map<string, ChargingLocationItem>;
}

function RefreshDiffDialog({
  open, diff, onClose, onCommit, committing, locationById,
}: RefreshDiffProps) {
  if (!diff) return null;
  const labelFor = (id: string) => locationById.get(id)?.code ?? id;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Advance UM snapshot — diff preview</DialogTitle>
          <DialogDescription>
            S-code <span className="font-mono">{diff.s_code}</span> · year {diff.year} Q{diff.quarter}
            {' · '}
            {diff.would_sum_to_100 ? 'sums to 100%' : <span className="text-amber-700">does not sum to 100%</span>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[420px] overflow-y-auto">
          {diff.added.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1">
                Added ({diff.added.length})
              </h4>
              <ul className="text-xs space-y-0.5">
                {diff.added.map((id) => (
                  <li key={id} className="font-mono text-muted-foreground">
                    + {labelFor(id)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {diff.removed.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1">
                Removed ({diff.removed.length})
              </h4>
              <ul className="text-xs space-y-0.5">
                {diff.removed.map((id) => (
                  <li key={id} className="font-mono text-muted-foreground">
                    − {labelFor(id)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {diff.changed.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">
                Changed ({diff.changed.length})
              </h4>
              <ul className="text-xs space-y-0.5">
                {diff.changed.map((c) => (
                  <li key={c.cl_id} className="font-mono text-muted-foreground">
                    Δ {labelFor(c.cl_id)}: {c.old_pct?.toFixed(2)}% →{' '}
                    {c.new_pct?.toFixed(2)}%
                  </li>
                ))}
              </ul>
            </div>
          )}
          {diff.added.length + diff.removed.length + diff.changed.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No differences — current snapshot is already aligned with the UM matrix.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={committing}>
            Cancel
          </Button>
          <Button onClick={onCommit} disabled={committing}>
            {committing ? 'Advancing…' : 'Advance snapshot'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Mode change dialog per [F-S2-05]
// ---------------------------------------------------------------------------
interface ModeChangeProps {
  open: boolean;
  currentMode: BTCMode;
  currentLines: BTCProfileItem['lines'];
  currentSum: number;
  onClose: () => void;
  onConfirm: (newMode: BTCMode, sCode?: string) => Promise<void>;
  committing: boolean;
  locationById: Map<string, ChargingLocationItem>;
}

function ModeChangeDialog({
  open, currentMode, currentLines, currentSum, onClose, onConfirm, committing, locationById,
}: ModeChangeProps) {
  const newMode: BTCMode = currentMode === 'manual' ? 'automatic' : 'manual';
  const [sCode, setSCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSCode('');
      setError(null);
    }
  }, [open]);

  const isManualToAutomatic = currentMode === 'manual' && newMode === 'automatic';

  const handleConfirm = async () => {
    if (isManualToAutomatic && !sCode.trim()) {
      setError('S-code is required for the automatic snapshot.');
      return;
    }
    try {
      await onConfirm(newMode, sCode.trim() || undefined);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Mode change failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Switch to {newMode} mode</DialogTitle>
          <DialogDescription>
            {isManualToAutomatic ? (
              <span className="text-amber-700 dark:text-amber-400">
                Switching to automatic discards the manual values below and
                snapshots from the UM matrix per [F-S2-05].
              </span>
            ) : (
              <span>
                Automatic → manual inherits the current snapshot verbatim.
                You can then edit the lines.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Show current values so the user knows what they're discarding */}
        {currentLines.length > 0 && (
          <Card className="p-3 max-h-[260px] overflow-y-auto">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              Current values ({currentLines.length} lines, Σ {currentSum.toFixed(2)}%)
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">
                    <LocationLabel kind="charging" text="Location" />
                  </TableHead>
                  <TableHead className="text-xs text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentLines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs font-mono">
                      {locationById.get(l.charging_location_id)?.code ?? l.charging_location_id}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono tabular-nums">
                      {l.percentage.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        {isManualToAutomatic && (
          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              S-code (UM lookup key)
            </label>
            <Input
              value={sCode}
              onChange={(e) => setSCode(e.target.value)}
              placeholder="e.g. S1234"
              className="h-9 font-mono"
            />
          </div>
        )}

        {error && (
          <Card className="border-red-500 bg-red-50 dark:bg-red-900/20 p-3">
            <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
          </Card>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={committing}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={committing}>
            {committing ? 'Switching…' : `Switch to ${newMode}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
