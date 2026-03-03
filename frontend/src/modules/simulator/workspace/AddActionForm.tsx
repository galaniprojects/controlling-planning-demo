import { useState, useEffect, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  type: 'number' | 'select';
  placeholder?: string;
  options?: { value: string; label: string }[];
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
      {
        key: 'percentage',
        label: 'Percentage',
        type: 'number',
        placeholder: '-15',
      },
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
      {
        key: 'months',
        label: 'Months to Delay',
        type: 'number',
        placeholder: '3',
      },
    ],
  },
  {
    scope: 'project',
    action_type: 'accelerate_project',
    label: 'Accelerate Project',
    requires_project: true,
    parameters: [
      {
        key: 'months',
        label: 'Months Forward',
        type: 'number',
        placeholder: '3',
      },
    ],
  },
  {
    scope: 'project',
    action_type: 'cut_consulting',
    label: 'Cut Consulting',
    requires_project: true,
    parameters: [
      {
        key: 'percentage',
        label: 'Cut Percentage',
        type: 'number',
        placeholder: '15',
      },
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
      {
        key: 'percentage',
        label: 'Cut Percentage',
        type: 'number',
        placeholder: '20',
      },
    ],
  },
  {
    scope: 'portfolio',
    action_type: 'reduce_lob',
    label: 'Cut by LoB',
    requires_project: false,
    parameters: [
      { key: 'lob_id', label: 'Line of Business', type: 'select', options: [] },
      {
        key: 'percentage',
        label: 'Cut Percentage',
        type: 'number',
        placeholder: '15',
      },
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

export function AddActionForm({ onApplyAction, projectStates, loading }: Props) {
  const [section, setSection] = useState<'project' | 'portfolio'>('project');
  const [selectedAction, setSelectedAction] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [lobOptions, setLobOptions] = useState<
    { value: string; label: string }[]
  >([]);

  // Fetch LoB options once
  useEffect(() => {
    referenceApi.getLobs().then((res) => {
      setLobOptions(
        res.items.map((l) => ({ value: l.id, label: l.name })),
      );
    });
  }, []);

  const actions = section === 'project' ? PROJECT_ACTIONS : PORTFOLIO_ACTIONS;
  const config = actions.find((a) => a.action_type === selectedAction);

  // Inject dynamic LoB options
  const parameters = useMemo(() => {
    if (!config) return [];
    return config.parameters.map((p) => {
      if (p.key === 'lob_id') return { ...p, options: lobOptions };
      return p;
    });
  }, [config, lobOptions]);

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
  };

  const handleSectionChange = (s: 'project' | 'portfolio') => {
    setSection(s);
    resetForm();
  };

  const handleActionChange = (value: string) => {
    setSelectedAction(value);
    setParamValues({});
  };

  const canApply = () => {
    if (!config) return false;
    if (config.requires_project && !selectedProject) return false;
    for (const p of parameters) {
      if (!paramValues[p.key] && p.type === 'number') continue; // optional number
      if (p.type === 'select' && !paramValues[p.key]) return false;
    }
    return true;
  };

  const handleApply = async () => {
    if (!config) return;
    const params: Record<string, unknown> = {};
    for (const p of parameters) {
      const val = paramValues[p.key];
      if (val) {
        params[p.key] = p.type === 'number' ? Number(val) : val;
      }
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

      {/* Dynamic parameter fields */}
      {parameters.map((p) => (
        <div key={p.key}>
          <label className="text-xs text-slate-500 mb-1 block">{p.label}</label>
          {p.type === 'select' ? (
            <Select
              value={paramValues[p.key] || ''}
              onValueChange={(v) =>
                setParamValues((prev) => ({ ...prev, [p.key]: v }))
              }
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
          ) : (
            <Input
              type="number"
              placeholder={p.placeholder}
              value={paramValues[p.key] || ''}
              onChange={(e) =>
                setParamValues((prev) => ({ ...prev, [p.key]: e.target.value }))
              }
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
