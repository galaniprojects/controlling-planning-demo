import { useEffect, useState } from 'react';
import { Plus, Pencil, Ban, ShieldCheck, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
import { adminD3Api, referenceApi } from '@/api/endpoints';
import type { UserItem, RefPerson } from '@/types/api';

const ROLE_OPTIONS = [
  { value: 'controller', label: 'Controller' },
  { value: 'cc_owner', label: 'CC Owner' },
  { value: 'project_lead', label: 'Project Lead' },
  { value: 'executive', label: 'Executive' },
];

interface FormState {
  username: string;
  display_name: string;
  role: string;
  person_id: string;
  tier3_flag: boolean;
  change_reviewer_flag: boolean;
}
const EMPTY: FormState = {
  username: '',
  display_name: '',
  role: 'project_lead',
  person_id: '',
  tier3_flag: false,
  change_reviewer_flag: false,
};

export function UsersPanel() {
  const [items, setItems] = useState<UserItem[]>([]);
  const [people, setPeople] = useState<RefPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UserItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState<UserItem | null>(null);

  const fetchAll = () => {
    setLoading(true);
    Promise.all([adminD3Api.getUsers(), referenceApi.getPeople()])
      .then(([u, p]) => {
        setItems(u.items);
        setPeople(p.items);
      })
      .catch(() => { setItems([]); setPeople([]); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { fetchAll(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setErr(null);
    setDialogOpen(true);
  };
  const openEdit = (it: UserItem) => {
    setEditing(it);
    setForm({
      username: it.username,
      display_name: it.display_name,
      role: it.role,
      person_id: it.person_id ?? '',
      tier3_flag: it.tier3_flag,
      change_reviewer_flag: it.change_reviewer_flag,
    });
    setErr(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.username.trim() || !form.display_name.trim() || !form.role) {
      setErr('Username, display name and role are required');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      if (editing) {
        await adminD3Api.updateUser(editing.id, {
          display_name: form.display_name.trim(),
          role: form.role,
          person_id: form.person_id || null,
          tier3_flag: form.tier3_flag,
          change_reviewer_flag: form.change_reviewer_flag,
        });
      } else {
        await adminD3Api.createUser({
          username: form.username.trim(),
          display_name: form.display_name.trim(),
          role: form.role,
          person_id: form.person_id || null,
          tier3_flag: form.tier3_flag,
          change_reviewer_flag: form.change_reviewer_flag,
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

  const handleDeactivate = async () => {
    if (!deactivating) return;
    try { await adminD3Api.deactivateUser(deactivating.id); setDeactivating(null); fetchAll(); } catch { /* ignore */ }
  };

  const filtered = items.filter((it) => {
    if (roleFilter !== 'all' && it.role !== roleFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!it.username.toLowerCase().includes(s) && !it.display_name.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Users</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Application users with role + Tier-3 simulator and change-reviewer flags.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Add User
        </Button>
      </div>

      <div className="flex gap-2">
        <Input
          type="search"
          placeholder="Search by username or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {ROLE_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border border-border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[140px]">Username</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground">Display Name</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[120px]">Role</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[100px] text-center">Tier 3</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[140px] text-center">Change Reviewer</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[80px]">Status</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((it) => (
              <TableRow key={it.id} className="hover:bg-accent">
                <TableCell className="px-3 py-2 text-xs font-mono text-muted-foreground">{it.username}</TableCell>
                <TableCell className="px-3 py-2 text-sm text-foreground">{it.display_name}</TableCell>
                <TableCell className="px-3 py-2 text-sm text-muted-foreground">
                  {ROLE_OPTIONS.find((r) => r.value === it.role)?.label ?? it.role}
                </TableCell>
                <TableCell className="px-3 py-2 text-center">
                  {it.tier3_flag ? <ShieldCheck className="h-4 w-4 text-primary inline" /> : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="px-3 py-2 text-center">
                  {it.change_reviewer_flag ? <Eye className="h-4 w-4 text-primary inline" /> : <span className="text-muted-foreground">—</span>}
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
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(it)}>
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
                <TableCell colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No users match
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit User' : 'New User'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm text-foreground">Username</label>
                <Input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="e.g. jsmith"
                  disabled={!!editing}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-foreground">Role</label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-foreground">Display Name</label>
              <Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} placeholder="e.g. John Smith" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-foreground">Linked Person (optional)</label>
              <Select value={form.person_id || 'none'} onValueChange={(v) => setForm({ ...form, person_id: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="— None —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.role_name})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 rounded-md border border-border bg-card px-3 py-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Permissions</p>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={form.tier3_flag}
                  onCheckedChange={(v) => setForm({ ...form, tier3_flag: !!v })}
                  className="mt-0.5"
                />
                <span>
                  <span className="text-foreground">Tier 3 simulator access</span>
                  <span className="block text-xs text-muted-foreground">
                    Grants access to sensitive simulator surfaces (delay, remove, reduce actions).
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={form.change_reviewer_flag}
                  onCheckedChange={(v) => setForm({ ...form, change_reviewer_flag: !!v })}
                  className="mt-0.5"
                  disabled={form.role !== 'controller'}
                />
                <span>
                  <span className={form.role !== 'controller' ? 'text-muted-foreground' : 'text-foreground'}>Change reviewer</span>
                  <span className="block text-xs text-muted-foreground">
                    Authorises this controller to approve scheduled-change requests (second-admin review).
                    {form.role !== 'controller' && ' Only available for controllers.'}
                  </span>
                </span>
              </label>
            </div>
            {err && <p className="text-xs text-red-600">{err}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deactivating} onOpenChange={() => setDeactivating(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate User</DialogTitle>
            <DialogDescription>
              Deactivate "{deactivating?.display_name}" ({deactivating?.username})?
              They will lose access on next login.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivating(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeactivate}>Deactivate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
