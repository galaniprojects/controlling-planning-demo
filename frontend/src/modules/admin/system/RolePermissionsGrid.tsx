import { useEffect, useMemo, useState } from 'react';
import { Save, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/shared/Skeleton';
import { adminD3Api } from '@/api/endpoints';
import type { RolePermissionGrantItem } from '@/types/api';

const ROLES = [
  { key: 'controller', label: 'Controller' },
  { key: 'cc_owner', label: 'CC Owner' },
  { key: 'project_lead', label: 'Project Lead' },
  { key: 'executive', label: 'Executive' },
];

// Entity types per [F-AC-01] — BTC profile + inter-service distribution
// plus a few generic master-data entities controllable by admin.
const ENTITY_TYPES = [
  { key: 'btc_profile', label: 'BTC Profile', help: 'Edit BTC (To-Business) profile per chargeable entity' },
  { key: 'distribution', label: 'Inter-service Distribution', help: 'Edit Stage 1 distribution edges' },
  { key: 'cost_center', label: 'Cost Centers', help: 'Master-data CRUD' },
  { key: 'person', label: 'People', help: 'Master-data CRUD' },
  { key: 'project', label: 'Projects', help: 'Project metadata edits' },
];

type GridState = Record<string, Record<string, boolean>>; // role -> entity_type -> can_edit

export function RolePermissionsGrid() {
  const [grants, setGrants] = useState<RolePermissionGrantItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [grid, setGrid] = useState<GridState>({});

  const fetchData = () => {
    setLoading(true);
    adminD3Api
      .getRolePermissions()
      .then((res) => {
        setGrants(res.items);
        const g: GridState = {};
        for (const r of ROLES) {
          g[r.key] = {};
          for (const e of ENTITY_TYPES) g[r.key][e.key] = false;
        }
        for (const grant of res.items) {
          if (g[grant.role] && grant.entity_type in g[grant.role]) {
            g[grant.role][grant.entity_type] = grant.can_edit;
          }
        }
        setGrid(g);
      })
      .catch(() => setGrants([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { fetchData(); }, []);

  const isDirty = useMemo(() => {
    if (loading) return false;
    for (const r of ROLES) {
      for (const e of ENTITY_TYPES) {
        const current = grid[r.key]?.[e.key] ?? false;
        const original = grants.find((g) => g.role === r.key && g.entity_type === e.key)?.can_edit ?? false;
        if (current !== original) return true;
      }
    }
    return false;
  }, [grid, grants, loading]);

  const toggle = (role: string, entity: string) => {
    setGrid((prev) => ({
      ...prev,
      [role]: { ...prev[role], [entity]: !prev[role]?.[entity] },
    }));
    setFeedback(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const payload = ROLES.flatMap((r) =>
        ENTITY_TYPES.map((e) => ({
          role: r.key,
          entity_type: e.key,
          can_edit: grid[r.key]?.[e.key] ?? false,
        })),
      );
      await adminD3Api.bulkUpsertRolePermissions(payload);
      fetchData();
      setFeedback('Permissions saved.');
    } catch (e: unknown) {
      setFeedback(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    fetchData();
    setFeedback(null);
  };

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Role Permissions</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Per-entity-type role grants for BTC profile + inter-service distribution edits, plus
            generic master-data overrides. Default behaviour: responsible owns; controller has
            audit-trailed override. Add additional grants here.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleReset} disabled={!isDirty || saving}>
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Discard changes
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!isDirty || saving}>
            <Save className="h-4 w-4 mr-1.5" />
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>

      {feedback && (
        <div className="rounded-md border border-border bg-accent px-3 py-2 text-xs text-foreground">
          {feedback}
        </div>
      )}

      <div className="rounded-md border border-border overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground min-w-[180px]">
                Entity Type
              </th>
              {ROLES.map((r) => (
                <th
                  key={r.key}
                  className="px-3 py-2 text-center text-xs font-medium text-muted-foreground min-w-[110px]"
                >
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ENTITY_TYPES.map((e) => (
              <tr key={e.key} className="border-b border-border last:border-b-0 hover:bg-accent/40">
                <td className="px-3 py-2.5">
                  <div className="text-foreground font-medium">{e.label}</div>
                  <div className="text-[11px] text-muted-foreground">{e.help}</div>
                </td>
                {ROLES.map((r) => {
                  const checked = grid[r.key]?.[e.key] ?? false;
                  return (
                    <td key={r.key} className="px-3 py-2.5 text-center">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggle(r.key, e.key)}
                        aria-label={`${r.label} can edit ${e.label}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Changes affect BTC profile + distribution edit gates immediately on save. Audit log records
        each grant change under category <span className="font-mono">access_control</span>.
      </p>
    </div>
  );
}
