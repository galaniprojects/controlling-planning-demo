import { useEffect, useState } from 'react';
import { Plus, Pencil, Ban } from 'lucide-react';
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
import { Skeleton } from '@/components/shared/Skeleton';
import { adminD3Api } from '@/api/endpoints';
import type { LegalEntityItem, ChargingLocationItem, CountryItem } from '@/types/api';
import { LocationLabel } from '../shared/LocationLabel';

interface FormState {
  code: string;
  name: string;
  charging_location_id: string;
  country_id: string;
}
const EMPTY_FORM: FormState = { code: '', name: '', charging_location_id: '', country_id: '' };

export function LegalEntitiesPanel() {
  const [items, setItems] = useState<LegalEntityItem[]>([]);
  const [chargingLocations, setChargingLocations] = useState<ChargingLocationItem[]>([]);
  const [countries, setCountries] = useState<CountryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCL, setFilterCL] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LegalEntityItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState<LegalEntityItem | null>(null);

  const fetchAll = () => {
    setLoading(true);
    Promise.all([
      adminD3Api.getLegalEntities(),
      adminD3Api.getChargingLocations(),
      adminD3Api.getCountries(),
    ])
      .then(([le, cl, ctry]) => {
        setItems(le.items);
        setChargingLocations(cl.items);
        setCountries(ctry.items);
      })
      .catch(() => { setItems([]); setChargingLocations([]); setCountries([]); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { fetchAll(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErr(null);
    setDialogOpen(true);
  };
  const openEdit = (it: LegalEntityItem) => {
    setEditing(it);
    setForm({
      code: it.code,
      name: it.name,
      charging_location_id: it.charging_location_id ?? '',
      country_id: it.country_id ?? '',
    });
    setErr(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim()) { setErr('Code and name are required'); return; }
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        charging_location_id: form.charging_location_id || null,
        country_id: form.country_id || null,
      };
      if (editing) await adminD3Api.updateLegalEntity(editing.id, payload);
      else await adminD3Api.createLegalEntity(payload);
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
    try { await adminD3Api.deactivateLegalEntity(deactivating.id); setDeactivating(null); fetchAll(); } catch { /* ignore */ }
  };

  const filtered = items.filter((it) => {
    if (filterCL !== 'all' && it.charging_location_id !== filterCL) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!it.code.toLowerCase().includes(s) && !it.name.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            <LocationLabel kind="legal" />
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            ~120 KB registered companies, with many-to-one rollup to a Charging Location.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Add Legal Entity
        </Button>
      </div>

      <div className="flex gap-2">
        <Input
          type="search"
          placeholder="Search by code or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={filterCL} onValueChange={setFilterCL}>
          <SelectTrigger className="w-[280px]">
            <SelectValue placeholder="Filter by Charging Location" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Charging Locations</SelectItem>
            {chargingLocations.map((cl) => (
              <SelectItem key={cl.id} value={cl.id}>{cl.code} — {cl.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border border-border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[120px]">Code</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground">Name</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[200px]">
                Charging Location (rollup)
              </TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[140px]">Country</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[80px]">Status</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((it) => (
              <TableRow key={it.id} className="hover:bg-accent">
                <TableCell className="px-3 py-2 text-sm font-mono text-foreground">{it.code}</TableCell>
                <TableCell className="px-3 py-2 text-sm text-foreground">{it.name}</TableCell>
                <TableCell className="px-3 py-2 text-sm text-muted-foreground">
                  {it.charging_location_code
                    ? <span className="font-mono text-xs">{it.charging_location_code}</span>
                    : '—'}
                  {it.charging_location_name ? ` — ${it.charging_location_name}` : ''}
                </TableCell>
                <TableCell className="px-3 py-2 text-sm text-muted-foreground">
                  {it.country_iso_code ? `${it.country_iso_code} — ${it.country_name}` : '—'}
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
                <TableCell colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No legal entities match
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Legal Entity' : 'New Legal Entity'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm text-foreground">Code</label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="e.g. KB-DE-001"
                  disabled={!!editing}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-foreground">Country</label>
                <Select value={form.country_id || 'none'} onValueChange={(v) => setForm({ ...form, country_id: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="— None —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {countries.map((c) => <SelectItem key={c.id} value={c.id}>{c.iso_code} — {c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-foreground">Name</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Knorr-Bremse AG" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-foreground flex items-center gap-1.5">
                Rolls up to <LocationLabel kind="charging" iconOnly />
              </label>
              <Select value={form.charging_location_id || 'none'} onValueChange={(v) => setForm({ ...form, charging_location_id: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Select charging location" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {chargingLocations.map((cl) => <SelectItem key={cl.id} value={cl.id}>{cl.code} — {cl.name}</SelectItem>)}
                </SelectContent>
              </Select>
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
            <DialogTitle>Deactivate Legal Entity</DialogTitle>
            <DialogDescription>
              Deactivate "{deactivating?.code} — {deactivating?.name}"?
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
