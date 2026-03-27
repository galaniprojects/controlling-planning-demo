import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShieldAlert, Building2, Users, Briefcase, MapPin, Network, RotateCcw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useRole } from '@/contexts/RoleContext';
import { ModuleGuideButton } from '@/components/shared/ModuleGuideButton';
import { Skeleton } from '@/components/shared/Skeleton';
import { SummaryCard } from '@/modules/capacity/shared/SummaryCard';
import { adminApi } from '@/api/endpoints';
import type { AdminContext } from '@/types/api';
import { EntitySelector } from './EntitySelector';
import { CostCentersPanel } from './entities/CostCentersPanel';
import { CompetenceCentersPanel } from './entities/CompetenceCentersPanel';
import { LoBsPanel } from './entities/LoBsPanel';
import { LocationsPanel } from './entities/LocationsPanel';
import { PeoplePanel } from './entities/PeoplePanel';
import { RateTablePanel } from './entities/RateTablePanel';
import { PlanningParameters } from './parameters/PlanningParameters';
import { AuditLogPanel } from './audit/AuditLogPanel';
import { PortfolioHierarchyPanel } from './hierarchy/PortfolioHierarchyPanel';

export function Administration() {
  const { context, currentRoleId } = useRole();
  const role = context?.role ?? '';
  const [searchParams] = useSearchParams();
  const [adminCtx, setAdminCtx] = useState<AdminContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSection, setSelectedSection] = useState(
    searchParams.get('section') || 'cost_centers',
  );
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const fetchContext = () => {
    adminApi
      .getContext()
      .then(setAdminCtx)
      .catch(() => setAdminCtx(null));
  };

  useEffect(() => {
    if (role !== 'controller') {
      setLoading(false);
      return;
    }
    setLoading(true);
    adminApi
      .getContext()
      .then(setAdminCtx)
      .catch(() => setAdminCtx(null))
      .finally(() => setLoading(false));
  }, [currentRoleId, role]);

  // Role gate: controller only
  if (!loading && role !== 'controller') {
    return (
      <div className="px-6 py-6">
        <Card className="max-w-md mx-auto mt-24 p-8 text-center">
          <ShieldAlert className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-foreground mb-1">
            Access Restricted
          </h2>
          <p className="text-sm text-muted-foreground">
            The Administration module is available to Controllers only.
          </p>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="px-6 py-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!adminCtx) {
    return (
      <div className="px-6 py-6">
        <p className="text-sm text-muted-foreground">Failed to load administration context.</p>
      </div>
    );
  }

  const handleReset = async () => {
    setResetting(true);
    try {
      await adminApi.resetDemo();
      setResetOpen(false);
      window.location.reload();
    } catch {
      setResetting(false);
    }
  };

  const renderPanel = () => {
    switch (selectedSection) {
      case 'cost_centers':
        return <CostCentersPanel onDataChanged={fetchContext} />;
      case 'competence_centers':
        return <CompetenceCentersPanel onDataChanged={fetchContext} />;
      case 'lobs':
        return <LoBsPanel onDataChanged={fetchContext} />;
      case 'locations':
        return <LocationsPanel onDataChanged={fetchContext} />;
      case 'people':
        return <PeoplePanel onDataChanged={fetchContext} />;
      case 'rate_tables':
        return <RateTablePanel />;
      case 'parameters':
        return <PlanningParameters />;
      case 'audit_log':
        return <AuditLogPanel />;
      case 'portfolio_hierarchy':
        return <PortfolioHierarchyPanel onDataChanged={fetchContext} />;
      default:
        return null;
    }
  };

  return (
    <div className="px-6 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Administration</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 border-red-200 hover:bg-red-50"
            onClick={() => setResetOpen(true)}
          >
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Reset Demo
          </Button>
          <ModuleGuideButton moduleId="administration" />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-3">
        <SummaryCard
          label="Cost Centers"
          value={adminCtx.cost_center_count}
          icon={<Building2 className="h-5 w-5" />}
        />
        <SummaryCard
          label="Active People"
          value={adminCtx.people_count}
          icon={<Users className="h-5 w-5" />}
        />
        <SummaryCard
          label="Lines of Business"
          value={adminCtx.lob_count}
          icon={<Briefcase className="h-5 w-5" />}
        />
        <SummaryCard
          label="Locations"
          value={adminCtx.location_count}
          icon={<MapPin className="h-5 w-5" />}
        />
        <SummaryCard
          label="Competence Centers"
          value={adminCtx.competence_center_count}
          icon={<Network className="h-5 w-5" />}
        />
      </div>

      {/* Main content: selector + panel */}
      <div className="flex gap-6">
        <EntitySelector selected={selectedSection} onSelect={setSelectedSection} />
        <div className="flex-1 min-w-0">{renderPanel()}</div>
      </div>

      {/* Reset confirmation dialog */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Demo Data</DialogTitle>
            <DialogDescription>
              This will reset all data to the initial demo state. All changes
              you've made (new entities, parameter updates, etc.) will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)} disabled={resetting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReset}
              disabled={resetting}
            >
              {resetting ? 'Resetting...' : 'Reset All Data'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
