/**
 * v5 B2 — Surface: Capacity Parameters (Tier 3 only).
 *
 * Sandbox surface for adjusting available hours per location per spec
 * line 882. Tier 3 — when `useTier3()` is false, the surface returns
 * `null` (hidden DOM per `[B-AC-02]`). Backend redacts / rejects
 * independently.
 *
 * v4 capacity is read-only and tied to `Location.headcount` × default
 * monthly hours. The simulator override is implemented as a generic
 * action of `action_type='capacity_param_change'` with
 * `lever_category='capacity_param'`. At Promote time the routing
 * service maps to `capacity_param_update` (admin path).
 */

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Sliders } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { referenceApi } from '@/api/endpoints';
import { useTier3 } from '../permissions';
import { useScenarioContext } from '../useScenarioContext';

interface LocationOption {
  id: string;
  city: string;
  monthlyHours: number;
}

const DEFAULT_HOURS_PER_FTE = 152;

export function CapacityParametersSurface() {
  const { tier3Visible, applyAction } = useScenarioContext();
  const hasTier3 = useTier3({ impactTier3Visible: tier3Visible });

  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [overrideHours, setOverrideHours] = useState('');
  const [effectiveMonth, setEffectiveMonth] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [appliedNote, setAppliedNote] = useState<string | null>(null);

  useEffect(() => {
    if (!hasTier3) return;
    setLocationLoading(true);
    void referenceApi
      .getLocations()
      .then((res) => {
        setLocations(
          res.items.map((l) => ({
            id: l.id,
            city: l.city,
            monthlyHours: DEFAULT_HOURS_PER_FTE,
          })),
        );
      })
      .finally(() => setLocationLoading(false));
  }, [hasTier3]);

  const selected = useMemo(
    () => locations.find((l) => l.id === selectedLocation),
    [locations, selectedLocation],
  );

  if (!hasTier3) return null;

  const handleApply = async () => {
    if (!selected || !overrideHours || !effectiveMonth) return;
    setSubmitError(null);
    setAppliedNote(null);
    setSubmitting(true);
    try {
      const result = await applyAction({
        scope: 'portfolio',
        action_type: 'capacity_param_change',
        parameters: {
          location_id: selected.id,
          new_monthly_hours_per_fte: Number(overrideHours),
          baseline_monthly_hours_per_fte: selected.monthlyHours,
          effective_month: effectiveMonth,
        },
        lever_category: 'capacity_param',
        tier: 3,
      });
      if (result === null) {
        setSubmitError('Apply failed — see scenario error banner.');
        return;
      }
      setAppliedNote(
        `Updated ${selected.city} to ${overrideHours} h/FTE/month from ${effectiveMonth}.`,
      );
      setOverrideHours('');
      setEffectiveMonth('');
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Apply failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sliders className="h-4 w-4 text-amber-500" />
          Capacity parameters
          <Badge
            variant="outline"
            className="border-amber-300 text-[10px] uppercase tracking-wide text-amber-700 dark:border-amber-700 dark:text-amber-400"
          >
            Tier 3
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Override the available hours per FTE for a location. Cascades through
          every utilisation calculation in the scenario. Promote routes this
          to the admin update path with effective date.
        </p>

        {locationLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading locations…
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Location <span className="text-destructive">*</span>
              </label>
              <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select a location…" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Baseline (per FTE / month)
              </label>
              <Input
                type="number"
                value={selected?.monthlyHours ?? ''}
                disabled
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Override hours <span className="text-destructive">*</span>
              </label>
              <Input
                type="number"
                value={overrideHours}
                onChange={(e) => setOverrideHours(e.target.value)}
                placeholder="e.g. 140"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Effective from <span className="text-destructive">*</span>
              </label>
              <Input
                type="text"
                value={effectiveMonth}
                onChange={(e) => setEffectiveMonth(e.target.value)}
                placeholder="2026-07"
              />
            </div>
          </div>
        )}

        {submitError && (
          <div
            role="alert"
            className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {submitError}
          </div>
        )}

        {appliedNote && (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            {appliedNote}
          </div>
        )}

        <div className="flex justify-end">
          <Button
            type="button"
            onClick={handleApply}
            disabled={
              !selectedLocation ||
              !overrideHours ||
              !effectiveMonth ||
              submitting
            }
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Apply override
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
