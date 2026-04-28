import { useState, useEffect } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/shared/Skeleton';
import { referenceApi, adminApi } from '@/api/endpoints';
import type { RefLocation } from '@/types/api';
import { EntityFormDialog } from './EntityFormDialog';
import { LocationLabel } from '../shared/LocationLabel';

interface LocationsPanelProps {
  onDataChanged: () => void;
}

export function LocationsPanel({ onDataChanged }: LocationsPanelProps) {
  const [items, setItems] = useState<RefLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editItem, setEditItem] = useState<RefLocation | null>(null);

  const fetchData = () => {
    setLoading(true);
    referenceApi
      .getLocations()
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

  const handleEdit = (item: RefLocation) => {
    setEditItem(item);
    setFormMode('edit');
    setFormOpen(true);
  };

  const handleFormSubmit = async (values: Record<string, string>) => {
    if (formMode === 'create') {
      await adminApi.createLocation({ city: values.city, country: values.country });
    } else if (editItem) {
      await adminApi.updateLocation(editItem.id, values);
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
        <h2 className="text-base font-semibold text-foreground">
          <LocationLabel kind="workforce" />
        </h2>
        <Button size="sm" onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Add New
        </Button>
      </div>

      <div className="rounded-md border border-border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground">City</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[160px]">Country</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[110px] text-right">Cost Centers</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[80px]">Status</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[70px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} className="hover:bg-accent">
                <TableCell className="px-3 py-2 text-sm font-medium text-foreground">{item.city}</TableCell>
                <TableCell className="px-3 py-2 text-sm text-muted-foreground">{item.country}</TableCell>
                <TableCell className="px-3 py-2 text-sm text-muted-foreground text-right">{item.cost_center_count}</TableCell>
                <TableCell className="px-3 py-2">
                  <Badge
                    className={
                      item.is_active
                        ? 'bg-green-100 text-green-700 hover:bg-green-100'
                        : 'bg-muted text-muted-foreground hover:bg-muted'
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
                <TableCell colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No locations found
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
        entityType="location"
        entityLabel="Location"
        initialValues={editItem ? { city: editItem.city, country: editItem.country } : undefined}
        onSubmit={handleFormSubmit}
      />
    </div>
  );
}
