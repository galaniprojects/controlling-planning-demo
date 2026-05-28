/**
 * Stage 2 BTC tile (position 2,2).
 *
 * Mode badge + top 3 charging locations by percentage. Mode is fixed to
 * Automatic for Internal Services (FD-4 removed the manual mode for IS);
 * Offerings can be Manual or Automatic. Click navigates to the existing
 * BTC editor surface in the Charging module.
 *
 * When `to_business_pct = 0` the entity has no BTC profile; we render an
 * empty-state so the tile still occupies its grid slot.
 */
import { useEffect, useState } from 'react';
import { CircuitBoard } from 'lucide-react';
import { ActionCard } from '@/components/shared/ActionCard';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/EmptyState';
import { chargingApi } from '@/api/endpoints';
import { formatPercent } from '@/lib/formatters';
import type { BTCProfileItem, ChargeableEntityType } from '@/types/api';

const DEMO_YEAR = 2026;

interface Props {
  entityId: string;
  entityType: ChargeableEntityType;
  toBusinessPct: number;
  onClick: () => void;
}

export function ServiceStage2BTCTile({
  entityId,
  entityType,
  toBusinessPct,
  onClick,
}: Props) {
  const [profile, setProfile] = useState<BTCProfileItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  const skipFetch = toBusinessPct <= 0;

  useEffect(() => {
    if (skipFetch) {
      setLoading(false);
      setProfile(null);
      setMissing(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMissing(false);
    chargingApi
      .getEntityBTCProfile(entityId, DEMO_YEAR)
      .then((res) => {
        if (!cancelled) setProfile(res);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        // No profile yet for this entity/year — treat as a soft empty,
        // not a hard error (the entity may be brand-new).
        if (msg.toLowerCase().includes('not found')) {
          setMissing(true);
        } else {
          setError(msg);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entityId, skipFetch]);

  // Copy for the no-profile empty state — phrased as a constraint
  // sentence ("Offerings may be Manual or Automatic") rather than a
  // pseudo-badge so it reads as guidance, not as state.
  const noProfileHint =
    entityType === 'InternalService'
      ? 'Internal Services use Automatic mode (UM-derived).'
      : 'Offerings may use Manual or Automatic mode.';

  if (skipFetch) {
    return (
      <ActionCard title="Stage 2 BTC" onClick={onClick}>
        <EmptyState
          icon={CircuitBoard}
          title="Not allocated to business"
          description={`to-business % is 0 — no BTC profile required.`}
          size="sm"
        />
      </ActionCard>
    );
  }

  const topThree = profile
    ? [...profile.lines]
        .sort((a, b) => b.percentage - a.percentage)
        .slice(0, 3)
    : [];

  // Always-true at the badge call site — the JSX below renders the badge
  // only when `profile` is truthy. Kept as a narrow expression to avoid
  // an inline ternary in the JSX.
  const modeBadgeText = profile?.mode === 'automatic' ? 'Automatic' : 'Manual';

  return (
    <ActionCard
      title="Stage 2 BTC"
      loading={loading}
      error={error}
      onClick={onClick}
    >
      {!loading && !error && missing && (
        <EmptyState
          icon={CircuitBoard}
          title="No BTC profile yet"
          description={noProfileHint}
          size="sm"
        />
      )}
      {profile && (
        <div className="space-y-2 mt-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 h-4 font-medium"
            >
              {modeBadgeText}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              year {profile.year}
            </span>
            {profile.allocation_key && (
              <span
                className="text-[10px] text-muted-foreground truncate"
                title={profile.allocation_key}
              >
                · {profile.allocation_key}
              </span>
            )}
          </div>
          {topThree.length > 0 ? (
            <ul className="space-y-1 pt-2 border-t border-border">
              {topThree.map((line) => (
                <li
                  key={line.id}
                  className="flex items-baseline justify-between gap-2 text-xs"
                >
                  <span
                    className="text-foreground truncate"
                    title={line.charging_location_name ?? line.charging_location_id}
                  >
                    {line.charging_location_name ?? line.charging_location_id}
                  </span>
                  <span className="text-muted-foreground tabular-nums shrink-0">
                    {formatPercent(line.percentage, { signed: false })}
                  </span>
                </li>
              ))}
              {profile.lines.length > 3 && (
                <li className="text-[10px] text-muted-foreground/80 italic">
                  + {profile.lines.length - 3} more locations
                </li>
              )}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground pt-2 border-t border-border">
              No charging locations on this profile yet.
            </p>
          )}
        </div>
      )}
    </ActionCard>
  );
}
