/**
 * AvailabilityScopeBar — v5.2 W4 Track C (spec §13.3)
 *
 * Horizontal scope controls row with:
 *   - Single-select location dropdown: "All locations" + per-location entries
 *     with headcount label. Locations with zero headcount are hidden.
 *   - Multi-select role filter: all role types with checkbox indicators.
 *   - Reset filters button (restores All locations + all roles).
 *
 * Controlled by PLAvailabilityView (no internal state).
 */
import { useState } from 'react';
import { Check, ChevronsUpDown, MapPin, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

export interface LocationOption {
  id: string;
  name: string;
  headcount: number;
}

export interface RoleTypeOption {
  id: string;
  name: string;
}

interface AvailabilityScopeBarProps {
  locations: LocationOption[];
  roleTypes: RoleTypeOption[];
  /** Selected location ID — null means "All locations". */
  selectedLocationId: string | null;
  /** Selected role type IDs — empty array means all selected. */
  selectedRoleIds: string[];
  onLocationChange: (locationId: string | null) => void;
  onRoleFilterChange: (roleIds: string[]) => void;
}

const ALL_LOCATIONS_VALUE = '__all__';

export function AvailabilityScopeBar({
  locations,
  roleTypes,
  selectedLocationId,
  selectedRoleIds,
  onLocationChange,
  onRoleFilterChange,
}: AvailabilityScopeBarProps) {
  const [rolePopoverOpen, setRolePopoverOpen] = useState(false);

  const isFiltered =
    selectedLocationId !== null || selectedRoleIds.length > 0;

  // Locations with headcount > 0
  const visibleLocations = locations.filter((l) => l.headcount > 0);

  // Role filter display label
  const allRolesSelected =
    selectedRoleIds.length === 0 || selectedRoleIds.length === roleTypes.length;
  const roleFilterLabel = allRolesSelected
    ? 'All roles'
    : selectedRoleIds.length === 1
      ? (roleTypes.find((r) => r.id === selectedRoleIds[0])?.name ?? '1 role')
      : `${selectedRoleIds.length} roles`;

  function handleLocationChange(value: string) {
    if (value === ALL_LOCATIONS_VALUE) {
      onLocationChange(null);
    } else {
      onLocationChange(value);
    }
  }

  function toggleRole(roleId: string) {
    if (selectedRoleIds.includes(roleId)) {
      const next = selectedRoleIds.filter((id) => id !== roleId);
      // If nothing left selected, treat as "all"
      onRoleFilterChange(next.length === 0 ? [] : next);
    } else {
      onRoleFilterChange([...selectedRoleIds, roleId]);
    }
  }

  function handleReset() {
    onLocationChange(null);
    onRoleFilterChange([]);
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Location picker */}
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
        <Select
          value={selectedLocationId ?? ALL_LOCATIONS_VALUE}
          onValueChange={handleLocationChange}
        >
          <SelectTrigger className="w-48 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_LOCATIONS_VALUE}>
              All locations
            </SelectItem>
            {visibleLocations.map((loc) => (
              <SelectItem key={loc.id} value={loc.id}>
                {loc.name} ({loc.headcount})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Role filter */}
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground shrink-0" />
        <Popover open={rolePopoverOpen} onOpenChange={setRolePopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={rolePopoverOpen}
              aria-label="Filter by role type"
              className="w-44 h-8 justify-between text-sm font-normal"
            >
              <span className="truncate">{roleFilterLabel}</span>
              <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search roles..." className="h-8" />
              <CommandList>
                <CommandEmpty>No roles found.</CommandEmpty>
                <CommandGroup>
                  {roleTypes.map((role) => {
                    const isSelected = allRolesSelected
                      ? false
                      : selectedRoleIds.includes(role.id);
                    return (
                      <CommandItem
                        key={role.id}
                        value={role.name}
                        onSelect={() => toggleRole(role.id)}
                      >
                        <div
                          className={cn(
                            'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-border',
                            isSelected
                              ? 'bg-primary border-primary text-primary-foreground'
                              : 'opacity-50',
                          )}
                        >
                          {isSelected && <Check className="h-3 w-3" />}
                        </div>
                        {role.name}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Reset */}
      {isFiltered && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-muted-foreground"
          onClick={handleReset}
          aria-label="Reset all filters"
        >
          <X className="h-3.5 w-3.5" />
          Reset
        </Button>
      )}
    </div>
  );
}
