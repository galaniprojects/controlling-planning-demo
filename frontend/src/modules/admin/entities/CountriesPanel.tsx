import { useEffect, useState } from 'react';
import { Plus, Pencil, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/shared/Skeleton';
import { adminD3Api } from '@/api/endpoints';
import type { CountryItem } from '@/types/api';

export function CountriesPanel() {
  const [items, setItems] = useState<CountryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CountryItem | null>(null);
  const [iso, setIso] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState<CountryItem | null>(null);
  const [search, setSearch] = useState('');

  const fetchData = () => {
    setLoading(true);
    adminD3Api
      .getCountries()
      .then((res) => setItems(res.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { fetchData(); }, []);

  const openCreate = () => {
    setEditing(null);
    setIso('');
    setName('');
    setErr(null);
    setDialogOpen(true);
  };
  const openEdit = (it: CountryItem) => {
    setEditing(it);
    setIso(it.iso_code);
    setName(it.name);
    setErr(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!iso.trim() || !name.trim()) { setErr('ISO code and name are required'); return; }
    setSaving(true);
    setErr(null);
    try {
      if (editing) await adminD3Api.updateCountry(editing.id, { iso_code: iso.trim(), name: name.trim() });
      else await adminD3Api.createCountry({ iso_code: iso.trim(), name: name.trim() });
      setDialogOpen(false);
      fetchData();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivating) return;
    try {
      await adminD3Api.deactivateCountry(deactivating.id);
      setDeactivating(null);
      fetchData();
    } catch {
      // ignore
    }
  };

  const filtered = items.filter(
    (it) =>
      !search ||
      it.iso_code.toLowerCase().includes(search.toLowerCase()) ||
      it.name.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Countries</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            ISO country lookup used by Charging Locations and Legal Entities.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Add Country
        </Button>
      </div>

      <Input
        type="search"
        placeholder="Search by ISO code or name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <div className="rounded-md border border-border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[100px]">ISO</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground">Name</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[80px]">Status</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((it) => (
              <TableRow key={it.id} className="hover:bg-accent">
                <TableCell className="px-3 py-2 text-sm font-mono text-foreground">{it.iso_code}</TableCell>
                <TableCell className="px-3 py-2 text-sm text-foreground">{it.name}</TableCell>
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
                <TableCell colSpan={4} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No countries match
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Country' : 'New Country'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm text-foreground">ISO Code</label>
              <Input value={iso} onChange={(e) => setIso(e.target.value.toUpperCase())} maxLength={3} placeholder="e.g. DE" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-foreground">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Germany" />
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
            <DialogTitle>Deactivate Country</DialogTitle>
            <DialogDescription>
              Deactivate "{deactivating?.name}"? It will be hidden from new dropdowns; existing
              records remain unchanged.
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
