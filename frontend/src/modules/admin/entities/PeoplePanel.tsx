import { useState, useEffect } from 'react';
import { Plus, Pencil, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/shared/Skeleton';
import { referenceApi, adminApi } from '@/api/endpoints';
import type { RefPerson } from '@/types/api';
import { EntityFormDialog } from './EntityFormDialog';

function utilizationColor(pct: number): string {
  if (pct > 100) return 'text-red-700 bg-red-50';
  if (pct >= 90) return 'text-amber-700 bg-amber-50';
  if (pct >= 70) return 'text-green-700 bg-green-50';
  return 'text-blue-700 bg-blue-50';
}

interface PeoplePanelProps {
  onDataChanged: () => void;
}

export function PeoplePanel({ onDataChanged }: PeoplePanelProps) {
  const [items, setItems] = useState<RefPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editItem, setEditItem] = useState<RefPerson | null>(null);
  const [deactivateItem, setDeactivateItem] = useState<RefPerson | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  // Dropdown options
  const [roleOpts, setRoleOpts] = useState<{ value: string; label: string }[]>([]);
  const [ccOpts, setCcOpts] = useState<{ value: string; label: string }[]>([]);
  const [compCenterOpts, setCompCenterOpts] = useState<{ value: string; label: string }[]>([]);

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      referenceApi.getPeople(),
      referenceApi.getRoles(),
      referenceApi.getCostCenters(),
      referenceApi.getCompetenceCenters(),
    ])
      .then(([people, roles, ccs, compCenters]) => {
        setItems(people.items);
        setRoleOpts(roles.items.map((r) => ({ value: r.id, label: r.name })));
        setCcOpts(ccs.items.map((c) => ({ value: c.id, label: c.name })));
        setCompCenterOpts(compCenters.items.map((c) => ({ value: c.id, label: c.name })));
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

  const handleEdit = (item: RefPerson) => {
    setEditItem(item);
    setFormMode('edit');
    setFormOpen(true);
  };

  const handleFormSubmit = async (values: Record<string, string>) => {
    if (formMode === 'create') {
      await adminApi.createPerson({
        name: values.name,
        role_type_id: values.role_type_id,
        cost_center_id: values.cost_center_id || undefined,
        competence_center_id: values.competence_center_id || undefined,
      });
    } else if (editItem) {
      await adminApi.updatePerson(editItem.id, values);
    }
    fetchData();
    onDataChanged();
  };

  const handleDeactivate = async () => {
    if (!deactivateItem) return;
    setDeactivating(true);
    try {
      await adminApi.deactivatePerson(deactivateItem.id);
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
        <h2 className="text-base font-semibold text-slate-800">People</h2>
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
              <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[150px]">Role</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[160px]">Cost Center</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[160px]">Competence Center</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[100px] text-right">Utilization</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[80px]">Status</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} className="hover:bg-slate-50">
                <TableCell className="px-3 py-2 text-sm font-medium text-slate-800">{item.name}</TableCell>
                <TableCell className="px-3 py-2 text-sm text-slate-600">{item.role_name}</TableCell>
                <TableCell className="px-3 py-2 text-sm text-slate-600">{item.cost_center_name || '—'}</TableCell>
                <TableCell className="px-3 py-2 text-sm text-slate-600">{item.competence_center_name || '—'}</TableCell>
                <TableCell className="px-3 py-2 text-right">
                  {item.is_active ? (
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${utilizationColor(item.utilization_pct)}`}
                    >
                      {item.utilization_pct}%
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </TableCell>
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
                <TableCell colSpan={7} className="px-3 py-8 text-center text-sm text-slate-400">
                  No people found
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
        entityType="person"
        entityLabel="Person"
        initialValues={
          editItem
            ? {
                name: editItem.name,
                role_type_id: editItem.role_type_id,
                cost_center_id: editItem.cost_center_id ?? '',
                competence_center_id: editItem.competence_center_id ?? '',
              }
            : undefined
        }
        onSubmit={handleFormSubmit}
        dropdownOptions={{
          roleOptions: roleOpts,
          costCenterOptions: ccOpts,
          competenceCenterOptions: compCenterOpts,
        }}
      />

      {/* Deactivation confirmation */}
      <Dialog open={!!deactivateItem} onOpenChange={() => setDeactivateItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate Person</DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate "{deactivateItem?.name}"? Historical
              allocations and change requests will be preserved.
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
