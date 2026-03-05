import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  required?: boolean;
  optionsKey?: string;
}

const ENTITY_FIELDS: Record<string, FieldDef[]> = {
  cost_center: [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'location_id', label: 'Location', type: 'select', required: true, optionsKey: 'locationOptions' },
    { key: 'competence_center_id', label: 'Competence Center', type: 'select', required: true, optionsKey: 'competenceCenterOptions' },
  ],
  competence_center: [
    { key: 'name', label: 'Name', type: 'text', required: true },
  ],
  lob: [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'description', label: 'Description', type: 'textarea' },
  ],
  location: [
    { key: 'city', label: 'City', type: 'text', required: true },
    { key: 'country', label: 'Country', type: 'text', required: true },
  ],
  person: [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'role_type_id', label: 'Role', type: 'select', required: true, optionsKey: 'roleOptions' },
    { key: 'cost_center_id', label: 'Cost Center', type: 'select', optionsKey: 'costCenterOptions' },
  ],
};

interface EntityFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  entityType: string;
  entityLabel: string;
  initialValues?: Record<string, string>;
  onSubmit: (values: Record<string, string>) => Promise<void>;
  dropdownOptions?: Record<string, { value: string; label: string }[]>;
}

export function EntityFormDialog({
  open,
  onOpenChange,
  mode,
  entityType,
  entityLabel,
  initialValues,
  onSubmit,
  dropdownOptions = {},
}: EntityFormDialogProps) {
  const fields = ENTITY_FIELDS[entityType] ?? [];
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const init: Record<string, string> = {};
      for (const f of fields) {
        init[f.key] = initialValues?.[f.key] ?? '';
      }
      setValues(init);
      setError(null);
    }
  }, [open, initialValues, entityType]);

  const handleSubmit = async () => {
    // Validate required fields
    for (const f of fields) {
      if (f.required && !values[f.key]?.trim()) {
        setError(`${f.label} is required.`);
        return;
      }
    }
    setSubmitting(true);
    setError(null);
    try {
      // Only send non-empty values for edit mode
      const payload: Record<string, string> = {};
      for (const f of fields) {
        if (values[f.key]?.trim()) {
          payload[f.key] = values[f.key].trim();
        }
      }
      await onSubmit(payload);
      onOpenChange(false);
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderField = (field: FieldDef) => {
    if (field.type === 'select') {
      const options = dropdownOptions[field.optionsKey ?? ''] ?? [];
      return (
        <div key={field.key} className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">
            {field.label} {field.required && <span className="text-red-500">*</span>}
          </label>
          <Select
            value={values[field.key] || ''}
            onValueChange={(val) => setValues((v) => ({ ...v, [field.key]: val }))}
          >
            <SelectTrigger>
              <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }
    if (field.type === 'textarea') {
      return (
        <div key={field.key} className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">
            {field.label} {field.required && <span className="text-red-500">*</span>}
          </label>
          <Textarea
            value={values[field.key] || ''}
            onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
            rows={3}
          />
        </div>
      );
    }
    return (
      <div key={field.key} className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">
          {field.label} {field.required && <span className="text-red-500">*</span>}
        </label>
        <Input
          value={values[field.key] || ''}
          onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
        />
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? `Add New ${entityLabel}` : `Edit ${entityLabel}`}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {fields.map(renderField)}
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Saving...' : mode === 'create' ? 'Create' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
