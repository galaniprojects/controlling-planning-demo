/**
 * Compare selection page — entry point for the Compare flow.
 *
 * Spec line 975: "Select up to 3 scenarios plus current state (always pinned
 * as the first column). Shared anchor requirement: only scenarios anchored
 * to the same forecast cycle version can be compared."
 *
 * Flow:
 *   1. List active scenarios (own + published) the user can view.
 *   2. User picks 1–3 with checkboxes; same-anchor enforcement is shown
 *      inline (rows with mismatched anchors are disabled with a tooltip).
 *   3. Click "Compare" → navigate to `/simulator/compare/:idA/:idB[:idC]`.
 *
 * Backend rejects a compare with mixed anchors at HTTP 409 — the inline
 * disable is purely a UX improvement so the user doesn't get a confusing
 * error after submitting.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, GitCompare, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/shared/Skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { scenariosApi } from '../api/scenariosApi';
import type { ScenarioListItem } from '@/types/api';

/**
 * Scenario list metadata used by selection. We tolerate the backend not
 * exposing `anchor_forecast_version_id` on the list endpoint yet — when the
 * field is missing we treat all scenarios as having the "unknown" anchor and
 * skip same-anchor enforcement. T1 owns the list endpoint extension.
 */
interface ScenarioMaybeAnchor extends ScenarioListItem {
  anchor_forecast_version_id?: number | null;
}

interface CompareSelectionPageProps {
  /** Optional override for back-navigation (defaults to scenario manager). */
  onBack?: () => void;
}

export function CompareSelectionPage({ onBack }: CompareSelectionPageProps) {
  const navigate = useNavigate();
  const [scenarios, setScenarios] = useState<ScenarioMaybeAnchor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    scenariosApi
      .list()
      .then((res) => {
        // Combine own + published; preserve original order. Filter out
        // archived (defensive — backend should already do this).
        const all: ScenarioMaybeAnchor[] = [
          ...res.my_scenarios,
          ...res.published_scenarios,
        ];
        setScenarios(all);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load scenarios');
      })
      .finally(() => setLoading(false));
  }, []);

  // Anchor of the first selected scenario; subsequent picks must match.
  const requiredAnchor = useMemo<number | null | undefined>(() => {
    if (selectedIds.length === 0) return undefined;
    const first = scenarios.find((s) => s.id === selectedIds[0]);
    return first?.anchor_forecast_version_id ?? null;
  }, [selectedIds, scenarios]);

  const handleToggle = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= 3
          ? prev
          : [...prev, id],
    );
  };

  const handleCompare = () => {
    if (!selectedIds.length) return;
    const path = `/simulator/compare/${selectedIds.join('/')}`;
    navigate(path);
  };

  const handleBack = () => {
    if (onBack) onBack();
    else navigate('/simulator');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Scenarios
        </Button>
        <Button
          size="sm"
          disabled={selectedIds.length === 0}
          onClick={handleCompare}
        >
          <GitCompare className="h-4 w-4 mr-1.5" />
          Compare ({selectedIds.length}/3)
        </Button>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">
          Compare Scenarios
        </h2>
        <p className="text-sm text-muted-foreground">
          Select up to 3 scenarios to compare side-by-side with the current
          state. Only scenarios anchored to the same forecast cycle can be
          compared.
        </p>
      </div>

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {error && (
        <div className="px-3 py-2 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && scenarios.length === 0 && (
        <div className="px-4 py-6 rounded-md border border-border bg-card text-sm text-muted-foreground">
          No scenarios yet. Create one from the scenario manager.
        </div>
      )}

      {!loading && !error && scenarios.length > 0 && (
        <ul className="space-y-1">
          {scenarios.map((s) => {
            const checked = selectedIds.includes(s.id);
            const anchor = s.anchor_forecast_version_id;
            // Same-anchor rule: only enforce when both sides have anchor info.
            const anchorMismatch =
              requiredAnchor !== undefined &&
              !checked &&
              anchor !== undefined &&
              requiredAnchor !== undefined &&
              anchor !== requiredAnchor;
            const overLimit = !checked && selectedIds.length >= 3;
            const disabled = overLimit || anchorMismatch;
            return (
              <li key={s.id}>
                <label
                  className={[
                    'flex items-center gap-3 px-3 py-2.5 rounded transition-colors',
                    checked ? 'bg-primary/5 border border-primary/40' : 'border border-transparent',
                    disabled
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:bg-accent cursor-pointer',
                  ].join(' ')}
                >
                  <Checkbox
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={() => handleToggle(s.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {s.name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {s.author_name}
                      {s.description ? ` — ${s.description}` : ''}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[10px] capitalize"
                  >
                    {s.status}
                  </Badge>
                  {anchorMismatch && (
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className="inline-flex items-center text-amber-600 dark:text-amber-400"
                            aria-label="Different anchor"
                          >
                            <AlertTriangle className="h-3.5 w-3.5" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          Different anchor — rebase to match the first
                          selected scenario before comparing.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
