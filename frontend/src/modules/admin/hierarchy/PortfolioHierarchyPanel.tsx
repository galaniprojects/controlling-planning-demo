import { useState, useEffect } from 'react';
import { Plus, Pencil, Check, ChevronDown, ChevronRight, FolderPlus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/shared/Skeleton';
import { adminApi, workbenchApi } from '@/api/endpoints';

interface EntityType {
  id: string;
  name: string;
  is_active: boolean;
  entity_count: number;
}

interface GroupingEntity {
  id: string;
  entity_type_id: string;
  entity_type_name: string;
  name: string;
  parent_entity_id: string | null;
  is_active: boolean;
  project_count: number;
}

interface Hierarchy {
  id: string;
  name: string;
  is_active_hierarchy: boolean;
  levels: { level_order: number; entity_type_id: string; entity_type_name: string }[];
}

interface ActiveEntity {
  id: string;
  name: string;
  project_count: number;
  projects: { id: string; name: string; status: string }[];
}

interface PortfolioHierarchyPanelProps {
  onDataChanged: () => void;
}

export function PortfolioHierarchyPanel({ onDataChanged }: PortfolioHierarchyPanelProps) {
  const [tab, setTab] = useState('hierarchies');

  // Entity Types
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [newTypeName, setNewTypeName] = useState('');
  const [creatingType, setCreatingType] = useState(false);

  // Hierarchies
  const [hierarchies, setHierarchies] = useState<Hierarchy[]>([]);
  const [loadingHier, setLoadingHier] = useState(true);
  const [createHierOpen, setCreateHierOpen] = useState(false);
  const [newHierName, setNewHierName] = useState('');
  const [newHierLevels, setNewHierLevels] = useState<string[]>([]);
  const [creatingHier, setCreatingHier] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);

  // Entities
  const [entities, setEntities] = useState<GroupingEntity[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(true);
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [createEntityOpen, setCreateEntityOpen] = useState(false);
  const [newEntityName, setNewEntityName] = useState('');
  const [newEntityTypeId, setNewEntityTypeId] = useState('');
  const [creatingEntity, setCreatingEntity] = useState(false);

  // Project Assignments
  const [activeEntities, setActiveEntities] = useState<ActiveEntity[]>([]);
  const [loadingActive, setLoadingActive] = useState(true);
  const [expandedEntityId, setExpandedEntityId] = useState<string | null>(null);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignTargetEntityId, setAssignTargetEntityId] = useState('');
  const [allProjects, setAllProjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [activeLabel, setActiveLabel] = useState('Line of Business');

  // Activate confirmation dialog
  const [activateConfirm, setActivateConfirm] = useState<Hierarchy | null>(null);

  const fetchEntityTypes = () => {
    setLoadingTypes(true);
    adminApi.getEntityTypes()
      .then((r) => setEntityTypes(r.items))
      .catch(() => setEntityTypes([]))
      .finally(() => setLoadingTypes(false));
  };

  const fetchHierarchies = () => {
    setLoadingHier(true);
    adminApi.getHierarchies()
      .then((r) => setHierarchies(r.items))
      .catch(() => setHierarchies([]))
      .finally(() => setLoadingHier(false));
  };

  const fetchEntities = () => {
    setLoadingEntities(true);
    adminApi.getGroupingEntities(entityTypeFilter || undefined)
      .then((r) => setEntities(r.items))
      .catch(() => setEntities([]))
      .finally(() => setLoadingEntities(false));
  };

  const fetchActiveHierarchy = () => {
    setLoadingActive(true);
    adminApi.getActiveHierarchy()
      .then((r) => {
        setActiveEntities(r.entities);
        setActiveLabel(r.top_level_label);
      })
      .catch(() => setActiveEntities([]))
      .finally(() => setLoadingActive(false));
  };

  useEffect(() => {
    fetchEntityTypes();
    fetchHierarchies();
    fetchEntities();
    fetchActiveHierarchy();
  }, []);

  useEffect(() => { fetchEntities(); }, [entityTypeFilter]);

  // --- Entity Types ---
  const handleCreateType = async () => {
    if (!newTypeName.trim()) return;
    setCreatingType(true);
    try {
      await adminApi.createEntityType({ name: newTypeName.trim() });
      setNewTypeName('');
      fetchEntityTypes();
      onDataChanged();
    } catch { /* ignore */ }
    setCreatingType(false);
  };

  // --- Hierarchies ---
  const handleCreateHierarchy = async () => {
    if (!newHierName.trim() || newHierLevels.length === 0) return;
    setCreatingHier(true);
    try {
      await adminApi.createHierarchy({ name: newHierName.trim(), levels: newHierLevels });
      setCreateHierOpen(false);
      setNewHierName('');
      setNewHierLevels([]);
      fetchHierarchies();
      onDataChanged();
    } catch { /* ignore */ }
    setCreatingHier(false);
  };

  const handleActivate = async (h: Hierarchy) => {
    setActivating(h.id);
    try {
      await adminApi.activateHierarchy(h.id);
      fetchHierarchies();
      fetchActiveHierarchy();
      onDataChanged();
      setActivateConfirm(null);
    } catch { /* ignore */ }
    setActivating(null);
  };

  // --- Entities ---
  const handleCreateEntity = async () => {
    if (!newEntityName.trim() || !newEntityTypeId) return;
    setCreatingEntity(true);
    try {
      await adminApi.createGroupingEntity({ entity_type_id: newEntityTypeId, name: newEntityName.trim() });
      setCreateEntityOpen(false);
      setNewEntityName('');
      fetchEntities();
      fetchActiveHierarchy();
      onDataChanged();
    } catch { /* ignore */ }
    setCreatingEntity(false);
  };

  // --- Project Assignments ---
  const openAssignDialog = (entityId: string) => {
    setAssignTargetEntityId(entityId);
    setSelectedProjectId('');
    workbenchApi.getProjects().then((r) => {
      setAllProjects(r.items.map((p) => ({ id: p.id, name: p.name })));
      setAssignDialogOpen(true);
    });
  };

  const handleAssignProject = async () => {
    if (!selectedProjectId || !assignTargetEntityId) return;
    setAssigning(true);
    try {
      await adminApi.assignProjectToEntity({ project_id: selectedProjectId, grouping_entity_id: assignTargetEntityId });
      fetchActiveHierarchy();
      fetchEntities();
      onDataChanged();
      setAssignDialogOpen(false);
    } catch { /* ignore */ }
    setAssigning(false);
  };

  const handleUnassignProject = async (projectId: string) => {
    try {
      await adminApi.unassignProjectFromEntity(projectId);
      fetchActiveHierarchy();
      fetchEntities();
      onDataChanged();
    } catch { /* ignore */ }
  };

  // Get assigned project IDs from active hierarchy
  const assignedProjectIds = new Set(activeEntities.flatMap((e) => e.projects.map((p) => p.id)));
  const availableProjects = allProjects.filter((p) => !assignedProjectIds.has(p.id));

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-slate-800">Portfolio Hierarchy</h2>
      <p className="text-sm text-slate-500">
        Configure how projects are grouped across the application. The active hierarchy determines
        the grouping structure in Portfolio Overview, Reporting, and all other modules.
      </p>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="hierarchies">Hierarchies</TabsTrigger>
          <TabsTrigger value="entity_types">Entity Types</TabsTrigger>
          <TabsTrigger value="entities">Entities</TabsTrigger>
          <TabsTrigger value="assignments">Project Assignments</TabsTrigger>
        </TabsList>

        {/* --- Hierarchies Tab --- */}
        <TabsContent value="hierarchies" className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-700">Defined Hierarchies</h3>
            <Button size="sm" onClick={() => { setNewHierName(''); setNewHierLevels([]); setCreateHierOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" />
              Create Hierarchy
            </Button>
          </div>
          {loadingHier ? <Skeleton className="h-10 w-full" /> : (
            <div className="rounded-md border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-3 py-2 text-xs font-medium text-slate-500">Name</TableHead>
                    <TableHead className="px-3 py-2 text-xs font-medium text-slate-500">Levels</TableHead>
                    <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[100px]">Status</TableHead>
                    <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[120px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hierarchies.map((h) => (
                    <TableRow key={h.id} className="hover:bg-slate-50">
                      <TableCell className="px-3 py-2 text-sm font-medium text-slate-800">{h.name}</TableCell>
                      <TableCell className="px-3 py-2 text-sm text-slate-600">
                        {h.levels.map((l) => l.entity_type_name).join(' → ')} → Project
                      </TableCell>
                      <TableCell className="px-3 py-2">
                        {h.is_active_hierarchy ? (
                          <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Active</Badge>
                        ) : (
                          <Badge className="bg-slate-100 text-slate-500 hover:bg-slate-100">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-2">
                        {!h.is_active_hierarchy && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setActivateConfirm(h)}
                            disabled={activating === h.id}
                          >
                            <Check className="h-3.5 w-3.5 mr-1" />
                            Set Active
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {hierarchies.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="px-3 py-8 text-center text-sm text-slate-400">
                        No hierarchies defined
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* --- Entity Types Tab --- */}
        <TabsContent value="entity_types" className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-700">Entity Types</h3>
          </div>
          {loadingTypes ? <Skeleton className="h-10 w-full" /> : (
            <div className="rounded-md border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-3 py-2 text-xs font-medium text-slate-500">Name</TableHead>
                    <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[100px] text-right">Entities</TableHead>
                    <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[80px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entityTypes.map((t) => (
                    <TableRow key={t.id} className="hover:bg-slate-50">
                      <TableCell className="px-3 py-2 text-sm font-medium text-slate-800">{t.name}</TableCell>
                      <TableCell className="px-3 py-2 text-sm text-slate-600 text-right">{t.entity_count}</TableCell>
                      <TableCell className="px-3 py-2">
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Active</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="flex gap-2 items-center">
            <Input
              value={newTypeName}
              onChange={(e) => setNewTypeName(e.target.value)}
              placeholder="New entity type name (e.g., Department)"
              className="max-w-xs"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateType()}
            />
            <Button size="sm" onClick={handleCreateType} disabled={!newTypeName.trim() || creatingType}>
              <Plus className="h-4 w-4 mr-1" />
              {creatingType ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </TabsContent>

        {/* --- Entities Tab --- */}
        <TabsContent value="entities" className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-medium text-slate-700">Entities</h3>
              <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
                <SelectTrigger className="w-[200px] h-8 text-sm">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {entityTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={() => { setNewEntityName(''); setNewEntityTypeId(entityTypes[0]?.id || ''); setCreateEntityOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" />
              Create Entity
            </Button>
          </div>
          {loadingEntities ? <Skeleton className="h-10 w-full" /> : (
            <div className="rounded-md border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-3 py-2 text-xs font-medium text-slate-500">Name</TableHead>
                    <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[160px]">Type</TableHead>
                    <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[100px] text-right">Projects</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entities.map((e) => (
                    <TableRow key={e.id} className="hover:bg-slate-50">
                      <TableCell className="px-3 py-2 text-sm font-medium text-slate-800">{e.name}</TableCell>
                      <TableCell className="px-3 py-2 text-sm text-slate-600">{e.entity_type_name}</TableCell>
                      <TableCell className="px-3 py-2 text-sm text-slate-600 text-right">{e.project_count}</TableCell>
                    </TableRow>
                  ))}
                  {entities.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="px-3 py-8 text-center text-sm text-slate-400">
                        No entities found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* --- Project Assignments Tab --- */}
        <TabsContent value="assignments" className="space-y-3">
          <h3 className="text-sm font-medium text-slate-700">
            Active Hierarchy: {activeLabel}
          </h3>
          {loadingActive ? <Skeleton className="h-10 w-full" /> : (
            <div className="rounded-md border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[30px]" />
                    <TableHead className="px-3 py-2 text-xs font-medium text-slate-500">{activeLabel}</TableHead>
                    <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[100px] text-right">Projects</TableHead>
                    <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[120px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeEntities.map((e) => (
                    <>
                      <TableRow key={e.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setExpandedEntityId(expandedEntityId === e.id ? null : e.id)}>
                        <TableCell className="px-3 py-2">
                          {expandedEntityId === e.id
                            ? <ChevronDown className="h-4 w-4 text-slate-400" />
                            : <ChevronRight className="h-4 w-4 text-slate-400" />}
                        </TableCell>
                        <TableCell className="px-3 py-2 text-sm font-medium text-slate-800">{e.name}</TableCell>
                        <TableCell className="px-3 py-2 text-sm text-slate-600 text-right">{e.project_count}</TableCell>
                        <TableCell className="px-3 py-2" onClick={(ev) => ev.stopPropagation()}>
                          <Button size="sm" variant="outline" className="h-7" onClick={() => openAssignDialog(e.id)}>
                            <FolderPlus className="h-3.5 w-3.5 mr-1" />
                            Assign
                          </Button>
                        </TableCell>
                      </TableRow>
                      {expandedEntityId === e.id && (
                        <TableRow key={`${e.id}-projects`}>
                          <TableCell colSpan={4} className="px-6 py-2 bg-slate-50">
                            {e.projects.length === 0 ? (
                              <p className="text-sm text-slate-400 py-1">No projects assigned</p>
                            ) : (
                              <div className="space-y-1">
                                {e.projects.map((p) => (
                                  <div key={p.id} className="flex items-center justify-between py-0.5">
                                    <span className="text-sm text-slate-700">{p.name}</span>
                                    <div className="flex items-center gap-2">
                                      <Badge className="bg-slate-100 text-slate-500 hover:bg-slate-100 text-xs">{p.status.replace(/_/g, ' ')}</Badge>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0 text-red-400 hover:text-red-600"
                                        onClick={() => handleUnassignProject(p.id)}
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                  {activeEntities.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="px-3 py-8 text-center text-sm text-slate-400">
                        No entities in active hierarchy
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Hierarchy Dialog */}
      <Dialog open={createHierOpen} onOpenChange={setCreateHierOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Hierarchy</DialogTitle>
            <DialogDescription>
              Define a new grouping hierarchy. Select the entity types that form the levels,
              from top to bottom. Projects are always the leaf nodes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Hierarchy Name</label>
              <Input value={newHierName} onChange={(e) => setNewHierName(e.target.value)} placeholder="e.g., Department Structure" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Levels (top to bottom)</label>
              {newHierLevels.map((levelId, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 w-6">L{i + 1}</span>
                  <Select value={levelId} onValueChange={(v) => { const n = [...newHierLevels]; n[i] = v; setNewHierLevels(n); }}>
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {entityTypes.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400" onClick={() => setNewHierLevels(newHierLevels.filter((_, j) => j !== i))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 w-6" />
                <Button variant="outline" size="sm" onClick={() => setNewHierLevels([...newHierLevels, entityTypes[0]?.id || ''])}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Level
                </Button>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {newHierLevels.length > 0
                  ? `${newHierLevels.map((id) => entityTypes.find((t) => t.id === id)?.name || '?').join(' → ')} → Project`
                  : 'Add at least one level'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateHierOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateHierarchy} disabled={!newHierName.trim() || newHierLevels.length === 0 || creatingHier}>
              {creatingHier ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Entity Dialog */}
      <Dialog open={createEntityOpen} onOpenChange={setCreateEntityOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Entity</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Entity Type</label>
              <Select value={newEntityTypeId} onValueChange={setNewEntityTypeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {entityTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Name</label>
              <Input value={newEntityName} onChange={(e) => setNewEntityName(e.target.value)} placeholder="e.g., Sales IT" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateEntityOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateEntity} disabled={!newEntityName.trim() || !newEntityTypeId || creatingEntity}>
              {creatingEntity ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Project Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Project</DialogTitle>
            <DialogDescription>
              Select a project to assign to this entity. If the project is already assigned
              elsewhere, it will be reassigned.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {availableProjects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAssignProject} disabled={!selectedProjectId || assigning}>
              {assigning ? 'Assigning...' : 'Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Activate Hierarchy Confirmation */}
      <Dialog open={!!activateConfirm} onOpenChange={() => setActivateConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Activate Hierarchy</DialogTitle>
            <DialogDescription>
              Activating "{activateConfirm?.name}" will change the grouping structure across
              all modules (Portfolio Overview, Reporting, What-If Simulator, etc.).
              The current active hierarchy will be deactivated. Continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActivateConfirm(null)}>Cancel</Button>
            <Button onClick={() => activateConfirm && handleActivate(activateConfirm)} disabled={!!activating}>
              {activating ? 'Activating...' : 'Activate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
