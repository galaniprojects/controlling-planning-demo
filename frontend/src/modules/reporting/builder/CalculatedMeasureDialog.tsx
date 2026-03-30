import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Trash2 } from 'lucide-react';
import type { CalcOperator, MeasureItem } from '@/types/reportBuilder';
import {
  buildCalculatedMeasureItem,
  isCalculatedMeasure,
  validateFormula,
} from './calculatedMeasures';
import { formatCurrencyDetailed, formatNumber, formatPercent } from '@/lib/formatters';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** All measures available as operands (catalog + calculated in values). */
  availableMeasures: MeasureItem[];
  /** All calculated measures (for circular ref validation). */
  allCalcMeasures: MeasureItem[];
  /** Pre-fill when editing an existing calc measure. */
  editingMeasure?: MeasureItem | null;
  /** First result row for preview computation. */
  previewRow?: Record<string, string | number | null> | null;
  onSave: (measure: MeasureItem) => void;
  onDelete?: (measureId: string) => void;
}

const OPERATORS: { value: CalcOperator; label: string }[] = [
  { value: '+', label: '+' },
  { value: '-', label: '\u2212' },
  { value: '*', label: '\u00D7' },
  { value: '/', label: '\u00F7' },
];

const FORMAT_OPTIONS = [
  { value: 'currency', label: '\u20AC Euro' },
  { value: 'percent', label: '% Percentage' },
  { value: 'number', label: '# Number' },
  { value: 'hours', label: 'h Hours' },
];

function formatPreview(value: number | null, format: string): string {
  if (value == null) return '\u2014';
  switch (format) {
    case 'currency':
      return formatCurrencyDetailed(value);
    case 'percent':
      return formatPercent(value);
    case 'hours':
      return `${formatNumber(value)} h`;
    default:
      return formatNumber(value);
  }
}

export function CalculatedMeasureDialog({
  open,
  onOpenChange,
  availableMeasures,
  allCalcMeasures,
  editingMeasure,
  previewRow,
  onSave,
  onDelete,
}: Props) {
  const [name, setName] = useState('');
  const [operandA, setOperandA] = useState('');
  const [operator, setOperator] = useState<CalcOperator>('+');
  const [operandB, setOperandB] = useState('');
  const [format, setFormat] = useState('currency');

  // Reset form when dialog opens / editing changes
  useEffect(() => {
    if (open) {
      if (editingMeasure?.calculated) {
        setName(editingMeasure.display_name);
        setOperandA(editingMeasure.calculated.operandA);
        setOperator(editingMeasure.calculated.operator);
        setOperandB(editingMeasure.calculated.operandB);
        setFormat(editingMeasure.format);
      } else {
        setName('');
        setOperandA('');
        setOperator('+');
        setOperandB('');
        setFormat('currency');
      }
    }
  }, [open, editingMeasure]);

  // Measures available as operands: catalog + other calc measures (exclude self when editing)
  const operandOptions = useMemo(
    () => availableMeasures.filter((m) => m.id !== editingMeasure?.id),
    [availableMeasures, editingMeasure],
  );

  // Validation
  const validationError = useMemo(() => {
    if (!operandA || !operandB) return null;
    return validateFormula(operandA, operandB, allCalcMeasures, editingMeasure?.id);
  }, [operandA, operandB, allCalcMeasures, editingMeasure]);

  const canSubmit = name.trim() && operandA && operandB && !validationError;

  // Preview value
  const previewValue = useMemo(() => {
    if (!previewRow || !operandA || !operandB) return null;
    const a = previewRow[operandA] as number | null;
    const b = previewRow[operandB] as number | null;
    if (a == null || b == null) return null;
    switch (operator) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return b === 0 ? null : a / b;
    }
  }, [previewRow, operandA, operandB, operator]);

  function handleSave() {
    if (!canSubmit) return;
    const measure = buildCalculatedMeasureItem({
      name: name.trim(),
      operandA,
      operator,
      operandB,
      format,
      id: editingMeasure?.id,
    });
    onSave(measure);
    onOpenChange(false);
  }

  function handleDelete() {
    if (editingMeasure && onDelete) {
      onDelete(editingMeasure.id);
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editingMeasure ? 'Edit Calculated Measure' : 'Calculated Measure'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Budget Variance"
              autoFocus
            />
          </div>

          {/* Formula */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Formula</label>
            <div className="flex items-center gap-2">
              <Select value={operandA} onValueChange={setOperandA}>
                <SelectTrigger className="flex-1 text-xs">
                  <SelectValue placeholder="Measure A" />
                </SelectTrigger>
                <SelectContent>
                  {operandOptions.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="text-xs">
                      {isCalculatedMeasure(m) ? `fx ${m.display_name}` : m.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={operator} onValueChange={(v) => setOperator(v as CalcOperator)}>
                <SelectTrigger className="w-16 text-center font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPERATORS.map((op) => (
                    <SelectItem key={op.value} value={op.value} className="font-mono">
                      {op.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={operandB} onValueChange={setOperandB}>
                <SelectTrigger className="flex-1 text-xs">
                  <SelectValue placeholder="Measure B" />
                </SelectTrigger>
                <SelectContent>
                  {operandOptions.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="text-xs">
                      {isCalculatedMeasure(m) ? `fx ${m.display_name}` : m.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Format */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Format</label>
            <div className="flex gap-1.5">
              {FORMAT_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  variant={format === opt.value ? 'secondary' : 'ghost'}
                  size="sm"
                  className="text-xs"
                  onClick={() => setFormat(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Preview */}
          {previewRow && operandA && operandB && (
            <div className="rounded-md bg-muted/40 p-3 text-sm">
              <span className="text-muted-foreground">Preview: </span>
              <span className="font-medium text-foreground">
                {formatPreview(previewValue, format)}
              </span>
            </div>
          )}

          {/* Validation error */}
          {validationError && (
            <p className="text-sm text-destructive">{validationError}</p>
          )}
        </div>

        <DialogFooter className="flex items-center gap-2">
          {editingMeasure && onDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="mr-auto text-destructive hover:text-destructive"
              onClick={handleDelete}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Delete
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={!canSubmit} onClick={handleSave}>
            {editingMeasure ? 'Update' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
