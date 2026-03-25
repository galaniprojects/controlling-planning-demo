import { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ActionItem } from './ActionItem';
import { AddActionForm } from './AddActionForm';
import type {
  ScenarioMetadata,
  ScenarioAction,
  ScenarioProjectState,
} from '@/types/api';

interface Props {
  metadata: ScenarioMetadata;
  actions: ScenarioAction[];
  onUpdateMetadata: (name?: string, description?: string) => Promise<void>;
  onRemoveAction: (actionId: number) => void;
  onApplyAction: (body: {
    scope: string;
    action_type: string;
    project_id?: string;
    parameters: Record<string, unknown>;
  }) => Promise<void>;
  projectStates: ScenarioProjectState[];
  loading: boolean;
  readOnly?: boolean;
}

export function ActionPanel({
  metadata,
  actions,
  onUpdateMetadata,
  onRemoveAction,
  onApplyAction,
  projectStates,
  loading,
  readOnly,
}: Props) {
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(metadata.name);
  const [descValue, setDescValue] = useState(metadata.description ?? '');

  const projectNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const ps of projectStates) {
      map.set(ps.project_id, ps.project_name);
    }
    return map;
  }, [projectStates]);

  const handleNameBlur = () => {
    setEditingName(false);
    if (nameValue.trim() && nameValue !== metadata.name) {
      onUpdateMetadata(nameValue.trim(), undefined);
    }
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleDescBlur = () => {
    const trimmed = descValue.trim();
    if (trimmed !== (metadata.description ?? '')) {
      onUpdateMetadata(undefined, trimmed || undefined);
    }
  };

  return (
    <div className="space-y-4">
      {/* Metadata section */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          {!readOnly && editingName ? (
            <Input
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={handleNameBlur}
              onKeyDown={handleNameKeyDown}
              autoFocus
              className="text-sm font-semibold"
            />
          ) : (
            <h3
              className={`text-sm font-semibold text-slate-900 flex-1 truncate ${!readOnly ? 'cursor-pointer hover:text-blue-800' : ''}`}
              onClick={readOnly ? undefined : () => setEditingName(true)}
              title={readOnly ? undefined : 'Click to edit'}
            >
              {metadata.name}
            </h3>
          )}
          <Badge
            className={
              metadata.status === 'published'
                ? 'bg-green-100 text-green-700 hover:bg-green-100'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-100'
            }
          >
            {metadata.status === 'published' ? 'Published' : 'Private'}
          </Badge>
        </div>
        {readOnly ? (
          <p className="text-xs text-slate-600">{metadata.description || 'No description.'}</p>
        ) : (
          <Textarea
            value={descValue}
            onChange={(e) => setDescValue(e.target.value)}
            onBlur={handleDescBlur}
            placeholder="Add a description..."
            className="text-xs min-h-[60px] resize-none"
            rows={2}
          />
        )}
      </Card>

      {/* Applied actions list */}
      <div>
        <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
          Applied Actions ({actions.length})
        </h4>
        {actions.length === 0 ? (
          <p className="text-xs text-slate-400 italic px-3 py-4 text-center">
            No actions applied yet. Add actions below to model scenario impacts.
          </p>
        ) : (
          <div className="space-y-0.5">
            {actions
              .sort((a, b) => a.action_order - b.action_order)
              .map((action) => (
                <ActionItem
                  key={action.id}
                  action={action}
                  onRemove={onRemoveAction}
                  projectNames={projectNames}
                  readOnly={readOnly}
                />
              ))}
          </div>
        )}
      </div>

      {!readOnly && (
        <>
          <Separator />
          {/* Add action form */}
          <div>
            <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
              Add Action
            </h4>
            <AddActionForm
              onApplyAction={onApplyAction}
              projectStates={projectStates}
              loading={loading}
            />
          </div>
        </>
      )}
    </div>
  );
}
