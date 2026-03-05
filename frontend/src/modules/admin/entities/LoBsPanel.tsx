import { useState, useEffect } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/shared/Skeleton';
import { referenceApi, adminApi } from '@/api/endpoints';
import type { LoBRef } from '@/types/api';
import { formatCurrency } from '@/lib/formatters';
import { EntityFormDialog } from './EntityFormDialog';

interface LoBsPanelProps {
  onDataChanged: () => void;
}

export function LoBsPanel({ onDataChanged }: LoBsPanelProps) {
  const [items, setItems] = useState<LoBRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editItem, setEditItem] = useState<LoBRef | null>(null);

  const fetchData = () => {
    setLoading(true);
    referenceApi
      .getLobs()
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

  const handleEdit = (item: LoBRef) => {
    setEditItem(item);
    setFormMode('edit');
    setFormOpen(true);
  };

  const handleFormSubmit = async (values: Record<string, string>) => {
    if (formMode === 'create') {
      await adminApi.createLoB({ name: values.name, description: values.description || undefined });
    } else if (editItem) {
      await adminApi.updateLoB(editItem.id, values);
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
        <h2 className="text-base font-semibold text-slate-800">Lines of Business</h2>
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
              <TableHead className="px-3 py-2 text-xs font-medium text-slate-500">Description</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[90px] text-right">Projects</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[130px] text-right">Total Budget</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[80px]">Status</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[70px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} className="hover:bg-slate-50">
                <TableCell className="px-3 py-2 text-sm font-medium text-slate-800">{item.name}</TableCell>
                <TableCell className="px-3 py-2 text-sm text-slate-600 max-w-[200px] truncate">
                  {item.description || '—'}
                </TableCell>
                <TableCell className="px-3 py-2 text-sm text-slate-600 text-right">{item.project_count}</TableCell>
                <TableCell className="px-3 py-2 text-sm text-slate-600 text-right">
                  {formatCurrency(item.total_budget)}
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
                <TableCell colSpan={6} className="px-3 py-8 text-center text-sm text-slate-400">
                  No lines of business found
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
        entityType="lob"
        entityLabel="Line of Business"
        initialValues={editItem ? { name: editItem.name, description: editItem.description ?? '' } : undefined}
        onSubmit={handleFormSubmit}
      />
    </div>
  );
}
