/**
 * Project-scope Session 3 (T1) — add / remove role lines.
 *
 * Open to all authors (NOT Tier-3 — spec §3 item 3, §8). Adds an internal role
 * line to the project's plan within the scenario (a minted `new:role:<uuid>`
 * line the cell grid can then target) and removes existing or scenario-added
 * role lines. Mounted as one child of `ForecastGridSurface`; all mutations run
 * through `ScenarioContext` (which marks the scenario stale + appends a
 * change-feed entry). After each mutation `onMutated` triggers the surface to
 * refetch, since the resolved grid's row/column shape changes.
 */
import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { referenceApi } from '@/api/endpoints';
import type { RefRole } from '@/types/api';
import { useScenarioContext } from '../../useScenarioContext';
import type { ScenarioGridResponse } from '../../api/scenariosApi';

interface Props {
  projectId: string;
  grid: ScenarioGridResponse;
  onMutated: () => void;
}

export function RoleLineControls({ projectId, grid, onMutated }: Props) {
  const { addRoleLine, removeRoleLine } = useScenarioContext();
  const [roles, setRoles] = useState<RefRole[]>([]);
  const [selectedRole, setSelectedRole] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void referenceApi
      .getRoles()
      .then((res) => {
        if (!cancelled) setRoles(res.items ?? []);
      })
      .catch(() => {
        /* non-fatal — the add control just stays empty */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const internalRows = useMemo(
    () => grid.rows.filter((r) => r.kind === 'internal_role'),
    [grid.rows],
  );

  const handleAdd = async () => {
    if (!selectedRole) return;
    setBusy(true);
    setError(null);
    try {
      await addRoleLine(projectId, { role_type_id: selectedRole });
      setSelectedRole('');
      onMutated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add role line');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (lineKey: string) => {
    setBusy(true);
    setError(null);
    try {
      await removeRoleLine(projectId, lineKey);
      onMutated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove role line');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">Role lines</h4>
        <span className="text-[11px] text-muted-foreground">
          {internalRows.length} internal line{internalRows.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Add role line
          </label>
          <Select value={selectedRole} onValueChange={setSelectedRole} disabled={busy}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select a role…" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleAdd} disabled={busy || !selectedRole}>
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>

      {internalRows.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {internalRows.map((row) => (
            <li
              key={row.line_key}
              className="flex items-center justify-between px-3 py-2 text-sm"
            >
              <span className="text-foreground">
                {row.sub_category_name}
                {row.line_key.startsWith('new:role:') && (
                  <span className="ml-2 text-[11px] text-primary">added</span>
                )}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                disabled={busy}
                onClick={() => handleRemove(row.line_key)}
                aria-label={`Remove ${row.sub_category_name}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </Card>
  );
}
