/**
 * RunCostDistributionsTab — the new "Cost Distributions" tab on the Run
 * Portfolio sub-module (VIPER Wave 5, spec §10).
 *
 * A Rollup + Cascade hybrid:
 *   - Rollup mode (default): accumulated Run cost grouped by the selected
 *     dimension. For Line of Business / Program it renders the hierarchy org
 *     tree (LoB → Program → entity) with cost rolling up — sourced from
 *     `portfolioApi.getRunCostTree`, which honours the node-vs-level rule so a
 *     Program-attached entity rolls into its parent LoB when grouping by LoB.
 *     For Region / Division / Country it reuses the flat
 *     `chargingApi.getRollup` summary via `RunDimensionRollupPanel`.
 *     Clicking a leaf entity switches to Cascade mode for that entity.
 *   - Cascade mode: the shared vertical allocation-flow visual for the
 *     selected Offering / Internal Service.
 *
 * A `[Roll-up | Cascade]` switch plus a `[Group by ▾] [Filter ▾]` bar and a
 * year selector (Run default 2026) sit above the canvas. Competence Center is
 * intentionally excluded — it is not a level in the active grouping hierarchy.
 */
import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/shared/Skeleton';
import {
  ExpandableTreeTable,
  type TreeTableColumn,
} from '@/components/shared/ExpandableTreeTable';
import { cn } from '@/lib/utils';
import { portfolioApi, chargeableEntitiesApi } from '@/api/endpoints';
import { formatCurrency } from '@/lib/formatters';
import type {
  ChargeableEntityItem,
  ChargeableEntityType,
  RunCostTreeGroupBy,
  RunCostTreeNode,
  RunCostTreeResponse,
} from '@/types/runPortfolio';
import { RunDimensionRollupPanel } from './RunDimensionRollupPanel';
import { RunCascadePanel } from './RunCascadePanel';

type GroupBy = 'lob' | 'program' | 'region' | 'division' | 'country';
type Mode = 'rollup' | 'cascade';

// Run evaluated-year default — matches the Run tab + Charging module.
const YEAR_DEFAULT = 2026;
const YEAR_OPTIONS = [2025, 2026, 2027];

const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'lob', label: 'Line of Business' },
  { value: 'program', label: 'Program' },
  { value: 'region', label: 'Region' },
  { value: 'division', label: 'Division' },
  { value: 'country', label: 'Country' },
];

const HIERARCHY_DIMS: GroupBy[] = ['lob', 'program'];

const GEO_TITLES: Record<'region' | 'division' | 'country', string> = {
  region: 'By region',
  division: 'By division',
  country: 'By country',
};

function isHierarchyDim(g: GroupBy): g is RunCostTreeGroupBy {
  return HIERARCHY_DIMS.includes(g);
}

/** Depth-first lookup of a node by id within the cost tree. */
function findNode(
  nodes: RunCostTreeNode[],
  id: string,
): RunCostTreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findNode(n.children, id);
    if (hit) return hit;
  }
  return null;
}

function entityTypePill(type: ChargeableEntityType): string {
  switch (type) {
    case 'Offering':
      return 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400';
    case 'InternalService':
      return 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400';
    default:
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
  }
}

function entityTypeShort(type: ChargeableEntityType): string {
  if (type === 'InternalService') return 'Internal Svc';
  return type;
}

