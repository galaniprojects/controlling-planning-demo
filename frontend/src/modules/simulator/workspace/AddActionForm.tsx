import { useState, useEffect, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { referenceApi } from '@/api/endpoints';
import type { ScenarioProjectState } from '@/types/api';

// --- Action Type Configs ---

interface ParameterConfig {
  key: string;
  label: string;
  type: 'number' | 'select' | 'text' | 'multi-select';
  placeholder?: string;
  options?: { value: string; label: string }[];
  dependsOn?: string;
}

interface ActionTypeConfig {
  scope: 'project' | 'portfolio';
  action_type: string;
  label: string;
  requires_project: boolean;
  parameters: ParameterConfig[];
}

const PROJECT_ACTIONS: ActionTypeConfig[] = [
  {
    scope: 'project',
    action_type: 'adjust_budget',
    label: 'Adjust Budget (%)',
    requires_project: true,
    parameters: [
      { key: 'percentage', label: 'Percentage', type: 'number', placeholder: '-15' },
    ],
  },
  {
    scope: 'project',
    action_type: 'remove_project',
    label: 'Remove Project',
    requires_project: true,
    parameters: [],
  },
  {
    scope: 'project',
    action_type: 'delay_project',
    label: 'Delay Project',
    requires_project: true,
    parameters: [
      { key: 'months', label: 'Months to Delay', type: 'number', placeholder: '3' },
    ],
  },
  {
    scope: 'project',
    action_type: 'accelerate_project',
    label: 'Accelerate Project',
    requires_project: true,
    parameters: [
      { key: 'months', label: 'Months Forward', type: 'number', placeholder: '3' },
    ],
  },
  {
    scope: 'project',
    action_type: 'cut_consulting',
    label: 'Cut Consulting',
    requires_project: true,
    parameters: [
      { key: 'percentage', label: 'Cut Percentage', type: 'number', placeholder: '15' },
    ],
  },
  {
    scope: 'project',
    action_type: 'pause_project',
    label: 'Pause Project',
    requires_project: true,
    parameters: [
      { key: 'start_month', label: 'Pause From (YYYY-MM)', type: 'text', placeholder: '2026-03' },
    ],
  },
  {
    scope: 'project',
    action_type: 'change_allocation',
    label: 'Change Resource Allocation',
    requires_project: true,
    parameters: [
      { key: 'role_type_id', label: 'Role', type: 'select', options: [] },
      {
        key: 'action', label: 'Action', type: 'select', options: [
          { value: 'add', label: 'Add' },
          { value: 'remove', label: 'Remove' },
          { value: 'modify', label: 'Modify' },
        ],
      },
      { key: 'hours_per_month', label: 'Hours per Month', type: 'number', placeholder: '40' },
      { key: 'start_month', label: 'Start Month (YYYY-MM)', type: 'text', placeholder: '2026-03' },
      { key: 'end_month', label: 'End Month (YYYY-MM)', type: 'text', placeholder: '2026-09' },
    ],
  },
];

const PORTFOLIO_ACTIONS: ActionTypeConfig[] = [
  {
    scope: 'portfolio',
    action_type: 'across_the_board_cut',
    label: 'Across-the-Board Cut',
    requires_project: false,
    parameters: [
      { key: 'percentage', label: 'Cut Percentage', type: 'number', placeholder: '20' },
    ],
  },
  {
    scope: 'portfolio',
    action_type: 'reduce_lob',
    label: 'Cut by LoB',
    requires_project: false,
    parameters: [
      { key: 'lob_id', label: 'Line of Business', type: 'select', options: [] },
      { key: 'percentage', label: 'Cut Percentage', type: 'number', placeholder: '15' },
    ],
  },
  {
    scope: 'portfolio',
    action_type: 'cut_by_type',
    label: 'Cut by Type',
    requires_project: false,
    parameters: [
      {
        key: 'target_type', label: 'Target', type: 'select', options: [
          { value: 'project', label: 'Projects Only' },
          { value: 'service', label: 'Services Only' },
          { value: 'all', label: 'All' },
        ],
      },
      { key: 'reduction_pct', label: 'Reduction %', type: 'number', placeholder: '10' },
    ],
  },
  {
    scope: 'portfolio',
    action_type: 'freeze_new_starts',
    label: 'Freeze New Starts',
    requires_project: false,
    parameters: [
      { key: 'cutoff_month', label: 'Cutoff Month (YYYY-MM)', type: 'text', placeholder: '2026-03' },
    ],
  },
  {
    scope: 'portfolio',
    action_type: 'cap_cost_category',
    label: 'Cap Cost Category',
    requires_project: false,
    parameters: [
      { key: 'cost_type_id', label: 'Cost Type', type: 'select', options: [] },
      { key: 'cap_amount', label: 'Cap Amount (EUR)', type: 'number', placeholder: '500000' },
      {
        key: 'cap_period', label: 'Period', type: 'select', options: [
          { value: 'annual', label: 'Annual' },
          { value: 'monthly', label: 'Monthly' },
        ],
      },
    ],
  },
  {
    scope: 'portfolio',
    action_type: 'rate_escalation',
    label: 'Rate Escalation',
    requires_project: false,
    parameters: [
      {
        key: 'scope_type', label: 'Scope', type: 'select', options: [
          { value: 'role', label: 'Role' },
          { value: 'cost_center', label: 'Cost Center' },
          { value: 'location', label: 'Location' },
        ],
      },
      { key: 'scope_values', label: 'Scope Values', type: 'multi-select', options: [], dependsOn: 'scope_type' },
      { key: 'increase_pct', label: 'Increase %', type: 'number', placeholder: '5' },
      { key: 'effective_month', label: 'Effective From (YYYY-MM)', type: 'text', placeholder: '2026-04' },
    ],
  },
];

// --- Component ---

interface Props {
  onApplyAction: (body: {
    scope: string;
    action_type: string;
    project_id?: string;
    parameters: Record<string, unknown>;
  }) => Promise<void>;
  projectStates: ScenarioProjectState[];
  loading: boolean;
}

type RefOptions = { value: string; label: string }[];

// SIM-04: Year options for scoping actions
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => ({
  value: String(2026 + i),
  label: String(2026 + i),
}));

