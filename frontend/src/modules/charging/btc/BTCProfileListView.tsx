/**
 * Cross-entity BTC Profile list view per [F-S2-01..02].
 *
 * Filters: year, mode, status, entity type, search. Click a row → drill into
 * single-entity editor. Surfaces the per-entity sums-to-100 flag inline so
 * the UM-snapshot rounding artefacts are visible at a glance.
 */
import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/shared/Skeleton';
import { Pencil, Search, Plus, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { chargingApi } from '@/api/endpoints';
import type {
  BTCProfileItem,
  BTCMode,
  BTCStatus,
  ChargeableEntityItem,
  ChargeableEntityType,
} from '@/types/api';
import { EntityBTCProfileEditor } from './EntityBTCProfileEditor';
import { CreateBTCProfileDialog } from './CreateBTCProfileDialog';

const DEFAULT_YEAR = 2026;

type ModeFilter = 'all' | BTCMode;
type StatusFilter = 'all' | BTCStatus;

export function BTCProfileListView() {
  const [profiles, setProfiles] = useState<BTCProfileItem[]>([]);
  const [entities, setEntities] = useState<ChargeableEntityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(DEFAULT_YEAR);
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | ChargeableEntityType>('all');
  const [search, setSearch] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      chargingApi.listBTCProfiles({ year }),
      chargingApi.listEntities({ is_active: true }),
    ])
      .then(([prof, ent]) => {
        setProfiles(prof.items);
        setEntities(ent.items);
      })
      .catch(() => {
        setProfiles([]);
        setEntities([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const entityById = useMemo(() => {
    const map = new Map<string, ChargeableEntityItem>();
    entities.forEach((e) => map.set(e.id, e));
    return map;
  }, [entities]);

  const filtered = useMemo(() => {
    const lower = search.trim().toLowerCase();
    return profiles.filter((p) => {
      if (modeFilter !== 'all' && p.mode !== modeFilter) return false;
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      const ent = entityById.get(p.entity_id);
      if (typeFilter !== 'all' && ent?.entity_type !== typeFilter) return false;
      if (lower) {
        const blob = `${ent?.name ?? ''} ${ent?.identifier ?? ''} ${p.s_code ?? ''}`.toLowerCase();
        if (!blob.includes(lower)) return false;
      }
      return true;
    });
  }, [profiles, modeFilter, statusFilter, typeFilter, search, entityById]);

  const activeCount = filtered.filter((p) => p.status === 'active').length;
  const draftCount = filtered.filter((p) => p.status === 'draft').length;

  if (selectedProfileId !== null) {
    return (
      <EntityBTCProfileEditor
        profileId={selectedProfileId}
        onBack={() => {
          setSelectedProfileId(null);
          fetchData();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Profiles</p>
          <p className="text-lg font-semibold text-foreground">{filtered.length}</p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Active</p>
          <p className="text-lg font-semibold text-foreground">{activeCount}</p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Drafts</p>
          <p className="text-lg font-semibold text-foreground">{draftCount}</p>
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
              Mode
            </label>
            <Select value={modeFilter} onValueChange={(v) => setModeFilter(v as ModeFilter)}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All modes</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="automatic">Automatic</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Status
            </label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Entity type
            </label>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as 'all' | ChargeableEntityType)}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="Project">Projects</SelectItem>
                <SelectItem value="Offering">Offerings</SelectItem>
                <SelectItem value="InternalService">Internal Services</SelectItem>
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
                placeholder="Entity, identifier, or S-code…"
                className="h-9 pl-8"
              />
            </div>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            New profile
          </Button>
        </div>
      </Card>

      {/* Table */}
      <Card>
        {loading ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            No BTC profiles match the current filters.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Entity</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>S-code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Lines</TableHead>
                <TableHead>Sum</TableHead>
                <TableHead className="text-right pr-4">Edit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => {
                const ent = entityById.get(p.entity_id);
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">
                          {ent?.name ?? p.entity_id}
                        </span>
                        <span className="text-[11px] font-mono text-muted-foreground">
                          {ent?.identifier ?? p.entity_id}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {ent?.entity_type && (
                        <Badge variant="secondary" className="text-[10px] px-1.5">
                          {ent.entity_type}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          p.mode === 'automatic'
                            ? 'text-[10px] border-blue-500 text-blue-700 dark:text-blue-400'
                            : 'text-[10px]'
                        }
                      >
                        {p.mode}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {p.s_code ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          p.status === 'active'
                            ? 'text-[10px] border-emerald-500 text-emerald-700 dark:text-emerald-400'
                            : 'text-[10px] border-amber-500 text-amber-700 dark:text-amber-400'
                        }
                      >
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {p.lines.length}
                    </TableCell>
                    <TableCell>
                      {p.sums_to_100 ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      )}
                    </TableCell>
                    <TableCell className="text-right pr-4">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedProfileId(p.id)}
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

      <CreateBTCProfileDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        defaultYear={year}
        existingProfiles={profiles}
        entities={entities}
        onCreated={(id) => {
          setCreateOpen(false);
          setSelectedProfileId(id);
          fetchData();
        }}
      />
    </div>
  );
}
