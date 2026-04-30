/**
 * Location Cost Rollup tree-table view per [F-RV-04].
 *
 * Three pre-built rollup paths via dropdown:
 *   - region   → country → charging_location
 *   - division → charging_location
 *   - country  → charging_location
 *
 * Pivot toggle: rows = locations / cols = source dimension OR vice versa.
 * Cell click → drill-down panel below the table with:
 *   - contributing entities + amounts
 *   - upstream chains for each contributor (per [F-RV-04] requirement)
 */
import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronRight, X } from 'lucide-react';
import {
  ExpandableTreeTable,
  type TreeTableColumn,
} from '@/components/shared/ExpandableTreeTable';
import { Skeleton } from '@/components/shared/Skeleton';
import { formatCurrency } from '@/lib/formatters';
import { LocationLabel } from '@/components/shared/LocationLabel';
import { chargingApi } from '@/api/endpoints';
import {
  useChargingRollupData,
  type PerLocationCell,
} from './useChargingRollupData';
import type { UpstreamChainResponse } from '@/types/api';

type RollupPath = 'region_country_loc' | 'division_loc' | 'country_loc';

interface Props {
  year: number;
  version: string;
}

interface TreeNode {
  id: string;
  label: string;
  level: 'region' | 'country' | 'division' | 'location';
  total: number;
  cells: PerLocationCell[];
  children?: TreeNode[];
}

