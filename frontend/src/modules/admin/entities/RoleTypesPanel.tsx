import { useEffect, useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/shared/Skeleton';
import { adminD3Api } from '@/api/endpoints';
import type { RoleTypeItem } from '@/types/api';

export function RoleTypesPanel() {
  const [items, setItems] = useState<RoleTypeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RoleTypeItem | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fetchData = () => {
    setLoading(true);
    adminD3Api
      .getRoleTypes()
      .then((res) => setItems(res.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { fetchData(); }, []);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setErr(null);
    setDialogOpen(true);
  };
  const openEdit = (item: RoleTypeItem) => {
    setEditing(item);
    setName(item.name);
    setErr(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) { setErr('Name is required'); return; }
    setSaving(true);
    setErr(null);
    try {
      if (editing) {
        await adminD3Api.updateRoleType(editing.id, { name: name.trim() });
      } else {
        await adminD3Api.createRoleType({ name: name.trim() });
      }
      setDialogOpen(false);
      fetchData();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Role Types</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Job role catalogue used in capacity planning and rate tables.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Add Role Type
        </Button>
      </div>

      <div className="rounded-md border border-border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[120px]">ID</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground">Name</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it) => (
              <TableRow key={it.id} className="hover:bg-accent">
                <TableCell className="px-3 py-2 text-xs font-mono text-muted-foreground">{it.id}</TableCell>
                <TableCell className="px-3 py-2 text-sm font-medium text-foreground">{it.name}</TableCell>
                <TableCell className="px-3 py-2">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(it)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No role types found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Role Type' : 'New Role Type'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm text-foreground">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Backend Engineer" />
            {err && <p className="text-xs text-red-600">{err}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
