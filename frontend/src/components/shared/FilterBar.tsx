import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X } from 'lucide-react';

export interface FilterConfig {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

interface FilterBarProps {
  filters: FilterConfig[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onClear: () => void;
}

export function FilterBar({ filters, values, onChange, onClear }: FilterBarProps) {
  const hasActiveFilters = Object.values(values).some((v) => v !== '');

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {filters.map((f) => {
        const isActive = !!values[f.key];
        return (
          <div key={f.key} className="relative flex items-center">
            <Select
              value={values[f.key] || ''}
              onValueChange={(val) => {
                if (val === '__all__') {
                  onChange(f.key, '');
                } else {
                  onChange(f.key, val);
                }
              }}
            >
              <SelectTrigger className="w-[160px] h-9 text-sm">
                <SelectValue placeholder={f.label} />
              </SelectTrigger>
              <SelectContent>
                {isActive && (
                  <SelectItem value="__all__" className="text-slate-500">
                    Show All
                  </SelectItem>
                )}
                {f.options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      })}
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={onClear} className="text-slate-500">
          <X className="h-3.5 w-3.5 mr-1" />
          Clear
        </Button>
      )}
    </div>
  );
}
