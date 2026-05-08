/**
 * InboxFilterBar — filter controls for the Capacity Resource Requests
 * inbox (v5.2 W3, Track D, spec §12.4).
 *
 * Renders four filter controls above the request table:
 *
 *   - Status      — single-select pill group (All / New / In progress /
 *                   Re-confirm).
 *   - Role        — multi-select dropdown (popover + checkbox list of
 *                   role types present in the current rows).
 *   - PL          — multi-select dropdown of Project Leads with pending
 *                   requests.
 *   - Cost center — multi-select dropdown of CCs. Hidden for CC Owners
 *                   (server already scopes them to their managed CC).
 *
 * Filters are AND-combined and the active state is held by the parent
 * (`RequestsInbox.tsx`), which synchronises with the URL query string
 * via `useSearchParams({ replace: true })`. The bar itself is purely
 * controlled.
 */
import { useMemo } from 'react';
import { Check, ChevronDown, Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
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
import type { CapacityInboxStatus } from '@/types/api';

export interface InboxFilterValue {
  status: CapacityInboxStatus | 'all';
  roleTypeIds: string[];
  plPersonIds: string[];
  ccIds: string[];
}

export interface DropdownOption {
  value: string;
  label: string;
}

interface InboxFilterBarProps {
  value: InboxFilterValue;
  onChange: (next: InboxFilterValue) => void;
  /** Role-type options sourced from the current inbox payload. */
  roleOptions: DropdownOption[];
  /** PL options sourced from the current inbox payload. */
  plOptions: DropdownOption[];
  /** CC options sourced from the current inbox payload. */
  ccOptions: DropdownOption[];
  /** When true, hides the CC selector (CC Owner is auto-scoped). */
  hideCcFilter?: boolean;
}

const STATUS_PILLS: Array<{
  value: CapacityInboxStatus | 'all';
  label: string;
}> = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'in_progress', label: 'In progress' },
  { value: 're_confirm', label: 'Re-confirm' },
];

export function InboxFilterBar({
  value,
  onChange,
  roleOptions,
  plOptions,
  ccOptions,
  hideCcFilter = false,
}: InboxFilterBarProps) {
  const hasActive = useMemo(
    () =>
      value.status !== 'all' ||
      value.roleTypeIds.length > 0 ||
      value.plPersonIds.length > 0 ||
      value.ccIds.length > 0,
    [value],
  );

  const clearAll = () =>
    onChange({
      status: 'all',
      roleTypeIds: [],
      plPersonIds: [],
      ccIds: [],
    });

  const toggleInList = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Status pill group (single-select) */}
      <div
        role="group"
        aria-label="Filter by status"
        className="inline-flex rounded-md border border-border bg-card p-0.5"
      >
        {STATUS_PILLS.map((opt) => {
          const active = value.status === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ ...value, status: opt.value })}
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
      </div>

      {/* Role multi-select */}
      <MultiSelectDropdown
        label="Role"
        options={roleOptions}
        selected={value.roleTypeIds}
        onToggle={(id) =>
          onChange({
            ...value,
            roleTypeIds: toggleInList(value.roleTypeIds, id),
          })
        }
        onClear={() => onChange({ ...value, roleTypeIds: [] })}
        emptyMessage="No roles in queue"
      />

      {/* PL multi-select */}
      <MultiSelectDropdown
        label="PL"
        options={plOptions}
        selected={value.plPersonIds}
        onToggle={(id) =>
          onChange({
            ...value,
            plPersonIds: toggleInList(value.plPersonIds, id),
          })
        }
        onClear={() => onChange({ ...value, plPersonIds: [] })}
        emptyMessage="No PLs"
      />

      {/* CC multi-select — hidden for CC Owners */}
      {!hideCcFilter && (
        <MultiSelectDropdown
          label="Cost center"
          options={ccOptions}
          selected={value.ccIds}
          onToggle={(id) =>
            onChange({
              ...value,
              ccIds: toggleInList(value.ccIds, id),
            })
          }
          onClear={() => onChange({ ...value, ccIds: [] })}
          emptyMessage="No CCs"
        />
      )}

      {hasActive && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clearAll}
          className="text-muted-foreground"
        >
          <X className="h-3.5 w-3.5 mr-1" />
          Clear
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal multi-select popover, reused for Role / PL / CC.
// ---------------------------------------------------------------------------

interface MultiSelectDropdownProps {
  label: string;
  options: DropdownOption[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
  emptyMessage: string;
}

function MultiSelectDropdown({
  label,
  options,
  selected,
  onToggle,
  onClear,
  emptyMessage,
}: MultiSelectDropdownProps) {
  const count = selected.length;
  const labelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of options) m.set(o.value, o.label);
    return m;
  }, [options]);

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
            <span>{label}</span>
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
          <CommandInput placeholder={`Search ${label.toLowerCase()}…`} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
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

// labelById helper exported in case the inbox page wants to render a
// chip strip describing the active selections — left in module scope
// for future use.
export type { MultiSelectDropdownProps };
