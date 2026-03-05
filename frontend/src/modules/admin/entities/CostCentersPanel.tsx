import { useState, useEffect } from 'react';
import { Plus, Pencil, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/shared/Skeleton';
import { referenceApi, adminApi } from '@/api/endpoints';
import type { RefCostCenter } from '@/types/api';
import { EntityFormDialog } from './EntityFormDialog';

interface CostCentersPanelProps {
  onDataChanged: () => void;
}

export function CostCentersPanel({ onDataChanged }: CostCentersPanelProps) {
  const [items, setItems] = useState<RefCostCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editItem, setEditItem] = useState<RefCostCenter | null>(null);
  const [deactivateItem, setDeactivateItem] = useState<RefCostCenter | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  // Dropdown options
  const [locationOpts, setLocationOpts] = useState<{ value: string; label: string }[]>([]);
  const [ccOpts, setCcOpts] = useState<{ value: string; label: string }[]>([]);

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      referenceApi.getCostCenters(),
      referenceApi.getLocations(),
      referenceApi.getCompetenceCenters(),
    ])
      .then(([cc, locs, comps]) => {
        setItems(cc.items);
        setLocationOpts(locs.items.map((l) => ({ value: l.id, label: `${l.city}, ${l.country}` })));
        setCcOpts(comps.items.map((c) => ({ value: c.id, label: c.name })));
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = () => {
    setEditItem(null);
    setFormMode('create');
    setFormOpen(true);
  };

  const handleEdit = (item: RefCostCenter) => {
    setEditItem(item);
    setFormMode('edit');
    setFormOpen(true);
  };

  const handleFormSubmit = async (values: Record<string, string>) => {
    if (formMode === 'create') {
      await adminApi.createCostCenter(values as { name: string; location_id: string; competence_center_id: string });
    } else if (editItem) {
      await adminApi.updateCostCenter(editItem.id, values);
    }
    fetchData();
    onDataChanged();
  };

  const handleDeactivate = async () => {
    if (!deactivateItem) return;
    setDeactivating(true);
    try {
      await adminApi.deactivateCostCenter(deactivateItem.id);
      setDeactivateItem(null);
      fetchData();
      onDataChanged();
    } catch {
      // ignore
    } finally {
      setDeactivating(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-800">Cost Centers</h2>
        <Button size="sm" onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Add New
        </Button>
      </div>

      <div className="rounded-md border border-slate-200 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-3 py-2 text-xs font-medium text-slate-500">Name</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[140px]">Location</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[160px]">Competence Center</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[90px] text-right">Headcount</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[80px]">Status</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} className="hover:bg-slate-50">
                <TableCell className="px-3 py-2 text-sm font-medium text-slate-800">{item.name}</TableCell>
                <TableCell className="px-3 py-2 text-sm text-slate-600">{item.location_name}</TableCell>
                <TableCell className="px-3 py-2 text-sm text-slate-600">{item.competence_center_name}</TableCell>
                <TableCell className="px-3 py-2 text-sm text-slate-600 text-right">{item.headcount}</TableCell>
                <TableCell className="px-3 py-2">
                  <Badge
                    className={
                      item.is_active
                        ? 'bg-green-100 text-green-700 hover:bg-green-100'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-100'
                    }
                  >
                    {item.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell className="px-3 py-2">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleEdit(item)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {item.is_active && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                        onClick={() => setDeactivateItem(item)}
                      >
                        <Ban className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="px-3 py-8 text-center text-sm text-slate-400">
                  No cost centers found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <EntityFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        entityType="cost_center"
        entityLabel="Cost Center"
        initialValues={
          editItem
            ? { name: editItem.name, location_id: editItem.location_id, competence_center_id: editItem.competence_center_id }
            : undefined
        }
        onSubmit={handleFormSubmit}
        dropdownOptions={{
          locationOptions: locationOpts,
          competenceCenterOptions: ccOpts,
        }}
      />

      {/* Deactivation confirmation */}
      <Dialog open={!!deactivateItem} onOpenChange={() => setDeactivateItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate Cost Center</DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate "{deactivateItem?.name}"? Historical
              data will be preserved, but this cost center will be excluded from future
              planning views.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateItem(null)} disabled={deactivating}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeactivate} disabled={deactivating}>
              {deactivating ? 'Deactivating...' : 'Deactivate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
