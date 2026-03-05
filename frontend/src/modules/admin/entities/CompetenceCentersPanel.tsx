import { useState, useEffect } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/shared/Skeleton';
import { referenceApi, adminApi } from '@/api/endpoints';
import type { RefCompetenceCenter } from '@/types/api';
import { formatCurrency } from '@/lib/formatters';
import { EntityFormDialog } from './EntityFormDialog';

interface CompetenceCentersPanelProps {
  onDataChanged: () => void;
}

export function CompetenceCentersPanel({ onDataChanged }: CompetenceCentersPanelProps) {
  const [items, setItems] = useState<RefCompetenceCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editItem, setEditItem] = useState<RefCompetenceCenter | null>(null);

  const fetchData = () => {
    setLoading(true);
    referenceApi
      .getCompetenceCenters()
      .then((res) => setItems(res.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = () => {
    setEditItem(null);
    setFormMode('create');
    setFormOpen(true);
  };

  const handleEdit = (item: RefCompetenceCenter) => {
    setEditItem(item);
    setFormMode('edit');
    setFormOpen(true);
  };

  const handleFormSubmit = async (values: Record<string, string>) => {
    if (formMode === 'create') {
      await adminApi.createCompetenceCenter({ name: values.name });
    } else if (editItem) {
      await adminApi.updateCompetenceCenter(editItem.id, { name: values.name });
    }
    fetchData();
    onDataChanged();
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
        <h2 className="text-base font-semibold text-slate-800">Competence Centers</h2>
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
              <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[130px] text-right">Blended Rate</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[110px] text-right">Cost Centers</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[80px]">Status</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[70px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} className="hover:bg-slate-50">
                <TableCell className="px-3 py-2 text-sm font-medium text-slate-800">{item.name}</TableCell>
                <TableCell className="px-3 py-2 text-sm text-slate-600 text-right">
                  {formatCurrency(item.blended_rate)}/hr
                </TableCell>
                <TableCell className="px-3 py-2 text-sm text-slate-600 text-right">
                  {item.cost_centers.length}
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
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleEdit(item)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="px-3 py-8 text-center text-sm text-slate-400">
                  No competence centers found
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
        entityType="competence_center"
        entityLabel="Competence Center"
        initialValues={editItem ? { name: editItem.name } : undefined}
        onSubmit={handleFormSubmit}
      />
    </div>
  );
}