export function RollupTreeTableView({ year, version }: Props) {
  const data = useChargingRollupData({ year, version });
  const [path, setPath] = useState<RollupPath>('region_country_loc');
  const [drillCell, setDrillCell] = useState<PerLocationCell | null>(null);
  const [drillNode, setDrillNode] = useState<TreeNode | null>(null);

  const tree = useMemo<TreeNode[]>(() => {
    const cells = data.cells;
    if (cells.length === 0) return [];

    if (path === 'region_country_loc') {
      const byRegion = new Map<string, Map<string, Map<string, PerLocationCell[]>>>();
      cells.forEach((c) => {
        const r = c.region_name ?? '(Unassigned region)';
        const k = c.country_iso_code ?? '__none__';
        if (!byRegion.has(r)) byRegion.set(r, new Map());
        const cr = byRegion.get(r)!;
        if (!cr.has(k)) cr.set(k, new Map());
        const cc = cr.get(k)!;
        if (!cc.has(c.charging_location_id)) cc.set(c.charging_location_id, []);
        cc.get(c.charging_location_id)!.push(c);
      });
      return Array.from(byRegion.entries())
        .map(([region, countries]) => {
          const countryNodes = Array.from(countries.entries()).map(([_iso, locs]) => {
            const allCells = Array.from(locs.values()).flat();
            const countryName = allCells[0]?.country_name ?? '(Unassigned)';
            const locNodes = Array.from(locs.entries()).map(([cl_id, cs]) => {
              const total = cs.reduce((s, c) => s + c.amount_eur, 0);
              return {
                id: `loc:${cl_id}:${region}:${countryName}`,
                label: cs[0].charging_location_name,
                level: 'location' as const,
                total,
                cells: cs,
              };
            });
            const total = locNodes.reduce((s, n) => s + n.total, 0);
            return {
              id: `country:${countryName}:${region}`,
              label: countryName,
              level: 'country' as const,
              total,
              cells: allCells,
              children: locNodes.sort((a, b) => b.total - a.total),
            };
          });
          const total = countryNodes.reduce((s, n) => s + n.total, 0);
          return {
            id: `region:${region}`,
            label: region,
            level: 'region' as const,
            total,
            cells: countryNodes.flatMap((n) => n.cells),
            children: countryNodes.sort((a, b) => b.total - a.total),
          };
        })
        .sort((a, b) => b.total - a.total);
    }

    if (path === 'division_loc') {
      const byDiv = new Map<string, Map<string, PerLocationCell[]>>();
      cells.forEach((c) => {
        const d = c.division ?? '(Unassigned division)';
        if (!byDiv.has(d)) byDiv.set(d, new Map());
        const inner = byDiv.get(d)!;
        if (!inner.has(c.charging_location_id)) inner.set(c.charging_location_id, []);
        inner.get(c.charging_location_id)!.push(c);
      });
      return Array.from(byDiv.entries())
        .map(([division, locs]) => {
          const locNodes = Array.from(locs.entries()).map(([cl_id, cs]) => {
            const total = cs.reduce((s, c) => s + c.amount_eur, 0);
            return {
              id: `loc:${cl_id}:${division}`,
              label: cs[0].charging_location_name,
              level: 'location' as const,
              total,
              cells: cs,
            };
          });
          const total = locNodes.reduce((s, n) => s + n.total, 0);
          return {
            id: `div:${division}`,
            label: division,
            level: 'division' as const,
            total,
            cells: locNodes.flatMap((n) => n.cells),
            children: locNodes.sort((a, b) => b.total - a.total),
          };
        })
        .sort((a, b) => b.total - a.total);
    }

    // country_loc
    const byCtry = new Map<string, Map<string, PerLocationCell[]>>();
    cells.forEach((c) => {
      const k = c.country_iso_code ?? '__none__';
      if (!byCtry.has(k)) byCtry.set(k, new Map());
      const inner = byCtry.get(k)!;
      if (!inner.has(c.charging_location_id)) inner.set(c.charging_location_id, []);
      inner.get(c.charging_location_id)!.push(c);
    });
    return Array.from(byCtry.entries())
      .map(([_iso, locs]) => {
        const cs0 = Array.from(locs.values()).flat()[0];
        const ctryName = cs0?.country_name ?? '(Unassigned)';
        const locNodes = Array.from(locs.entries()).map(([cl_id, cs]) => {
          const total = cs.reduce((s, c) => s + c.amount_eur, 0);
          return {
            id: `loc:${cl_id}:${ctryName}`,
            label: cs[0].charging_location_name,
            level: 'location' as const,
            total,
            cells: cs,
          };
        });
        const total = locNodes.reduce((s, n) => s + n.total, 0);
        return {
          id: `country:${ctryName}`,
          label: ctryName,
          level: 'country' as const,
          total,
          cells: locNodes.flatMap((n) => n.cells),
          children: locNodes.sort((a, b) => b.total - a.total),
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [data.cells, path]);

  const columns: TreeTableColumn<TreeNode>[] = [
    {
      header: 'Group',
      accessor: (n) => (
        <span className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {n.level}
          </Badge>
          <span>{n.label}</span>
        </span>
      ),
      className: 'min-w-[280px]',
    },
    {
      header: 'Lines',
      accessor: (n) => (
        <span className="text-xs text-muted-foreground">
          {n.cells.length}
        </span>
      ),
      className: 'text-right',
    },
    {
      header: 'Total amount (€)',
      accessor: (n) => (
        <span className="font-mono tabular-nums text-sm text-foreground">
          {formatCurrency(n.total)}
        </span>
      ),
      className: 'text-right',
    },
    {
      header: '',
      accessor: (n) =>
        n.level === 'location' ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              setDrillNode(n);
              setDrillCell(null);
            }}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        ) : null,
      className: 'text-right pr-3',
    },
  ];

  return (
    <div className="space-y-3">
      {/* Controls */}
      <Card className="p-3 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Rollup path
          </label>
          <Select value={path} onValueChange={(v) => setPath(v as RollupPath)}>
            <SelectTrigger className="w-[280px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="region_country_loc">
                Region → Country → Charging Location
              </SelectItem>
              <SelectItem value="division_loc">Division → Charging Location</SelectItem>
              <SelectItem value="country_loc">Country → Charging Location</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="text-xs text-muted-foreground">
          {data.cells.length} <LocationLabel kind="charging" /> lines · year {year} · {version}
        </div>
      </Card>

      {/* Tree table */}
      <Card className="p-0">
        {data.loading ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : tree.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            No data — Stage 2 BTC profiles emit no allocations for {year}.
          </div>
        ) : (
          <ExpandableTreeTable
            data={tree}
            columns={columns}
            defaultExpanded={new Set(tree.slice(0, 1).map((n) => n.id))}
          />
        )}
      </Card>

      {drillNode && (
        <DrillDownPanel
          node={drillNode}
          year={year}
          version={version}
          onClose={() => {
            setDrillNode(null);
            setDrillCell(null);
          }}
          onCellClick={setDrillCell}
        />
      )}

      {drillCell && (
        <UpstreamChainPanel
          cell={drillCell}
          year={year}
          version={version}
          onClose={() => setDrillCell(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drill-down: contributing entities for a charging location node.
// ---------------------------------------------------------------------------
interface DrillDownProps {
  node: TreeNode;
  year: number;
  version: string;
  onClose: () => void;
  onCellClick: (cell: PerLocationCell) => void;
}

function DrillDownPanel({ node, onClose, onCellClick }: DrillDownProps) {
  const sortedCells = useMemo(
    () => [...node.cells].sort((a, b) => b.amount_eur - a.amount_eur),
    [node.cells],
  );

  return (
    <Card className="p-4 border-primary/40">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Contributing entities
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {node.label} · {sortedCells.length} entities · total {formatCurrency(node.total)}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="space-y-1">
        {sortedCells.map((c) => (
          <button
            key={`${c.entity_id}-${c.charging_location_id}`}
            onClick={() => onCellClick(c)}
            className="flex items-center justify-between w-full px-2 py-1.5 rounded hover:bg-accent text-left text-sm gap-3"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Badge variant="secondary" className="text-[10px] px-1.5 shrink-0">
                {c.entity_type}
              </Badge>
              <span className="truncate text-foreground">{c.entity_name}</span>
              <span className="text-[11px] font-mono text-muted-foreground shrink-0">
                {c.identifier}
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
                {c.percentage.toFixed(2)}%
              </span>
              <span className="font-mono tabular-nums text-foreground">
                {formatCurrency(c.amount_eur)}
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Upstream chain panel: shows DAG paths for the contributing entity.
// ---------------------------------------------------------------------------
interface UpstreamProps {
  cell: PerLocationCell;
  year: number;
  version: string;
  onClose: () => void;
}

function UpstreamChainPanel({ cell, year, version, onClose }: UpstreamProps) {
  const [chain, setChain] = useState<UpstreamChainResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    chargingApi
      .getEntityUpstreamChain(cell.entity_id, year, version)
      .then(setChain)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Load failed'))
      .finally(() => setLoading(false));
  }, [cell.entity_id, year, version]);

  return (
    <Card className="p-4 border-primary/40">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Upstream chain · {cell.entity_name}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            How this entity's effective cost flows from the source(s) of the DAG.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      {loading ? (
        <Skeleton className="h-12 w-full" />
      ) : error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : !chain || chain.paths.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No upstream edges — this entity is its own source.
        </p>
      ) : (
        <ul className="space-y-1">
          {chain.paths.map((p, idx) => (
            <li
              key={idx}
              className="text-xs font-mono text-muted-foreground flex flex-wrap gap-1.5 items-center"
            >
              {p.map((id, i) => (
                <span key={`${id}-${i}`} className="flex items-center gap-1.5">
                  {i > 0 && <ChevronRight className="h-3 w-3" />}
                  <span
                    className={
                      i === p.length - 1
                        ? 'font-medium text-foreground'
                        : 'text-muted-foreground'
                    }
                  >
                    {id}
                  </span>
                </span>
              ))}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
