import { useState, useEffect } from 'react';
import { Calendar, Clock, Gauge, Lock, Users, KeyRound, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/shared/Skeleton';
import { adminApi } from '@/api/endpoints';
import type { AdminParameter } from '@/types/api';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const GROUP_CONFIG = [
  { key: 'fiscal', label: 'Fiscal Settings', icon: Calendar },
  { key: 'planning', label: 'Planning Horizon', icon: Clock },
  { key: 'thresholds', label: 'Thresholds', icon: Gauge },
  { key: 'limits', label: 'Limits', icon: Lock },
  { key: 'capacity', label: 'Capacity Settings', icon: Users },
  { key: 'integrations', label: 'Integrations', icon: KeyRound },
];

export function PlanningParameters() {
  const [parameters, setParameters] = useState<AdminParameter[]>([]);
  const [loading, setLoading] = useState(true);
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [savingGroup, setSavingGroup] = useState<string | null>(null);
  const [resetGroup, setResetGroup] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [result, setResult] = useState<{ group: string; message: string } | null>(null);

  const fetchParams = () => {
    setLoading(true);
    adminApi
      .getParameters()
      .then((res) => setParameters(res.items))
      .catch(() => setParameters([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchParams(); }, []);

  const groupedParams = GROUP_CONFIG.map((gc) => ({
    ...gc,
    params: parameters.filter((p) => p.group === gc.key),
  }));

  const handleValueChange = (key: string, value: string) => {
    setEditedValues((prev) => ({ ...prev, [key]: value }));
  };

  const getDisplayValue = (param: AdminParameter) =>
    editedValues[param.key] ?? param.current_value;

  const hasGroupChanges = (groupKey: string) =>
    parameters
      .filter((p) => p.group === groupKey)
      .some((p) => editedValues[p.key] !== undefined && editedValues[p.key] !== p.current_value);

  const handleSaveGroup = async (groupKey: string) => {
    const changes = parameters
      .filter((p) => p.group === groupKey && editedValues[p.key] !== undefined && editedValues[p.key] !== p.current_value)
      .map((p) => ({ key: p.key, new_value: editedValues[p.key] }));
    if (changes.length === 0) return;

    setSavingGroup(groupKey);
    setResult(null);
    try {
      await adminApi.updateParameters(changes);
      // Clear edits for this group
      const newEdited = { ...editedValues };
      for (const c of changes) delete newEdited[c.key];
      setEditedValues(newEdited);
      setResult({ group: groupKey, message: `${changes.length} parameter(s) updated.` });
      fetchParams();
    } catch {
      setResult({ group: groupKey, message: 'Failed to save changes.' });
    } finally {
      setSavingGroup(null);
    }
  };

  const handleResetGroup = async () => {
    if (!resetGroup) return;
    const keys = parameters.filter((p) => p.group === resetGroup).map((p) => p.key);
    setResetting(true);
    try {
      await adminApi.resetParameters(keys);
      // Clear edits for this group
      const newEdited = { ...editedValues };
      for (const k of keys) delete newEdited[k];
      setEditedValues(newEdited);
      setResult({ group: resetGroup, message: 'Parameters reset to defaults.' });
      fetchParams();
    } catch {
      setResult({ group: resetGroup, message: 'Failed to reset parameters.' });
    } finally {
      setResetting(false);
      setResetGroup(null);
    }
  };

  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({});

  const toggleSecretVisibility = (key: string) => {
    setVisibleSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderControl = (param: AdminParameter) => {
    const value = getDisplayValue(param);

    if (param.data_type === 'month') {
      return (
        <Select value={value} onValueChange={(v) => handleValueChange(param.key, v)}>
          <SelectTrigger className="w-[180px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (param.data_type === 'secret') {
      const isVisible = visibleSecrets[param.key] ?? false;
      return (
        <div className="flex items-center gap-1">
          <Input
            type={isVisible ? 'text' : 'password'}
            className="h-8 w-[280px] text-sm font-mono"
            value={value}
            placeholder="sk-ant-..."
            onChange={(e) => handleValueChange(param.key, e.target.value)}
          />
          <button
            type="button"
            onClick={() => toggleSecretVisibility(param.key)}
            className="p-1.5 text-slate-400 hover:text-slate-600"
          >
            {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1">
        <Input
          type="number"
          className="h-8 w-[100px] text-sm"
          value={value}
          onChange={(e) => handleValueChange(param.key, e.target.value)}
        />
        {param.data_type === 'percentage' && (
          <span className="text-sm text-slate-400">%</span>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-slate-800">Planning Parameters</h2>

      {groupedParams.map((group) => {
        if (group.params.length === 0) return null;
        const Icon = group.icon;
        const changed = hasGroupChanges(group.key);
        const isSaving = savingGroup === group.key;

        return (
          <Card key={group.key} className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-700">{group.label}</h3>
            </div>
            <Separator />

            {group.params.map((param) => {
              const isEdited = editedValues[param.key] !== undefined && editedValues[param.key] !== param.current_value;
              return (
                <div
                  key={param.key}
                  className={`flex items-center justify-between py-2.5 border-b border-slate-100 last:border-b-0 ${isEdited ? 'bg-amber-50 -mx-2 px-2 rounded' : ''}`}
                >
                  <div className="flex-1 min-w-0 mr-4">
                    <p className="text-sm font-medium text-slate-700">{param.name}</p>
                    <p className="text-xs text-slate-500">{param.description}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Default: {param.default_value}
                      {param.data_type === 'percentage' ? '%' : ''}
                    </p>
                  </div>
                  {renderControl(param)}
                </div>
              );
            })}

            {result?.group === group.key && (
              <div className="rounded-md border border-blue-200 bg-blue-50 p-2.5 text-sm text-blue-800">
                {result.message}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setResetGroup(group.key)}
              >
                Reset to Defaults
              </Button>
              <Button
                size="sm"
                onClick={() => handleSaveGroup(group.key)}
                disabled={!changed || isSaving}
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </Card>
        );
      })}

      {/* Reset confirmation */}
      <Dialog open={!!resetGroup} onOpenChange={() => setResetGroup(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset to Defaults</DialogTitle>
            <DialogDescription>
              This will reset all parameters in this group to their default values.
              Are you sure?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetGroup(null)} disabled={resetting}>
              Cancel
            </Button>
            <Button onClick={handleResetGroup} disabled={resetting}>
              {resetting ? 'Resetting...' : 'Reset'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
