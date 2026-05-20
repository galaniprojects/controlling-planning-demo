/**
 * ChargeableEntitiesPanel — FD-6 / [F-ADM-01].
 *
 * Admin → Chargeable Entities. Lifecycle CRUD across the three subtypes
 * (Project / Offering / InternalService) with a config-driven form: the set
 * of editable fields per type comes from a frontend ``TYPE_FIELDS`` map
 * paired with the metadata returned by GET /api/admin/chargeable-entity-types.
 *
 * Locked design notes:
 * - Identifier is immutable after create — surfaced as a disabled input with
 *   a helper tooltip on edit (rebinding would invalidate upstream Distribution
 *   edges).
 * - For Project subtype, ``project_id`` is also immutable on edit — same
 *   rationale; create surfaces a Project picker.
 * - Deactivation is one-way matching the Countries pattern. Reactivation is
 *   deferred as a documented open item.
 * - The allocation_key field only renders for InternalService (driven by the
 *   ``supports_allocation_key`` metadata flag).
 *
 * Mirrors the shape of ``CountriesPanel.tsx``: search, table, edit dialog,
 * deactivate confirm dialog.
 */
import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Ban, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip, TooltipContent, TooltipTrigger, TooltipProvider,
} from '@/components/ui/tooltip';
import { Skeleton } from '@/components/shared/Skeleton';
import {
  adminApi, chargeableEntitiesAdminApi, referenceApi, workbenchApi,
} from '@/api/endpoints';
import type {
  ChargeableEntityCreateRequest,
  ChargeableEntityItem,
  ChargeableEntityType,
  ChargeableEntityTypeMetadata,
  ChargeableEntityUpdateRequest,
  RefPerson,
  WorkbenchProjectListItem,
} from '@/types/api';

// ---------------------------------------------------------------------------
// Config-driven form
// ---------------------------------------------------------------------------
//
// Field key universe; ``TYPE_FIELDS`` lists which keys appear per subtype.
// ``identifier`` is rendered always but disabled on edit. ``project_id`` only
// appears for Project; ``allocation_key`` only for InternalService.
type FieldKey =
  | 'identifier'
  | 'name'
  | 'description'
  | 'project_id'
  | 'hierarchy_node_id'
  | 'responsible_person_id'
  | 'to_business_pct'
  | 'annual_cost'
  | 'termination_month'
  | 'allocation_key';

const TYPE_FIELDS: Record<ChargeableEntityType, FieldKey[]> = {
  Project: [
    'identifier', 'name', 'description', 'project_id',
    'hierarchy_node_id', 'responsible_person_id',
    'to_business_pct', 'annual_cost', 'termination_month',
  ],
  Offering: [
    'identifier', 'name', 'description',
    'hierarchy_node_id', 'responsible_person_id',
    'to_business_pct', 'annual_cost', 'termination_month',
  ],
  InternalService: [
    'identifier', 'name', 'description',
    'hierarchy_node_id', 'responsible_person_id',
    'to_business_pct', 'annual_cost', 'termination_month',
    'allocation_key',
  ],
};

interface FormState {
  entity_type: ChargeableEntityType;
  identifier: string;
  name: string;
  description: string;
  project_id: string;
  hierarchy_node_id: string;
  responsible_person_id: string;
  to_business_pct: string;
  annual_cost: string;
  termination_month: string;
  allocation_key: string;
}

const EMPTY_FORM: FormState = {
  entity_type: 'Project',
  identifier: '',
  name: '',
  description: '',
  project_id: '',
  hierarchy_node_id: '',
  responsible_person_id: '',
  to_business_pct: '0',
  annual_cost: '',
  termination_month: '',
  allocation_key: '',
};

// Hierarchy node option shape from adminApi.getGroupingEntities — we only use
// id + name. The endpoint returns the full grouping payload; we narrow it
// locally without importing the more permissive type.
interface HierarchyOption { id: string; name: string }

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

const ALL_TAB = '__all__' as const;
type TypeTab = typeof ALL_TAB | ChargeableEntityType;

