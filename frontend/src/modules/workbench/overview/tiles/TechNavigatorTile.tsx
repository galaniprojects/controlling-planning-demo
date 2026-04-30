/**
 * Workbench Overview tile (3,3) — Tech Navigator per `[E-04b]`.
 *
 * Compact 2D scatter of value × complexity, with this project's dot
 * highlighted among portfolio peers. Click target: Portfolio Backlog
 * (scrolled to this project).
 */
import { useEffect, useState } from 'react';
import { ActionCard } from '@/components/shared/ActionCard';
import { backlogApi, techNavigatorApi } from '@/api/endpoints';
import { cn } from '@/lib/utils';
import type { TechNavigatorProfile } from '@/types/techNavigator';
import type { RankedBacklogResponse } from '@/types/api';

interface Props {
  projectId: string;
  onClick?: () => void;
}

interface PeerPoint {
  id: string;
  complexity: number;
  value: number;
  composite: number | null;
}

const SCATTER_W = 180;
const SCATTER_H = 110;
const PAD = 12;

function projectXY(complexity: number, value: number) {
  // Both axes are 1..5 — map to scatter coordinates with PAD inset
  const px = PAD + ((complexity - 1) / 4) * (SCATTER_W - 2 * PAD);
  const py = SCATTER_H - PAD - ((value - 1) / 4) * (SCATTER_H - 2 * PAD);
  return { x: px, y: py };
}

export function TechNavigatorTile({ projectId, onClick }: Props) {
  const [profile, setProfile] = useState<TechNavigatorProfile | null>(null);
  const [peers, setPeers] = useState<PeerPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      techNavigatorApi.get(projectId).catch(() => null),
      backlogApi.getBacklog().catch(() => null),
    ])
      .then(([prof, backlog]) => {
        if (cancelled) return;
        setProfile(prof);
        const ps: PeerPoint[] = [];
        const items = (backlog as RankedBacklogResponse | null)?.items ?? [];
        for (const it of items) {
          const c = it.complexity_score;
          const v = it.value_creation_score;
          if (c == null || v == null) continue;
          ps.push({
            id: it.project_id,
            complexity: Number(c),
            value: Number(v),
            composite:
              it.composite_score == null ? null : Number(it.composite_score),
          });
        }
        setPeers(ps);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Load failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const ownC = profile?.complexity_score ?? null;
  const ownV = profile?.value_creation_score ?? null;
  const ownComp = profile?.composite_score ?? null;
  const hasOwnPoint = ownC !== null && ownV !== null;

  return (
    <ActionCard
      title="Tech Navigator"
      onClick={onClick}
      loading={loading}
      error={error}
      isEmpty={!loading && !error && !hasOwnPoint && peers.length === 0}
      emptyState="No Tech Navigator scores recorded."
    >
      {!loading && !error && (peers.length > 0 || hasOwnPoint) && (
        <div className="mt-3 space-y-3">
          <svg
            viewBox={`0 0 ${SCATTER_W} ${SCATTER_H}`}
            width="100%"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Tech Navigator scatter"
            className="bg-muted/30 rounded-md"
          >
            {/* Axes */}
            <line
              x1={PAD}
              y1={SCATTER_H - PAD}
              x2={SCATTER_W - PAD}
              y2={SCATTER_H - PAD}
              stroke="var(--chart-grid)"
              strokeWidth="1"
            />
            <line
              x1={PAD}
              y1={PAD}
              x2={PAD}
              y2={SCATTER_H - PAD}
              stroke="var(--chart-grid)"
              strokeWidth="1"
            />

            {/* Peer dots */}
            {peers
              .filter((p) => p.id !== projectId)
              .map((p) => {
                const { x, y } = projectXY(p.complexity, p.value);
                return (
                  <circle
                    key={p.id}
                    cx={x}
                    cy={y}
                    r={3}
                    className="fill-muted-foreground/40"
                  />
                );
              })}

            {/* Own dot */}
            {hasOwnPoint && (
              <circle
                cx={projectXY(ownC, ownV).x}
                cy={projectXY(ownC, ownV).y}
                r={5}
                className="fill-primary stroke-background"
                strokeWidth="1.5"
              />
            )}

            {/* Axis labels */}
            <text
              x={SCATTER_W / 2}
              y={SCATTER_H - 1}
              textAnchor="middle"
              className={cn('fill-muted-foreground')}
              fontSize="8"
            >
              Complexity →
            </text>
            <text
              x={3}
              y={SCATTER_H / 2}
              transform={`rotate(-90 3 ${SCATTER_H / 2})`}
              textAnchor="middle"
              className={cn('fill-muted-foreground')}
              fontSize="8"
            >
              Value →
            </text>
          </svg>

          <div className="grid grid-cols-3 gap-1 text-[11px]">
            <div>
              <p className="text-muted-foreground text-[10px]">Complexity</p>
              <p className="font-semibold text-foreground tabular-nums">
                {ownC !== null ? ownC.toFixed(2) : '—'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-[10px]">Value</p>
              <p className="font-semibold text-foreground tabular-nums">
                {ownV !== null ? ownV.toFixed(2) : '—'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-[10px]">Composite</p>
              <p className="font-semibold text-foreground tabular-nums">
                {ownComp !== null ? ownComp.toFixed(2) : '—'}
              </p>
            </div>
          </div>
        </div>
      )}
    </ActionCard>
  );
}
