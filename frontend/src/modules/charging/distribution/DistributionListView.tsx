/**
 * Cross-entity Distribution edges list view per [F-S1-01..03] [F-RV-01].
 * Provides the F4 entry point for the inter-service distribution editor.
 *
 * - Lists every Stage 1 edge for the selected (year, version).
 * - Filters: source entity type, hierarchy node, search.
 * - Each row links to the single-entity editor scoped to the source entity.
 */
import { useEffect, useMemo, useState } from 'react';
import { FilterX } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/EmptyState';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/shared/Skeleton';
import { ArrowRight, Search, Pencil } from 'lucide-react';
import { chargingApi } from '@/api/endpoints';
import type {
  ChargeableEntityItem,
  ChargeableEntityType,
  DistributionEdgeItem,
} from '@/types/api';
import { EntityDistributionEditor } from './EntityDistributionEditor';

// Stable defaults — the spec ties edits to CRETA's standard
// baseline/forecast/actuals lifecycle per [F-S1-04].
const DEFAULT_YEAR = 2026;
const DEFAULT_VERSION = 'forecast';

const ENTITY_TYPE_OPTIONS: { value: 'all' | ChargeableEntityType; label: string }[] = [
  { value: 'all', label: 'All entity types' },
  { value: 'Project', label: 'Projects' },
  { value: 'Offering', label: 'Offerings' },
  { value: 'InternalService', label: 'Internal Services' },
];

export function DistributionListView() {
  const [edges, setEdges] = useState<DistributionEdgeItem[]>([]);
  const [entities, setEntities] = useState<ChargeableEntityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(DEFAULT_YEAR);
  const [version, setVersion] = useState(DEFAULT_VERSION);
  const [entityTypeFilter, setEntityTypeFilter] = useState<'all' | ChargeableEntityType>('all');
  const [search, setSearch] = useState('');
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      chargingApi.listDistributions({ year, version }),
      chargingApi.listEntities({ is_active: true }),
    ])
      .then(([distRes, entRes]) => {
        setEdges(distRes.items);
        setEntities(entRes.items);
      })
      .catch(() => {
        setEdges([]);
        setEntities([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, version]);

  const entityById = useMemo(() => {
    const map = new Map<string, ChargeableEntityItem>();
    entities.forEach((e) => map.set(e.id, e));
    return map;
  }, [entities]);

  const filteredEdges = useMemo(() => {
    const lower = search.trim().toLowerCase();
    return edges.filter((e) => {
      const src = entityById.get(e.source_entity_id);
      const dst = entityById.get(e.destination_entity_id);
      if (entityTypeFilter !== 'all' && src?.entity_type !== entityTypeFilter) return false;
      if (lower) {
        const blob = [
          src?.name ?? '',
          src?.identifier ?? '',
          dst?.name ?? '',
          dst?.identifier ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!blob.includes(lower)) return false;
      }
      return true;
    });
  }, [edges, entityTypeFilter, search, entityById]);

  const sourceCount = useMemo(() => {
    return new Set(filteredEdges.map((e) => e.source_entity_id)).size;
  }, [filteredEdges]);

  const handleClose = () => {
    setSelectedEntityId(null);
    fetchData();
  };

  if (selectedEntityId) {
    return (
      <EntityDistributionEditor
        entityId={selectedEntityId}
        year={year}
        version={version}
        onBack={handleClose}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Edges</p>
          <p className="text-lg font-semibold text-foreground">{filteredEdges.length}</p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Source entities</p>
          <p className="text-lg font-semibold text-foreground">{sourceCount}</p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Year × version</p>
          <p className="text-lg font-semibold text-foreground">
            {year} / {version}
          </p>
        </Card>
      </div>

      {/* Filter bar */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Year
            </label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[100px] h-9">
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
              Version
            </label>
            <Select value={version} onValueChange={setVersion}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="forecast">forecast</SelectItem>
                <SelectItem value="baseline">baseline</SelectItem>
                <SelectItem value="actuals">actuals</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Source type
            </label>
            <Select
              value={entityTypeFilter}
              onValueChange={(v) => setEntityTypeFilter(v as 'all' | ChargeableEntityType)}
            >
              <SelectTrigger className="w-[200px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENTITY_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 flex-1 min-w-[220px]">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Search
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Source / destination identifier or name…"
                className="h-9 pl-8"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Edges table */}
      <Card>
        {loading ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : filteredEdges.length === 0 ? (
          <EmptyState
            icon={FilterX}
            title="No distribution edges"
            description="No edges match the current filters. Adjust the filters above or clear them to see all edges."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source entity</TableHead>
                <TableHead>Type</TableHead>
                <TableHead></TableHead>
                <TableHead>Destination entity</TableHead>
                <TableHead className="text-right">Percentage</TableHead>
                <TableHead className="text-right pr-4">Edit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEdges.map((edge) => {
                const src = entityById.get(edge.source_entity_id);
                const dst = entityById.get(edge.destination_entity_id);
                return (
                  <TableRow key={edge.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">
                          {src?.name ?? edge.source_entity_id}
                        </span>
                        <span className="text-[11px] font-mono text-muted-foreground">
                          {src?.identifier ?? edge.source_entity_id}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {src?.entity_type && (
                        <Badge variant="secondary" className="text-[10px] px-1.5">
                          {src.entity_type}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="px-1">
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm text-foreground">
                          {dst?.name ?? edge.destination_entity_id}
                        </span>
                        <span className="text-[11px] font-mono text-muted-foreground">
                          {dst?.identifier ?? edge.destination_entity_id}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {edge.percentage.toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-right pr-4">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedEntityId(edge.source_entity_id)}
                        title="Open source entity's distribution profile"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