export function RunCostDistributionsTab() {
  const [mode, setMode] = useState<Mode>('rollup');
  const [groupBy, setGroupBy] = useState<GroupBy>('lob');
  const [year, setYear] = useState<number>(YEAR_DEFAULT);
  const [filterNode, setFilterNode] = useState<string | null>(null);
  const [cascadeEntityId, setCascadeEntityId] = useState<string | null>(null);

  const [tree, setTree] = useState<RunCostTreeResponse | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);

  // Run offerings + internal services for the standalone Cascade-mode picker.
  const [entities, setEntities] = useState<ChargeableEntityItem[]>([]);

  const hierarchy = isHierarchyDim(groupBy);

  // Cost-tree fetch (LoB / Program only). Geo dims drive RunDimensionRollupPanel.
  useEffect(() => {
    if (!hierarchy) {
      setTree(null);
      setTreeError(null);
      return;
    }
    let cancelled = false;
    setTreeLoading(true);
    setTreeError(null);
    portfolioApi
      .getRunCostTree({ group_by: groupBy, year })
      .then((res) => {
        if (!cancelled) setTree(res);
      })
      .catch((e) => {
        if (cancelled) return;
        setTreeError(
          e instanceof Error ? e.message : 'Cost tree unavailable',
        );
        setTree(null);
      })
      .finally(() => {
        if (!cancelled) setTreeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [groupBy, year, hierarchy]);

  // Run entity list for the Cascade picker (offerings + internal services).
  useEffect(() => {
    let cancelled = false;
    chargeableEntitiesApi
      .list({ is_active: true })
      .then((res) => {
        if (cancelled) return;
        setEntities(
          res.items.filter(
            (e) =>
              e.is_change_or_run === 'Run' && e.entity_type !== 'Project',
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setEntities([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Group-node options for the Filter control (hierarchy dims only).
  const filterOptions = useMemo(() => {
    if (!tree) return [] as { id: string; name: string }[];
    const out: { id: string; name: string }[] = [];
    const walk = (nodes: RunCostTreeNode[]) => {
      for (const n of nodes) {
        if (n.kind === 'group') {
          out.push({ id: n.id, name: n.name });
          walk(n.children);
        }
      }
    };
    walk(tree.nodes);
    return out;
  }, [tree]);

  // Client-side descendant-inclusive scope: when a node is chosen, show just
  // that subtree (the node already carries its rolled cost + descendants).
  const displayedNodes = useMemo(() => {
    if (!tree) return [] as RunCostTreeNode[];
    if (!filterNode) return tree.nodes;
    const found = findNode(tree.nodes, filterNode);
    return found ? [found] : tree.nodes;
  }, [tree, filterNode]);

  const grandTotal = useMemo(() => {
    if (!tree) return 0;
    if (filterNode) {
      const f = findNode(tree.nodes, filterNode);
      return f ? f.rolled_cost : tree.grand_total;
    }
    return tree.grand_total;
  }, [tree, filterNode]);

  const columns: TreeTableColumn<RunCostTreeNode>[] = useMemo(
    () => [
      {
        header: 'Name',
        accessor: (n) =>
          n.kind === 'entity' ? (
            <span className="inline-flex items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
                  entityTypePill(n.entity_type ?? 'Offering'),
                )}
              >
                {entityTypeShort(n.entity_type ?? 'Offering')}
              </span>
              <span className="text-sm text-foreground">{n.name}</span>
            </span>
          ) : (
            <span className="text-sm font-medium text-foreground">
              {n.name}
            </span>
          ),
      },
      {
        header: 'Identifier',
        className: 'w-36',
        accessor: (n) =>
          n.identifier ? (
            <span className="font-mono text-xs text-muted-foreground">
              {n.identifier}
            </span>
          ) : (
            <span className="text-muted-foreground/40">—</span>
          ),
      },
      {
        header: 'Entities',
        className: 'text-right w-24',
        accessor: (n) => (
          <span className="tabular-nums text-muted-foreground">
            {n.entity_count}
          </span>
        ),
      },
      {
        header: 'Rolled cost',
        className: 'text-right w-40',
        accessor: (n) => (
          <span className="tabular-nums text-foreground">
            {formatCurrency(n.rolled_cost)}
          </span>
        ),
      },
    ],
    [],
  );

  const defaultExpanded = useMemo(
    () => new Set(displayedNodes.map((n) => n.id)),
    [displayedNodes],
  );

  function handleGroupByChange(next: GroupBy) {
    setGroupBy(next);
    setFilterNode(null);
  }

  function openCascade(entityId: string) {
    setCascadeEntityId(entityId);
    setMode('cascade');
  }

  return (
    <div className="space-y-4">
      {/* Controls: mode switch + group-by + filter + year */}
      <div className="flex flex-wrap items-end gap-3">
        {/* Mode switch */}
        <div
          role="group"
          aria-label="Cost distribution view mode"
          className="inline-flex rounded-md border border-border p-0.5"
        >
          <ModeButton
            active={mode === 'rollup'}
            onClick={() => setMode('rollup')}
            label="Roll-up"
          />
          <ModeButton
            active={mode === 'cascade'}
            onClick={() => setMode('cascade')}
            label="Cascade"
          />
        </div>

        {mode === 'rollup' && (
          <>
            <Labelled label="Group by">
              <Select
                value={groupBy}
                onValueChange={(v) => handleGroupByChange(v as GroupBy)}
              >
                <SelectTrigger className="h-9 min-w-[180px] text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GROUP_BY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Labelled>

            {hierarchy && filterOptions.length > 0 && (
              <Labelled label="Filter">
                <Select
                  value={filterNode ?? 'all'}
                  onValueChange={(v) =>
                    setFilterNode(v === 'all' ? null : v)
                  }
                >
                  <SelectTrigger className="h-9 min-w-[200px] text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All nodes</SelectItem>
                    {filterOptions.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Labelled>
            )}
          </>
        )}

        <Labelled label="Year">
          <Select
            value={String(year)}
            onValueChange={(v) => setYear(Number(v))}
          >
            <SelectTrigger className="h-9 w-[100px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEAR_OPTIONS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Labelled>
      </div>

      {mode === 'cascade' ? (
        cascadeEntityId ? (
          <RunCascadePanel
            entityId={cascadeEntityId}
            onBack={() => setMode('rollup')}
          />
        ) : (
          <Card className="p-6 space-y-3">
            <p className="text-sm text-foreground">
              Select an Offering or Internal Service to see its vertical
              allocation cascade.
            </p>
            <Select
              value=""
              onValueChange={(v) => v && openCascade(v)}
            >
              <SelectTrigger className="h-9 min-w-[280px] text-sm">
                <SelectValue placeholder="Choose an entity…" />
              </SelectTrigger>
              <SelectContent>
                {entities.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {entityTypeShort(e.entity_type)} · {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Tip: in Roll-up mode, click any leaf entity row to jump straight
              into its cascade.
            </p>
          </Card>
        )
      ) : hierarchy ? (
        <div className="space-y-2">
          {treeLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : treeError ? (
            <Card className="border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
              <p className="text-sm text-red-800 dark:text-red-300">
                {treeError}
              </p>
            </Card>
          ) : (
            <>
              <ExpandableTreeTable
                key={`${groupBy}:${filterNode ?? 'all'}`}
                data={displayedNodes}
                columns={columns}
                defaultExpanded={defaultExpanded}
                onRowClick={(n) => {
                  if (n.kind === 'entity') openCascade(n.id);
                }}
              />
              <div className="flex items-baseline justify-between px-1">
                <p className="text-xs text-muted-foreground">
                  Click a leaf entity row to open its vertical allocation
                  cascade. Cost rolls up the{' '}
                  {groupBy === 'lob' ? 'Line of Business' : 'Program'}{' '}
                  hierarchy.
                </p>
                <p className="text-sm font-medium text-foreground tabular-nums">
                  Total: {formatCurrency(grandTotal)}
                </p>
              </div>
            </>
          )}
        </div>
      ) : (
        <RunDimensionRollupPanel
          title={GEO_TITLES[groupBy as 'region' | 'division' | 'country']}
          groupBy={groupBy as 'region' | 'division' | 'country'}
          year={year}
        />
      )}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}

function Labelled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
        {label}
      </span>
      {children}
    </div>
  );
}
