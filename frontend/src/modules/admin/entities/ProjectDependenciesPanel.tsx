import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/shared/Skeleton';
import { adminD3Api, workbenchApi } from '@/api/endpoints';
import type { ProjectDependencyItem, WorkbenchProjectListItem } from '@/types/api';

const DEPENDENCY_TYPES = [
  { value: 'finish_to_start', label: 'Finish-to-Start' },
  { value: 'start_to_start', label: 'Start-to-Start' },
  { value: 'finish_to_finish', label: 'Finish-to-Finish' },
  { value: 'start_to_finish', label: 'Start-to-Finish' },
];

interface FormState {
  predecessor_project_id: string;
  successor_project_id: string;
  dependency_type: string;
  lag_days: string;
  notes: string;
}
const EMPTY: FormState = {
  predecessor_project_id: '',
  successor_project_id: '',
  dependency_type: 'finish_to_start',
  lag_days: '',
  notes: '',
};

export function ProjectDependenciesPanel() {
  const [items, setItems] = useState<ProjectDependencyItem[]>([]);
  const [projects, setProjects] = useState<WorkbenchProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectDependencyItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ProjectDependencyItem | null>(null);

  const fetchAll = () => {
    setLoading(true);
    Promise.all([adminD3Api.getProjectDependencies(), workbenchApi.getProjects()])
      .then(([d, p]) => { setItems(d.items); setProjects(p.items); })
      .catch(() => { setItems([]); setProjects([]); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { fetchAll(); }, []);

  const projectName = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projects) m.set(p.id, p.name);
    return m;
  }, [projects]);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setErr(null); setDialogOpen(true); };
  const openEdit = (it: ProjectDependencyItem) => {
    setEditing(it);
    setForm({
      predecessor_project_id: it.predecessor_project_id,
      successor_project_id: it.successor_project_id,
      dependency_type: it.dependency_type,
      lag_days: it.lag_days != null ? String(it.lag_days) : '',
      notes: it.notes ?? '',
    });
    setErr(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.predecessor_project_id || !form.successor_project_id) {
      setErr('Both predecessor and successor are required');
      return;
    }
    if (form.predecessor_project_id === form.successor_project_id) {
      setErr('Predecessor and successor must differ');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const lag = form.lag_days.trim() ? Number(form.lag_days.trim()) : null;
      if (editing) {
        await adminD3Api.updateProjectDependency(editing.id, {
          dependency_type: form.dependency_type,
          lag_days: lag,
          notes: form.notes.trim() || null,
        });
      } else {
        await adminD3Api.createProjectDependency({
          predecessor_project_id: form.predecessor_project_id,
          successor_project_id: form.successor_project_id,
          dependency_type: form.dependency_type,
          lag_days: lag,
          notes: form.notes.trim() || null,
        });
      }
      setDialogOpen(false);
      fetchAll();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try { await adminD3Api.deleteProjectDependency(deleting.id); setDeleting(null); fetchAll(); } catch { /* ignore */ }
  };

  const filtered = items.filter((it) => {
    if (!search) return true;
    const s = search.toLowerCase();
    const pred = (it.predecessor_project_name ?? projectName.get(it.predecessor_project_id) ?? '').toLowerCase();
    const succ = (it.successor_project_name ?? projectName.get(it.successor_project_id) ?? '').toLowerCase();
    return pred.includes(s) || succ.includes(s) || it.dependency_type.toLowerCase().includes(s);
  });

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Project Dependencies</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Soft inter-project predecessor / successor edges (warn-only, never block).
            Cycle detection runs in the portfolio dependency map.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Add Dependency
        </Button>
      </div>

      <Input
        type="search"
        placeholder="Search by project name or dependency type…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-md"
      />

      <div className="rounded-md border border-border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground">Predecessor</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground">Successor</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[150px]">Type</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[80px] text-right">Lag (days)</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground">Notes</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((it) => (
              <TableRow key={it.id} className="hover:bg-accent">
                <TableCell className="px-3 py-2 text-sm text-foreground">
                  {it.predecessor_project_name ?? projectName.get(it.predecessor_project_id) ?? it.predecessor_project_id}
                </TableCell>
                <TableCell className="px-3 py-2 text-sm text-foreground">
                  {it.successor_project_name ?? projectName.get(it.successor_project_id) ?? it.successor_project_id}
                </TableCell>
                <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                  {DEPENDENCY_TYPES.find((d) => d.value === it.dependency_type)?.label ?? it.dependency_type}
                </TableCell>
                <TableCell className="px-3 py-2 text-sm text-muted-foreground text-right tabular-nums">
                  {it.lag_days ?? '—'}
                </TableCell>
                <TableCell className="px-3 py-2 text-xs text-muted-foreground max-w-[280px] truncate">
                  {it.notes || '—'}
                </TableCell>
                <TableCell className="px-3 py-2">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(it)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                      onClick={() => setDeleting(it)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No dependencies found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Dependency' : 'New Dependency'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm text-foreground">Predecessor Project</label>
              <Select
                value={form.predecessor_project_id}
                onValueChange={(v) => setForm({ ...form, predecessor_project_id: v })}
                disabled={!!editing}
              >
                <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-foreground">Successor Project</label>
              <Select
                value={form.successor_project_id}
                onValueChange={(v) => setForm({ ...form, successor_project_id: v })}
                disabled={!!editing}
              >
                <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm text-foreground">Type</label>
                <Select value={form.dependency_type} onValueChange={(v) => setForm({ ...form, dependency_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEPENDENCY_TYPES.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-foreground">Lag (days, optional)</label>
                <Input
                  type="number"
                  value={form.lag_days}
                  onChange={(e) => setForm({ ...form, lag_days: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-foreground">Notes</label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
            {err && <p className="text-xs text-red-600">{err}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={() => setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Dependency</DialogTitle>
            <DialogDescription>
              Remove the dependency between predecessor and successor? This is a soft constraint;
              project schedules are unaffected, but the dependency map will no longer surface it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
