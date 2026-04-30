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
import type { ChargingLocationItem, RegionItem, CountryItem } from '@/types/api';
import { LocationLabel } from '@/components/shared/LocationLabel';

interface FormState {
  code: string;
  name: string;
  division: string;
  region_id: string;
  country_id: string;
}
const EMPTY_FORM: FormState = { code: '', name: '', division: '', region_id: '', country_id: '' };

export function ChargingLocationsPanel() {
  const [items, setItems] = useState<ChargingLocationItem[]>([]);
  const [regions, setRegions] = useState<RegionItem[]>([]);
  const [countries, setCountries] = useState<CountryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ChargingLocationItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState<ChargingLocationItem | null>(null);

  const fetchAll = () => {
    setLoading(true);
    Promise.all([
      adminD3Api.getChargingLocations(),
      adminD3Api.getRegions(),
      adminD3Api.getCountries(),
    ])
      .then(([cl, reg, ctry]) => {
        setItems(cl.items);
        setRegions(reg.items);
        setCountries(ctry.items);
      })
      .catch(() => { setItems([]); setRegions([]); setCountries([]); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { fetchAll(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErr(null);
    setDialogOpen(true);
  };
  const openEdit = (it: ChargingLocationItem) => {
    setEditing(it);
    setForm({
      code: it.code,
      name: it.name,
      division: it.division ?? '',
      region_id: it.region_id ?? '',
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
        division: form.division.trim() || null,
        region_id: form.region_id || null,
        country_id: form.country_id || null,
      };
      if (editing) {
        // Update endpoint accepts subset
        await adminD3Api.updateChargingLocation(editing.id, payload);
      } else {
        await adminD3Api.createChargingLocation(payload);
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
    try { await adminD3Api.deactivateChargingLocation(deactivating.id); setDeactivating(null); fetchAll(); } catch { /* ignore */ }
  };

  const filtered = items.filter(
    (it) =>
      !search ||
      it.code.toLowerCase().includes(search.toLowerCase()) ||
      it.name.toLowerCase().includes(search.toLowerCase()) ||
      (it.division ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            <LocationLabel kind="charging" />
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            ~90 KB charging codes used in inter-service distribution and SAP cost flows.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Add Charging Location
        </Button>
      </div>

      <Input
        type="search"
        placeholder="Search by code, name, or division…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <div className="rounded-md border border-border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[120px]">Code</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground">Name</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[120px]">Division</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[100px]">Region</TableHead>
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
                <TableCell className="px-3 py-2 text-sm text-muted-foreground">{it.division || '—'}</TableCell>
                <TableCell className="px-3 py-2 text-sm text-muted-foreground">{it.region_name || '—'}</TableCell>
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
                <TableCell colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No charging locations match
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Charging Location' : 'New Charging Location'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm text-foreground">Code</label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="e.g. CL-DE-MUC"
                  disabled={!!editing}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-foreground">Division</label>
                <Input value={form.division} onChange={(e) => setForm({ ...form, division: e.target.value })} placeholder="optional" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-foreground">Name</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Munich HQ" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm text-foreground">Region</label>
                <Select value={form.region_id || 'none'} onValueChange={(v) => setForm({ ...form, region_id: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Select region" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {regions.map((r) => <SelectItem key={r.id} value={r.id}>{r.code} — {r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-foreground">Country</label>
                <Select value={form.country_id || 'none'} onValueChange={(v) => setForm({ ...form, country_id: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {countries.map((c) => <SelectItem key={c.id} value={c.id}>{c.iso_code} — {c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
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
            <DialogTitle>Deactivate Charging Location</DialogTitle>
            <DialogDescription>
              Deactivate "{deactivating?.code} — {deactivating?.name}"? Existing distributions remain
              unchanged.
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
