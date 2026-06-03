/**
 * Project-scope Session 3 (T1) — the lone Tier-3 grid control (spec §8).
 *
 * Seniority / sourcing mix: move hours per month from one role line to another
 * from an effective month onward. **Render-null for non-Tier-3 authors** via the
 * established `useTier3` pattern (`if (!hasTier3) return null;`) — never greyed
 * out, never disabled; it simply does not exist in their grid. The backend
 * additionally gates the WRITE on `user_has_tier3`.
 *
 * Mounted as one child of `ForecastGridSurface`; mutations run through
 * `ScenarioContext`. After each, `onMutated` refetches the grid (the swap
 * reshapes resolved role-line hours).
 */
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Plus, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LocationLabel } from '@/components/shared/LocationLabel';
import { referenceApi } from '@/api/endpoints';
import type { RefLocation, RefRole } from '@/types/api';
import { useTier3 } from '../../permissions';
import { useScenarioContext } from '../../useScenarioContext';
import { scenariosApi, type ScenarioMixItem } from '../../api/scenariosApi';

interface Props {
  projectId: string;
  openMonth: string; // grid.open_month — the actuals/future boundary
  onMutated: () => void;
}

export function Tier3MixControl({ projectId, openMonth, onMutated }: Props) {
  const { scenarioId, tier3Visible, writeMixChange, revertMixChange } =
    useScenarioContext();
  const hasTier3 = useTier3({ impactTier3Visible: tier3Visible });

  const [roles, setRoles] = useState<RefRole[]>([]);
  const [locations, setLocations] = useState<RefLocation[]>([]);
  const [mixChanges, setMixChanges] = useState<ScenarioMixItem[]>([]);
  const [fromRole, setFromRole] = useState('');
  const [toRole, setToRole] = useState('');
  const [location, setLocation] = useState('');
  const [hours, setHours] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(openMonth);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasTier3) return;
    let cancelled = false;
    void referenceApi
      .getRoles()
      .then((res) => {
        if (!cancelled) setRoles(res.items ?? []);
      })
      .catch(() => undefined);
    void referenceApi
      .getLocations()
      .then((res) => {
        if (!cancelled) setLocations(res.items ?? []);
      })
      .catch(() => undefined);
    void scenariosApi
      .getScenarioMix(scenarioId, projectId)
      .then((res) => {
        if (!cancelled) setMixChanges(res.mix_changes ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [hasTier3, scenarioId, projectId]);

  const roleName = useMemo(() => {
    const map = new Map(roles.map((r) => [r.id, r.name]));
    return (id: string | null) => (id ? map.get(id) ?? id : '—');
  }, [roles]);

  const locationName = useMemo(() => {
    const map = new Map(locations.map((l) => [l.id, l.city]));
    return (id: string | null | undefined) => (id ? map.get(id) ?? id : null);
  }, [locations]);

  // Render-null for non-Tier-3 authors — the control does not exist for them.
  if (!hasTier3) return null;

  const handleAdd = async () => {
    const swap = Number(hours);
    if (!fromRole || !toRole) {
      setError('Choose both a from-role and a to-role.');
      return;
    }
    if (fromRole === toRole) {
      setError('From-role and to-role must differ.');
      return;
    }
    if (Number.isNaN(swap) || swap <= 0) {
      setError('Hours per month must be a positive number.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await writeMixChange(projectId, {
        swap_from_role_id: fromRole,
        swap_to_role_id: toRole,
        hours_per_month_swap: swap,
        effective_from: effectiveFrom,
        // Intra-location swap: send the one location; the backend mirrors it to
        // the to-side so both role lines share the same workforce location.
        swap_from_location_id: location || undefined,
      });
      setMixChanges(res.mix_changes);
      setHours('');
      onMutated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to apply mix change');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (mixId: number) => {
    setBusy(true);
    setError(null);
    try {
      const res = await revertMixChange(projectId, mixId);
      setMixChanges(res.mix_changes);
      onMutated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revert mix change');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4 space-y-3 border-amber-200 dark:border-amber-900/40">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">
          Seniority / sourcing mix
        </h4>
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          Tier 3
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Move hours per month from one role line to another, from the chosen month
        onward. Recomputes € on both lines via the effective rate.
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            From role
          </label>
          <Select value={fromRole} onValueChange={setFromRole} disabled={busy}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            To role
          </label>
          <Select value={toRole} onValueChange={setToRole} disabled={busy}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <LocationLabel kind="workforce" text="Location" iconOnly={false} />
          </label>
          <Select value={location} onValueChange={setLocation} disabled={busy}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {locations.map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>
                  {loc.city}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Hours / month
          </label>
          <Input
            type="number"
            step="1"
            min="0"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="h-9 font-mono"
            disabled={busy}
          />
        </div>
        <div className="space-y-1">
          <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Effective from
          </label>
          <Input
            type="month"
            min={openMonth}
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
            className="h-9 font-mono"
            disabled={busy}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleAdd} disabled={busy}>
          <Plus className="h-4 w-4 mr-1" />
          Apply mix change
        </Button>
      </div>

      {mixChanges.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {mixChanges.map((mc) => (
            <li
              key={mc.id}
              className="flex items-center justify-between px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-1.5 text-foreground">
                {roleName(mc.swap_from_role_id)}
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                {roleName(mc.swap_to_role_id)}
                {locationName(mc.swap_from_location_id) && (
                  <LocationLabel
                    kind="workforce"
                    text={locationName(mc.swap_from_location_id) ?? ''}
                    className="text-[11px] font-normal text-muted-foreground"
                  />
                )}
                <span className="ml-1 font-mono text-xs text-muted-foreground">
                  {mc.hours_per_month_swap}h/mo · {mc.effective_from}
                </span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                disabled={busy}
                onClick={() => handleRemove(mc.id)}
                aria-label="Remove mix change"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </Card>
  );
}
