import { useState, useEffect } from 'react';
import { Plus, Pencil, ChevronDown, ChevronRight, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/shared/Skeleton';
import { referenceApi, adminApi } from '@/api/endpoints';
import type { RefCompetenceCenter, RefPerson } from '@/types/api';
import { formatCurrency } from '@/lib/formatters';
import { EntityFormDialog } from './EntityFormDialog';

interface CCPerson {
  id: string;
  name: string;
  role_name: string;
  cost_center_name: string;
}

interface CompetenceCentersPanelProps {
  onDataChanged: () => void;
}

export function CompetenceCentersPanel({ onDataChanged }: CompetenceCentersPanelProps) {
  const [items, setItems] = useState<RefCompetenceCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editItem, setEditItem] = useState<RefCompetenceCenter | null>(null);

  // Expandable detail
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [ccPeople, setCcPeople] = useState<CCPerson[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(false);

  // Add employee dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [allPeople, setAllPeople] = useState<RefPerson[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [assigning, setAssigning] = useState(false);

  // Remove confirmation
  const [removeTarget, setRemoveTarget] = useState<CCPerson | null>(null);
  const [removing, setRemoving] = useState(false);

  const fetchData = () => {
    setLoading(true);
    referenceApi
      .getCompetenceCenters()
      .then((res) => setItems(res.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const fetchCCPeople = (ccId: string) => {
    setLoadingPeople(true);
    adminApi
      .getCompetenceCenterPeople(ccId)
      .then((res) => setCcPeople(res.items))
      .catch(() => setCcPeople([]))
      .finally(() => setLoadingPeople(false));
  };

  const toggleExpand = (ccId: string) => {
    if (expandedId === ccId) {
      setExpandedId(null);
      setCcPeople([]);
    } else {
      setExpandedId(ccId);
      fetchCCPeople(ccId);
    }
  };

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

  const openAddDialog = () => {
    setSelectedPersonId('');
    setAssigning(false);
    referenceApi.getPeople().then((res) => {
      setAllPeople(res.items);
      setAddDialogOpen(true);
    });
  };

  const handleAssign = async () => {
    if (!expandedId || !selectedPersonId) return;
    setAssigning(true);
    try {
      await adminApi.assignPersonToCC(expandedId, selectedPersonId);
      fetchCCPeople(expandedId);
      fetchData();
      onDataChanged();
      setAddDialogOpen(false);
    } catch {
      // ignore
    } finally {
      setAssigning(false);
    }
  };

  const handleRemove = async () => {
    if (!expandedId || !removeTarget) return;
    setRemoving(true);
    try {
      await adminApi.unassignPersonFromCC(expandedId, removeTarget.id);
      fetchCCPeople(expandedId);
      fetchData();
      onDataChanged();
      setRemoveTarget(null);
    } catch {
      // ignore
    } finally {
      setRemoving(false);
    }
  };

  // Filter out people already in this CC for the add dialog
  const availablePeople = allPeople.filter(
    (p) => p.is_active && p.competence_center_id !== expandedId
  );

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
              <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[30px]" />
              <TableHead className="px-3 py-2 text-xs font-medium text-slate-500">Name</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[130px] text-right">Blended Rate</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[110px] text-right">Cost Centers</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[80px]">Status</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[70px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <>
                <TableRow key={item.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => toggleExpand(item.id)}>
                  <TableCell className="px-3 py-2">
                    {expandedId === item.id
                      ? <ChevronDown className="h-4 w-4 text-slate-400" />
                      : <ChevronRight className="h-4 w-4 text-slate-400" />}
                  </TableCell>
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
                  <TableCell className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleEdit(item)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
                {expandedId === item.id && (
                  <TableRow key={`${item.id}-detail`}>
                    <TableCell colSpan={6} className="px-4 py-3 bg-slate-50 border-t-0">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-medium text-slate-700">Assigned Employees</h3>
                          <Button size="sm" variant="outline" onClick={openAddDialog}>
                            <UserPlus className="h-3.5 w-3.5 mr-1" />
                            Add Employee
                          </Button>
                        </div>
                        {loadingPeople ? (
                          <Skeleton className="h-8 w-full" />
                        ) : ccPeople.length === 0 ? (
                          <p className="text-sm text-slate-400 py-2">No employees assigned</p>
                        ) : (
                          <div className="rounded border border-slate-200 bg-white">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="px-3 py-1.5 text-xs font-medium text-slate-500">Name</TableHead>
                                  <TableHead className="px-3 py-1.5 text-xs font-medium text-slate-500 w-[160px]">Role</TableHead>
                                  <TableHead className="px-3 py-1.5 text-xs font-medium text-slate-500 w-[180px]">Cost Center</TableHead>
                                  <TableHead className="px-3 py-1.5 text-xs font-medium text-slate-500 w-[60px]" />
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {ccPeople.map((p) => (
                                  <TableRow key={p.id} className="hover:bg-slate-50">
                                    <TableCell className="px-3 py-1.5 text-sm text-slate-800">{p.name}</TableCell>
                                    <TableCell className="px-3 py-1.5 text-sm text-slate-600">{p.role_name}</TableCell>
                                    <TableCell className="px-3 py-1.5 text-sm text-slate-600">{p.cost_center_name || '—'}</TableCell>
                                    <TableCell className="px-3 py-1.5">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                                        onClick={() => setRemoveTarget(p)}
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="px-3 py-8 text-center text-sm text-slate-400">
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

      {/* Add Employee Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Employee</DialogTitle>
            <DialogDescription>
              Select an employee to assign to this competence center.
              {selectedPersonId && availablePeople.find((p) => p.id === selectedPersonId)?.competence_center_name
                ? ` This will reassign them from "${availablePeople.find((p) => p.id === selectedPersonId)?.competence_center_name}".`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Select value={selectedPersonId} onValueChange={setSelectedPersonId}>
              <SelectTrigger>
                <SelectValue placeholder="Select an employee" />
              </SelectTrigger>
              <SelectContent>
                {availablePeople.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} — {p.role_name}
                    {p.competence_center_name ? ` (${p.competence_center_name})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} disabled={assigning}>
              Cancel
            </Button>
            <Button onClick={handleAssign} disabled={!selectedPersonId || assigning}>
              {assigning ? 'Assigning...' : 'Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation */}
      <Dialog open={!!removeTarget} onOpenChange={() => setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Employee</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove "{removeTarget?.name}" from this competence center?
              They will no longer be assigned to any competence center.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)} disabled={removing}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemove} disabled={removing}>
              {removing ? 'Removing...' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
