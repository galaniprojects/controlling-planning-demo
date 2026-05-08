/**
 * HistoryFilterBar — filter controls for the Capacity audit history
 * page (v5.2 W3, Track D, spec §12.12).
 *
 * Five filter controls render in a horizontal row above the history
 * table:
 *
 *   - Acting user — searchable single-select dropdown. Default for
 *     CC Owner is "Me" (current persona's person_id); Controller +
 *     Executive default is "All". Always offers an explicit "All
 *     users" option.
 *   - Action type — multi-select pill group (Confirm / Partial /
 *     Decline / Draft / Re-confirm). All selected by default.
 *   - Cost center — multi-select dropdown. Hidden for CC Owners
 *     (server auto-scopes).
 *   - Date range — `<input type="date" />` pair, "from" / "to".
 *     Defaults to last 30 days.
 *   - Project — searchable single-select dropdown.
 *
 * The bar is fully controlled — the parent owns state and URL
 * persistence.
 */
import { useMemo } from 'react';
import { Check, ChevronDown, Filter, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';

export type HistoryActionFilter =
  | 'confirm'
  | 'partial_confirm'
  | 'decline'
  | 'assign_draft'
  | 'cr_reconfirm';

export interface HistoryFilterValue {
  /** Person id, "all" sentinel, or "me" sentinel (resolved by parent). */
  actingUserId: string | 'all';
  actionTypes: HistoryActionFilter[];
  ccIds: string[];
  projectId: string | 'all';
  /** ISO YYYY-MM-DD inclusive. */
  from: string;
  /** ISO YYYY-MM-DD inclusive. */
  to: string;
}

export interface DropdownOption {
  value: string;
  label: string;
  /** Optional helper text shown to the right of the label. */
  hint?: string;
}

interface HistoryFilterBarProps {
  value: HistoryFilterValue;
  onChange: (next: HistoryFilterValue) => void;
  userOptions: DropdownOption[];
  ccOptions: DropdownOption[];
  projectOptions: DropdownOption[];
  hideCcFilter?: boolean;
  /** Render the special "Me" entry in the user dropdown. */
  meOption?: DropdownOption;
}

const ACTION_PILLS: Array<{ value: HistoryActionFilter; label: string }> = [
  { value: 'confirm', label: 'Confirm' },
  { value: 'partial_confirm', label: 'Partial' },
  { value: 'decline', label: 'Decline' },
  { value: 'assign_draft', label: 'Draft' },
  { value: 'cr_reconfirm', label: 'Re-confirm' },
];

export const ALL_ACTION_TYPES: HistoryActionFilter[] = ACTION_PILLS.map(
  (p) => p.value,
);

export function HistoryFilterBar({
  value,
  onChange,
  userOptions,
  ccOptions,
  projectOptions,
  hideCcFilter = false,
  meOption,
}: HistoryFilterBarProps) {
  // ---- Defaults / "active" detection ----
  const allActionsSelected =
    value.actionTypes.length === ACTION_PILLS.length;

  const hasActive =
    value.actingUserId !== 'all' ||
    !allActionsSelected ||
    value.ccIds.length > 0 ||
    value.projectId !== 'all';

  // ---- Handlers ----
  const toggleActionType = (key: HistoryActionFilter) => {
    const set = new Set(value.actionTypes);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    if (set.size === 0) {
      // Don't allow zero — interpret "no action types" as "all" to keep
      // the table populated.
      onChange({ ...value, actionTypes: ALL_ACTION_TYPES });
      return;
    }
    onChange({ ...value, actionTypes: Array.from(set) });
  };

  const resetActions = () =>
    onChange({ ...value, actionTypes: ALL_ACTION_TYPES });

  const toggleCc = (id: string) => {
    const next = value.ccIds.includes(id)
      ? value.ccIds.filter((c) => c !== id)
      : [...value.ccIds, id];
    onChange({ ...value, ccIds: next });
  };

  return (
    <div className="flex items-start gap-3 flex-wrap">
      {/* Acting user (single-select) */}
      <SingleSelectDropdown
        label="User"
        emptyMessage="No users"
        value={value.actingUserId}
        options={userOptions}
        prependOptions={[
          { value: 'all', label: 'All users' },
          ...(meOption ? [meOption] : []),
        ]}
        onSelect={(v) => onChange({ ...value, actingUserId: v })}
      />

      {/* Action types (multi-select pill group) */}
      <div
        role="group"
        aria-label="Filter by action type"
        className="inline-flex rounded-md border border-border bg-card p-0.5 flex-wrap"
      >
        {ACTION_PILLS.map((opt) => {
          const active = value.actionTypes.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggleActionType(opt.value)}
              aria-pressed={active}
              className={cn(
                'inline-flex items-center px-3 h-7 text-xs font-medium rounded-[5px] transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              {opt.label}
            </button>
          );
        })}
        {!allActionsSelected && (
          <button
            type="button"
            onClick={resetActions}
            className="inline-flex items-center px-2 text-[11px] text-muted-foreground hover:text-foreground"
            aria-label="Reset action filter"
            title="Reset"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Cost center multi-select — hidden for CC Owners */}
      {!hideCcFilter && (
        <CcMultiSelect
          options={ccOptions}
          selected={value.ccIds}
          onToggle={toggleCc}
          onClear={() => onChange({ ...value, ccIds: [] })}
        />
      )}

      {/* Project (single-select) */}
      <SingleSelectDropdown
        label="Project"
        emptyMessage="No projects"
        value={value.projectId}
        options={projectOptions}
        prependOptions={[{ value: 'all', label: 'All projects' }]}
        onSelect={(v) => onChange({ ...value, projectId: v })}
      />

      {/* Date range */}
      <div className="inline-flex items-center gap-2">
        <Input
          type="date"
          value={value.from}
          max={value.to || undefined}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
          className="w-[150px] h-9"
          aria-label="From date"
        />
        <span className="text-xs text-muted-foreground" aria-hidden="true">
          →
        </span>
        <Input
          type="date"
          value={value.to}
          min={value.from || undefined}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
          className="w-[150px] h-9"
          aria-label="To date"
        />
      </div>

      {hasActive && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            onChange({
              ...value,
              actingUserId: 'all',
              actionTypes: ALL_ACTION_TYPES,
              ccIds: [],
              projectId: 'all',
            })
          }
          className="text-muted-foreground"
        >
          <X className="h-3.5 w-3.5 mr-1" />
          Reset filters
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal: single-select searchable dropdown
// ---------------------------------------------------------------------------

interface SingleSelectDropdownProps {
  label: string;
  emptyMessage: string;
  value: string;
  options: DropdownOption[];
  prependOptions?: DropdownOption[];
  onSelect: (value: string) => void;
}

function SingleSelectDropdown({
  label,
  emptyMessage,
  value,
  options,
  prependOptions = [],
  onSelect,
}: SingleSelectDropdownProps) {
  const allOptions = useMemo(
    () => [...prependOptions, ...options],
    [prependOptions, options],
  );

  const selected = allOptions.find((o) => o.value === value);
  const isAll = value === 'all';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            'h-9 px-3 text-sm font-normal justify-between min-w-[160px]',
            !isAll && 'border-primary/40',
          )}
        >
          <span className="inline-flex items-center gap-1.5 truncate">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate">
              {label}
              {!isAll && selected ? `: ${selected.label}` : ''}
            </span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-1.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder={`Search ${label.toLowerCase()}…`} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {allOptions.map((opt) => {
                const checked = opt.value === value;
                return (
                  <CommandItem
                    key={opt.value}
                    value={`${opt.label} ${opt.value}`}
                    onSelect={() => onSelect(opt.value)}
                    className="cursor-pointer"
                  >
                    <span
                      className={cn(
                        'mr-2 flex h-4 w-4 items-center justify-center rounded-full border',
                        checked
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-border bg-transparent',
                      )}
                      aria-hidden="true"
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <span className="truncate flex-1">{opt.label}</span>
                    {opt.hint && (
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        {opt.hint}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Internal: CC multi-select dropdown
// ---------------------------------------------------------------------------

interface CcMultiSelectProps {
  options: DropdownOption[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
}

function CcMultiSelect({
  options,
  selected,
  onToggle,
  onClear,
}: CcMultiSelectProps) {
  const count = selected.length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            'h-9 px-3 text-sm font-normal justify-between',
            count > 0 && 'border-primary/40',
          )}
        >
          <span className="inline-flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Cost center</span>
            {count > 0 && (
              <Badge
                variant="secondary"
                className="h-5 px-1.5 text-[10px] tabular-nums"
              >
                {count}
              </Badge>
            )}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-1.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search cost centers…" />
          <CommandList>
            <CommandEmpty>No cost centers</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => {
                const checked = selected.includes(opt.value);
                return (
                  <CommandItem
                    key={opt.value}
                    value={`${opt.label} ${opt.value}`}
                    onSelect={() => onToggle(opt.value)}
                    className="cursor-pointer"
                  >
                    <span
                      className={cn(
                        'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border',
                        checked
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-border bg-transparent',
                      )}
                      aria-hidden="true"
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <span className="truncate">{opt.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {count > 0 && (
              <div className="border-t border-border p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-center text-xs"
                  onClick={onClear}
                >
                  Clear selection
                </Button>
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