export function ChargeableEntitiesPanel() {
  const [items, setItems] = useState<ChargeableEntityItem[]>([]);
  const [types, setTypes] = useState<ChargeableEntityTypeMetadata[]>([]);
  const [people, setPeople] = useState<RefPerson[]>([]);
  const [hierarchyNodes, setHierarchyNodes] = useState<HierarchyOption[]>([]);
  const [projects, setProjects] = useState<WorkbenchProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<TypeTab>(ALL_TAB);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ChargeableEntityItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState<ChargeableEntityItem | null>(null);

  const fetchAll = () => {
    setLoading(true);
    Promise.all([
      chargeableEntitiesAdminApi.listTypes(),
      chargeableEntitiesAdminApi.list({ is_active: null }),
      referenceApi.getPeople(),
      adminApi.getGroupingEntities(),
      workbenchApi.getProjects(),
    ])
      .then(([t, ce, ppl, ge, pr]) => {
        setTypes(t.items);
        setItems(ce.items);
        setPeople(ppl.items);
        setHierarchyNodes(ge.items.map((n) => ({ id: n.id, name: n.name })));
        setProjects(pr.items);
      })
      .catch(() => {
        setTypes([]);
        setItems([]);
        setPeople([]);
        setHierarchyNodes([]);
        setProjects([]);
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => { fetchAll(); }, []);

  const typeMetaByCode = useMemo(() => {
    const map: Partial<Record<ChargeableEntityType, ChargeableEntityTypeMetadata>> = {};
    for (const t of types) map[t.code] = t;
    return map;
  }, [types]);

  const peopleById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of people) m[p.id] = p.name;
    return m;
  }, [people]);
  const hierarchyById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const n of hierarchyNodes) m[n.id] = n.name;
    return m;
  }, [hierarchyNodes]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, entity_type: (types[0]?.code as ChargeableEntityType) || 'Project' });
    setErr(null);
    setDialogOpen(true);
  };
  const openEdit = (it: ChargeableEntityItem) => {
    setEditing(it);
    setForm({
      entity_type: it.entity_type,
      identifier: it.identifier,
      name: it.name,
      description: it.description ?? '',
      project_id: it.project_id ?? '',
      hierarchy_node_id: it.hierarchy_node_id ?? '',
      responsible_person_id: it.responsible_person_id ?? '',
      to_business_pct: String(it.to_business_pct ?? 0),
      annual_cost: it.annual_cost != null ? String(it.annual_cost) : '',
      termination_month: it.termination_month ?? '',
      allocation_key: it.allocation_key ?? '',
    });
    setErr(null);
    setDialogOpen(true);
  };

  const isField = (k: FieldKey) =>
    TYPE_FIELDS[form.entity_type].includes(k);

  const handleSave = async () => {
    if (!form.name.trim()) { setErr('Name is required'); return; }
    if (!editing && !form.identifier.trim()) {
      setErr('Identifier is required');
      return;
    }
    if (
      !editing
      && form.entity_type === 'Project'
      && !form.project_id
    ) {
      setErr('Project link is required for Project subtype');
      return;
    }
    const pct = Number(form.to_business_pct || 0);
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      setErr('To-business % must be between 0 and 100');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const annualCostNum = form.annual_cost.trim() === ''
        ? null
        : Number(form.annual_cost);
      if (annualCostNum !== null && (Number.isNaN(annualCostNum) || annualCostNum < 0)) {
        throw new Error('Annual cost must be a non-negative number');
      }
      if (editing) {
        const patch: ChargeableEntityUpdateRequest = {
          name: form.name.trim(),
          description: form.description.trim() || null,
          hierarchy_node_id: form.hierarchy_node_id || null,
          responsible_person_id: form.responsible_person_id || null,
          to_business_pct: pct,
          annual_cost: annualCostNum,
          termination_month: form.termination_month || null,
        };
        if (isField('allocation_key')) {
          patch.allocation_key = form.allocation_key.trim() || null;
        }
        await chargeableEntitiesAdminApi.update(editing.id, patch);
      } else {
        const body: ChargeableEntityCreateRequest = {
          entity_type: form.entity_type,
          identifier: form.identifier.trim(),
          name: form.name.trim(),
          description: form.description.trim() || null,
          hierarchy_node_id: form.hierarchy_node_id || null,
          responsible_person_id: form.responsible_person_id || null,
          to_business_pct: pct,
          annual_cost: annualCostNum,
          termination_month: form.termination_month || null,
        };
        if (form.entity_type === 'Project') body.project_id = form.project_id;
        if (isField('allocation_key')) {
          body.allocation_key = form.allocation_key.trim() || null;
        }
        await chargeableEntitiesAdminApi.create(body);
      }
      setDialogOpen(false);
      fetchAll();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivating) return;
    try {
      await chargeableEntitiesAdminApi.deactivate(deactivating.id);
      setDeactivating(null);
      fetchAll();
    } catch {
      /* ignore */
    }
  };

  const filtered = items.filter((it) => {
    if (activeTab !== ALL_TAB && it.entity_type !== activeTab) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      it.identifier.toLowerCase().includes(s)
      || it.name.toLowerCase().includes(s)
      || (it.allocation_key ?? '').toLowerCase().includes(s)
    );
  });

  const countsByType = useMemo(() => {
    const c: Record<string, number> = { [ALL_TAB]: items.length };
    for (const t of types) c[t.code] = 0;
    for (const it of items) {
      c[it.entity_type] = (c[it.entity_type] ?? 0) + 1;
    }
    return c;
  }, [items, types]);

  if (loading) return <Skeleton className="h-64 w-full" />;

  const tabs: { id: TypeTab; label: string }[] = [
    { id: ALL_TAB, label: 'All' },
    ...types.map((t) => ({ id: t.code as TypeTab, label: t.label })),
  ];

  const typeBadgeClass = (t: ChargeableEntityType) => {
    if (t === 'Project') {
      return 'bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400';
    }
    if (t === 'Offering') {
      return 'bg-purple-100 text-purple-700 hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400';
    }
    return 'bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400';
  };

  return (
    <TooltipProvider>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Chargeable Entities
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Polymorphic cost-allocation roots across Project, Offering, and
              Internal Service. Identifiers + Project links are immutable after
              create.
            </p>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Add Entity
          </Button>
        </div>

        {/* Type tab strip — driven by listTypes() metadata */}
        <div className="flex gap-1 border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={
                activeTab === t.id
                  ? 'px-3 py-1.5 text-sm font-medium text-primary border-b-2 border-primary -mb-px'
                  : 'px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground'
              }
            >
              {t.label}
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({countsByType[t.id] ?? 0})
              </span>
            </button>
          ))}
        </div>

        <Input
          type="search"
          placeholder="Search by identifier, name, or allocation key…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />

        <div className="rounded-md border border-border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[140px]">
                  Identifier
                </TableHead>
                <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground">
                  Name
                </TableHead>
                <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[140px]">
                  Type
                </TableHead>
                <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[160px]">
                  Owner
                </TableHead>
                <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[180px]">
                  Hierarchy
                </TableHead>
                <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[80px]">
                  Status
                </TableHead>
                <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[100px]">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((it) => (
                <TableRow key={it.id} className="hover:bg-accent">
                  <TableCell className="px-3 py-2 text-sm font-mono text-foreground">
                    {it.identifier}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-sm text-foreground">
                    {it.name}
                  </TableCell>
                  <TableCell className="px-3 py-2">
                    <Badge className={typeBadgeClass(it.entity_type)}>
                      {typeMetaByCode[it.entity_type]?.label ?? it.entity_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-3 py-2 text-sm text-muted-foreground">
                    {it.responsible_person_id
                      ? peopleById[it.responsible_person_id] ?? it.responsible_person_id
                      : '—'}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-sm text-muted-foreground">
                    {it.hierarchy_node_id
                      ? hierarchyById[it.hierarchy_node_id] ?? it.hierarchy_node_id
                      : '—'}
                  </TableCell>
                  <TableCell className="px-3 py-2">
                    <Badge
                      className={
                        it.is_active
                          ? 'bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-muted text-muted-foreground hover:bg-muted'
                      }
                    >
                      {it.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-3 py-2">
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => openEdit(it)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {it.is_active && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                          onClick={() => setDeactivating(it)}
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="px-3 py-8 text-center text-sm text-muted-foreground"
                  >
                    No chargeable entities match
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Create / edit dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editing ? 'Edit Chargeable Entity' : 'New Chargeable Entity'}
              </DialogTitle>
              <DialogDescription>
                {editing
                  ? 'Identifier, type, and Project link are immutable. Other fields can be updated.'
                  : 'Choose a subtype; the form will adapt to the fields meaningful for that type.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              {/* Subtype — only at create time */}
              {!editing && (
                <div className="space-y-1.5">
                  <label className="text-sm text-foreground">Entity Type</label>
                  <Select
                    value={form.entity_type}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, entity_type: v as ChargeableEntityType }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {types.map((t) => (
                        <SelectItem key={t.code} value={t.code}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Identifier — always rendered; disabled on edit */}
              {isField('identifier') && (
                <div className="space-y-1.5">
                  <label className="text-sm text-foreground flex items-center gap-1.5">
                    Identifier
                    {editing && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          Identifier is immutable after creation. Changing it
                          would invalidate upstream Distribution edges.
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </label>
                  <Input
                    value={form.identifier}
                    onChange={(e) => setForm((f) => ({ ...f, identifier: e.target.value }))}
                    disabled={!!editing}
                    placeholder={
                      form.entity_type === 'Project'
                        ? 'IT012345'
                        : form.entity_type === 'Offering'
                          ? 'IT00ABC'
                          : 'ITF12345'
                    }
                  />
                </div>
              )}

              {/* Project link — only for Project subtype */}
              {isField('project_id') && (
                <div className="space-y-1.5">
                  <label className="text-sm text-foreground flex items-center gap-1.5">
                    Linked Project
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        Project links are read-only after create. Rebinding
                        would invalidate upstream Distribution edges.
                      </TooltipContent>
                    </Tooltip>
                  </label>
                  {editing ? (
                    <Input
                      value={form.project_id || '—'}
                      disabled
                    />
                  ) : (
                    <Select
                      value={form.project_id}
                      onValueChange={(v) => setForm((f) => ({ ...f, project_id: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pick a project…" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              {isField('name') && (
                <div className="space-y-1.5">
                  <label className="text-sm text-foreground">Name</label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
              )}

              {isField('description') && (
                <div className="space-y-1.5">
                  <label className="text-sm text-foreground">Description</label>
                  <Input
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>
              )}

              {isField('hierarchy_node_id') && (
                <div className="space-y-1.5">
                  <label className="text-sm text-foreground">Hierarchy Node</label>
                  <Select
                    value={form.hierarchy_node_id || '__none__'}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, hierarchy_node_id: v === '__none__' ? '' : v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      {hierarchyNodes.map((n) => (
                        <SelectItem key={n.id} value={n.id}>
                          {n.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {isField('responsible_person_id') && (
                <div className="space-y-1.5">
                  <label className="text-sm text-foreground">Owner</label>
                  <Select
                    value={form.responsible_person_id || '__none__'}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, responsible_person_id: v === '__none__' ? '' : v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      {people.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {isField('to_business_pct') && (
                  <div className="space-y-1.5">
                    <label className="text-sm text-foreground">To-Business %</label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.1"
                      value={form.to_business_pct}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, to_business_pct: e.target.value }))
                      }
                    />
                  </div>
                )}
                {isField('annual_cost') && (
                  <div className="space-y-1.5">
                    <label className="text-sm text-foreground">Annual Cost (€)</label>
                    <Input
                      type="number"
                      min={0}
                      step="1"
                      value={form.annual_cost}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, annual_cost: e.target.value }))
                      }
                      placeholder="—"
                    />
                  </div>
                )}
              </div>

              {isField('termination_month') && (
                <div className="space-y-1.5">
                  <label className="text-sm text-foreground">Termination Month</label>
                  <Input
                    value={form.termination_month}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, termination_month: e.target.value }))
                    }
                    placeholder="YYYY-MM (optional)"
                    maxLength={7}
                  />
                </div>
              )}

              {isField('allocation_key') && (
                <div className="space-y-1.5">
                  <label className="text-sm text-foreground flex items-center gap-1.5">
                    Allocation Key
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        Free-text legend explaining what this service's raw UM
                        integer means (e.g. "Number of users", "Sales volume,
                        EUR thousands"). Surfaced on the dashboard triple-display.
                      </TooltipContent>
                    </Tooltip>
                  </label>
                  <Input
                    value={form.allocation_key}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, allocation_key: e.target.value }))
                    }
                    placeholder="e.g. Number of users"
                    maxLength={200}
                  />
                </div>
              )}

              {err && <p className="text-xs text-red-600">{err}</p>}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Deactivate confirmation */}
        <Dialog open={!!deactivating} onOpenChange={() => setDeactivating(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Deactivate Chargeable Entity</DialogTitle>
              <DialogDescription>
                Deactivate "{deactivating?.name}"? It will be hidden from new
                dropdowns and reports. Existing Distribution edges and BTC
                profiles remain unchanged. This is one-way; reactivation is not
                yet supported.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeactivating(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeactivate}>
                Deactivate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