export function AddActionForm({ onApplyAction, projectStates, loading }: Props) {
  const [section, setSection] = useState<'project' | 'portfolio'>('project');
  const [selectedAction, setSelectedAction] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [targetYears, setTargetYears] = useState<string[]>([]);

  // Reference data options
  const [lobOptions, setLobOptions] = useState<RefOptions>([]);
  const [roleOptions, setRoleOptions] = useState<RefOptions>([]);
  const [costCenterOptions, setCostCenterOptions] = useState<RefOptions>([]);
  const [locationOptions, setLocationOptions] = useState<RefOptions>([]);
  const [costTypeOptions, setCostTypeOptions] = useState<RefOptions>([]);

  // Fetch reference data once
  useEffect(() => {
    referenceApi.getLobs().then((res) => {
      setLobOptions(res.items.map((l) => ({ value: l.id, label: l.name })));
    });
    referenceApi.getRoles().then((res) => {
      setRoleOptions(res.items.map((r) => ({ value: r.id, label: r.name })));
    });
    referenceApi.getCostCenters().then((res) => {
      setCostCenterOptions(res.items.map((c) => ({ value: c.id, label: c.name })));
    });
    referenceApi.getLocations().then((res) => {
      setLocationOptions(res.items.map((l) => ({ value: l.id, label: `${l.city}` })));
    });
    referenceApi.getCostTypes().then((res) => {
      setCostTypeOptions(res.items.map((t) => ({ value: t.id, label: t.name })));
    });
  }, []);

  const actions = section === 'project' ? PROJECT_ACTIONS : PORTFOLIO_ACTIONS;
  const config = actions.find((a) => a.action_type === selectedAction);

  // Inject dynamic options
  const parameters = useMemo(() => {
    if (!config) return [];
    return config.parameters.map((p) => {
      if (p.key === 'lob_id') return { ...p, options: lobOptions };
      if (p.key === 'role_type_id') return { ...p, options: roleOptions };
      if (p.key === 'cost_type_id') return { ...p, options: costTypeOptions };

      // Conditional scope_values for rate escalation
      if (p.key === 'scope_values' && p.dependsOn === 'scope_type') {
        const scopeType = paramValues['scope_type'];
        if (scopeType === 'role') return { ...p, options: roleOptions };
        if (scopeType === 'cost_center') return { ...p, options: costCenterOptions };
        if (scopeType === 'location') return { ...p, options: locationOptions };
        return { ...p, options: [] };
      }

      return p;
    });
  }, [config, lobOptions, roleOptions, costCenterOptions, locationOptions, costTypeOptions, paramValues]);

  const projectOptions = useMemo(
    () =>
      projectStates.map((p) => ({
        value: p.project_id,
        label: p.project_name,
      })),
    [projectStates],
  );

  const resetForm = () => {
    setSelectedAction('');
    setSelectedProject('');
    setParamValues({});
    setTargetYears([]);
  };

  const handleSectionChange = (s: 'project' | 'portfolio') => {
    setSection(s);
    resetForm();
  };

  const handleActionChange = (value: string) => {
    setSelectedAction(value);
    setParamValues({});
  };

  const handleParamChange = (key: string, value: string) => {
    setParamValues((prev) => {
      const next = { ...prev, [key]: value };
      // Reset scope_values when scope_type changes
      if (key === 'scope_type') {
        delete next['scope_values'];
      }
      return next;
    });
  };

  const handleMultiSelectToggle = (key: string, value: string) => {
    setParamValues((prev) => {
      const current = prev[key] ? prev[key].split(',').filter(Boolean) : [];
      const updated = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [key]: updated.join(',') };
    });
  };

  const canApply = () => {
    if (!config) return false;
    if (config.requires_project && !selectedProject) return false;
    for (const p of parameters) {
      if (p.type === 'number') continue; // optional
      if (p.type === 'select' && !paramValues[p.key]) return false;
      if (p.type === 'text' && !paramValues[p.key]) return false;
      if (p.type === 'multi-select' && !paramValues[p.key]) return false;
    }
    return true;
  };

  const handleApply = async () => {
    if (!config) return;
    const params: Record<string, unknown> = {};
    for (const p of parameters) {
      const val = paramValues[p.key];
      if (val) {
        if (p.type === 'number') {
          params[p.key] = Number(val);
        } else if (p.type === 'multi-select') {
          params[p.key] = val.split(',').filter(Boolean);
        } else {
          params[p.key] = val;
        }
      }
    }
    // SIM-04: include target years if selected
    if (targetYears.length > 0) {
      params.target_years = targetYears;
    }
    await onApplyAction({
      scope: config.scope,
      action_type: config.action_type,
      ...(config.requires_project && selectedProject
        ? { project_id: selectedProject }
        : {}),
      parameters: params,
    });
    resetForm();
  };

  return (
    <div className="space-y-3">
      {/* Section tabs */}
      <div className="flex gap-1 bg-slate-100 p-0.5 rounded-md">
        <button
          className={`flex-1 text-xs font-medium py-1.5 rounded ${
            section === 'project'
              ? 'bg-white shadow-sm text-slate-900'
              : 'text-slate-500'
          }`}
          onClick={() => handleSectionChange('project')}
        >
          Project Actions
        </button>
        <button
          className={`flex-1 text-xs font-medium py-1.5 rounded ${
            section === 'portfolio'
              ? 'bg-white shadow-sm text-slate-900'
              : 'text-slate-500'
          }`}
          onClick={() => handleSectionChange('portfolio')}
        >
          Portfolio Rules
        </button>
      </div>

      {/* Action type selector */}
      <Select value={selectedAction} onValueChange={handleActionChange}>
        <SelectTrigger className="text-sm">
          <SelectValue placeholder="Select action type..." />
        </SelectTrigger>
        <SelectContent>
          {actions.map((a) => (
            <SelectItem key={a.action_type} value={a.action_type}>
              {a.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Project selector (for project-scope actions) */}
      {config?.requires_project && (
        <Select value={selectedProject} onValueChange={setSelectedProject}>
          <SelectTrigger className="text-sm">
            <SelectValue placeholder="Select project..." />
          </SelectTrigger>
          <SelectContent>
            {projectOptions.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* SIM-04: Year selector */}
      {config && (
        <div>
          <label className="text-xs text-slate-500 mb-1 block">
            Apply to Year(s) <span className="text-slate-400">(all years if none selected)</span>
          </label>
          <div className="border rounded-md max-h-28 overflow-y-auto p-2 space-y-1.5">
            {YEAR_OPTIONS.map((opt) => {
              const selected = targetYears.includes(opt.value);
              return (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={selected}
                    onCheckedChange={() =>
                      setTargetYears((prev) =>
                        prev.includes(opt.value)
                          ? prev.filter((v) => v !== opt.value)
                          : [...prev, opt.value]
                      )
                    }
                  />
                  <span className="text-sm text-slate-700">{opt.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Dynamic parameter fields */}
      {parameters.map((p) => (
        <div key={p.key}>
          <label className="text-xs text-slate-500 mb-1 block">{p.label}</label>
          {p.type === 'select' ? (
            <Select
              value={paramValues[p.key] || ''}
              onValueChange={(v) => handleParamChange(p.key, v)}
            >
              <SelectTrigger className="text-sm">
                <SelectValue placeholder={`Select ${p.label}...`} />
              </SelectTrigger>
              <SelectContent>
                {(p.options ?? []).map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : p.type === 'multi-select' ? (
            <div className="border rounded-md max-h-36 overflow-y-auto p-2 space-y-1.5">
              {(p.options ?? []).length === 0 ? (
                <p className="text-xs text-slate-400 py-1">Select scope first</p>
              ) : (
                (p.options ?? []).map((opt) => {
                  const selected = (paramValues[p.key] || '').split(',').includes(opt.value);
                  return (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={selected}
                        onCheckedChange={() => handleMultiSelectToggle(p.key, opt.value)}
                      />
                      <span className="text-sm text-slate-700">{opt.label}</span>
                    </label>
                  );
                })
              )}
            </div>
          ) : p.type === 'text' ? (
            <Input
              type="text"
              placeholder={p.placeholder}
              value={paramValues[p.key] || ''}
              onChange={(e) => handleParamChange(p.key, e.target.value)}
              className="text-sm"
            />
          ) : (
            <Input
              type="number"
              placeholder={p.placeholder}
              value={paramValues[p.key] || ''}
              onChange={(e) => handleParamChange(p.key, e.target.value)}
              className="text-sm"
            />
          )}
        </div>
      ))}

      {/* Apply button */}
      {config && (
        <Button
          size="sm"
          disabled={!canApply() || loading}
          onClick={handleApply}
          className="w-full"
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Apply Action
        </Button>
      )}
    </div>
  );
}
