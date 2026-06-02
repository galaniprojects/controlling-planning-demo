import { useState, useEffect } from 'react';
import { Plus, Pencil, ChevronDown, ChevronRight, FolderPlus } from 'lucide-react';
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
import { referenceApi, adminApi, workbenchApi } from '@/api/endpoints';
import type { LoBRef } from '@/types/api';
import { formatCurrency } from '@/lib/formatters';
import { EntityFormDialog } from './EntityFormDialog';

interface LoBProject {
  id: string;
  name: string;
  status: string;
  total_budget: number;
}

interface AllProject {
  id: string;
  name: string;
  status: string;
}

interface LoBsPanelProps {
  onDataChanged: () => void;
}

export function LoBsPanel({ onDataChanged }: LoBsPanelProps) {
  const [items, setItems] = useState<LoBRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editItem, setEditItem] = useState<LoBRef | null>(null);

  // Expandable detail
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lobProjects, setLobProjects] = useState<LoBProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  // Assign project dialog
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [allProjects, setAllProjects] = useState<AllProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [reassignWarning, setReassignWarning] = useState('');

  const fetchData = () => {
    setLoading(true);
    referenceApi
      .getLobs()
      .then((res) => setItems(res.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const fetchLoBProjects = (lobId: string) => {
    setLoadingProjects(true);
    adminApi
      .getLoBProjects(lobId)
      .then((res) => setLobProjects(res.items))
      .catch(() => setLobProjects([]))
      .finally(() => setLoadingProjects(false));
  };

  const toggleExpand = (lobId: string) => {
    if (expandedId === lobId) {
      setExpandedId(null);
      setLobProjects([]);
    } else {
      setExpandedId(lobId);
      fetchLoBProjects(lobId);
    }
  };

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

  const openAssignDialog = () => {
    setSelectedProjectId('');
    setReassignWarning('');
    setAssigning(false);
    workbenchApi.getProjects().then((res) => {
      // Get all projects, filter out ones already in this LoB
      setAllProjects(res.items.map((p) => ({ id: p.id, name: p.name, status: p.pipeline_stage ?? '' })));
      setAssignDialogOpen(true);
    });
  };

  const handleProjectSelect = (projectId: string) => {
    setSelectedProjectId(projectId);
    // Check if this project is already in a different LoB — it will be reassigned
    const currentLobProjects = lobProjects.map((p) => p.id);
    if (!currentLobProjects.includes(projectId)) {
      // The project is from another LoB — show warning
      const currentLob = items.find((l) => l.id === expandedId);
      setReassignWarning(
        `This project will be reassigned to "${currentLob?.name}". It will be removed from its current Line of Business.`
      );
    } else {
      setReassignWarning('');
    }
  };

  const handleAssign = async () => {
    if (!expandedId || !selectedProjectId) return;
    setAssigning(true);
    try {
      await adminApi.assignProjectToLoB(expandedId, selectedProjectId);
      fetchLoBProjects(expandedId);
      fetchData();
      onDataChanged();
      setAssignDialogOpen(false);
    } catch {
      // ignore
    } finally {
      setAssigning(false);
    }
  };

  // Filter projects: show only those NOT in current LoB
  const availableProjects = allProjects.filter(
    (p) => !lobProjects.some((lp) => lp.id === p.id)
  );

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      active: 'bg-green-100 text-green-700',
      planned: 'bg-primary/10 text-primary',
      completed: 'bg-muted text-muted-foreground',
      pending_approval: 'bg-amber-100 text-amber-700',
    };
    return colors[status] || 'bg-muted text-muted-foreground';
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
        <h2 className="text-base font-semibold text-foreground">Lines of Business</h2>
        <Button size="sm" onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Add New
        </Button>
      </div>

      <div className="rounded-md border border-border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[30px]" />
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground">Name</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground">Description</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[90px] text-right">Projects</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[130px] text-right">Total Budget</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[80px]">Status</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[70px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <>
                <TableRow key={item.id} className="hover:bg-accent cursor-pointer" onClick={() => toggleExpand(item.id)}>
                  <TableCell className="px-3 py-2">
                    {expandedId === item.id
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-sm font-medium text-foreground">{item.name}</TableCell>
                  <TableCell className="px-3 py-2 text-sm text-muted-foreground max-w-[200px] truncate">
                    {item.description || '—'}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-sm text-muted-foreground text-right">{item.project_count}</TableCell>
                  <TableCell className="px-3 py-2 text-sm text-muted-foreground text-right">
                    {formatCurrency(item.total_budget)}
                  </TableCell>
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
                  <TableCell className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleEdit(item)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
                {expandedId === item.id && (
                  <TableRow key={`${item.id}-detail`}>
                    <TableCell colSpan={7} className="px-4 py-3 bg-muted/50 border-t-0">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-medium text-foreground">Assigned Projects</h3>
                          <Button size="sm" variant="outline" onClick={openAssignDialog}>
                            <FolderPlus className="h-3.5 w-3.5 mr-1" />
                            Assign Project
                          </Button>
                        </div>
                        {loadingProjects ? (
                          <Skeleton className="h-8 w-full" />
                        ) : lobProjects.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-2">No projects assigned</p>
                        ) : (
                          <div className="rounded border border-border bg-card">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="px-3 py-1.5 text-xs font-medium text-muted-foreground">Project Name</TableHead>
                                  <TableHead className="px-3 py-1.5 text-xs font-medium text-muted-foreground w-[120px]">Status</TableHead>
                                  <TableHead className="px-3 py-1.5 text-xs font-medium text-muted-foreground w-[130px] text-right">Budget</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {lobProjects.map((p) => (
                                  <TableRow key={p.id} className="hover:bg-accent">
                                    <TableCell className="px-3 py-1.5 text-sm text-foreground">{p.name}</TableCell>
                                    <TableCell className="px-3 py-1.5">
                                      <Badge className={`${statusBadge(p.status)} hover:${statusBadge(p.status)}`}>
                                        {p.status.replace(/_/g, ' ')}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="px-3 py-1.5 text-sm text-muted-foreground text-right">
                                      {formatCurrency(p.total_budget)}
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
                <TableCell colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
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

      {/* Assign Project Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Project</DialogTitle>
            <DialogDescription>
              Select a project to assign to this Line of Business.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Select value={selectedProjectId} onValueChange={handleProjectSelect}>
              <SelectTrigger>
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {availableProjects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {reassignWarning && (
              <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                {reassignWarning}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)} disabled={assigning}>
              Cancel
            </Button>
            <Button onClick={handleAssign} disabled={!selectedProjectId || assigning}>
              {assigning ? 'Assigning...' : 'Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
