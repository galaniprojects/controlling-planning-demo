import { ArrowDown, ArrowUp, ChevronDown, Filter, Rows3, Columns3, Sigma, X, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { DimensionItem, MeasureItem, ZoneName } from '@/types/reportBuilder';
import type { FilterSelections, ZoneState } from './useReportBuilder';
import { isCalculatedMeasure } from './calculatedMeasures';

interface DropZonesProps {
  zones: ZoneState;
  filterSelections: FilterSelections;
  filterOptions: Record<string, string[]>;
  onRemove: (id: string) => void;
  onMoveDimension: (dimId: string, zone: 'rows' | 'columns' | 'filters') => void;
  onReorder: (zone: ZoneName, itemId: string, direction: 'up' | 'down') => void;
  onFilterChange: (dimensionId: string, values: string[]) => void;
  onEditCalcMeasure?: (measureId: string) => void;
  onDeleteCalcMeasure?: (measureId: string) => void;
}

export function DropZones({
  zones,
  filterSelections,
  filterOptions,
  onRemove,
  onMoveDimension,
  onReorder,
  onFilterChange,
  onEditCalcMeasure,
  onDeleteCalcMeasure,
}: DropZonesProps) {
  return (
    <div className="space-y-3">
      {/* Filters zone */}
      <ZoneArea
        label="Filters"
        icon={<Filter className="h-3.5 w-3.5" />}
        empty={zones.filters.length === 0}
        emptyText="Click dimensions in the catalog to add filters"
        horizontal
      >
        {zones.filters.map((dim) => (
          <FilterChip
            key={dim.id}
            dim={dim}
            options={filterOptions[dim.id] || []}
            selected={filterSelections[dim.id] || []}
            onSelectionChange={(vals) => onFilterChange(dim.id, vals)}
            onRemove={() => onRemove(dim.id)}
            onMove={onMoveDimension}
          />
        ))}
      </ZoneArea>

      <div className="grid grid-cols-2 gap-3">
        {/* Rows zone */}
        <ZoneArea
          label="Rows"
          icon={<Rows3 className="h-3.5 w-3.5" />}
          empty={zones.rows.length === 0}
          emptyText="Add dimensions for row grouping"
        >
          {zones.rows.map((dim, idx) => (
            <DimensionChip
              key={dim.id}
              dim={dim}
              currentZone="rows"
              index={idx}
              total={zones.rows.length}
              onRemove={() => onRemove(dim.id)}
              onMove={onMoveDimension}
              onReorder={(dir) => onReorder('rows', dim.id, dir)}
            />
          ))}
        </ZoneArea>

        {/* Columns zone */}
        <ZoneArea
          label="Columns"
          icon={<Columns3 className="h-3.5 w-3.5" />}
          empty={zones.columns.length === 0}
          emptyText="Add dimensions for column headers"
        >
          {zones.columns.map((dim, idx) => (
            <DimensionChip
              key={dim.id}
              dim={dim}
              currentZone="columns"
              index={idx}
              total={zones.columns.length}
              onRemove={() => onRemove(dim.id)}
              onMove={onMoveDimension}
              onReorder={(dir) => onReorder('columns', dim.id, dir)}
            />
          ))}
        </ZoneArea>
      </div>

      {/* Values zone */}
      <ZoneArea
        label="Values"
        icon={<Sigma className="h-3.5 w-3.5" />}
        empty={zones.values.length === 0}
        emptyText="Click measures in the catalog to add values"
        horizontal
      >
        {zones.values.map((measure, idx) => (
          <MeasureChip
            key={measure.id}
            measure={measure}
            index={idx}
            total={zones.values.length}
            onRemove={() => onRemove(measure.id)}
            onReorder={(dir) => onReorder('values', measure.id, dir)}
            onEdit={isCalculatedMeasure(measure) && onEditCalcMeasure ? () => onEditCalcMeasure(measure.id) : undefined}
            onDelete={isCalculatedMeasure(measure) && onDeleteCalcMeasure ? () => onDeleteCalcMeasure(measure.id) : undefined}
          />
        ))}
      </ZoneArea>
    </div>
  );
}

/* --- Sub-components --- */

function ZoneArea({
  label,
  icon,
  empty,
  emptyText,
  horizontal,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  empty: boolean;
  emptyText: string;
  horizontal?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-2.5">
      <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      {empty ? (
        <div className="rounded border border-dashed border-border px-3 py-2 text-xs text-muted-foreground text-center">
          {emptyText}
        </div>
      ) : (
        <div className={horizontal ? 'flex flex-wrap gap-1.5' : 'space-y-1'}>
          {children}
        </div>
      )}
    </div>
  );
}

function DimensionChip({
  dim,
  currentZone,
  index,
  total,
  onRemove,
  onMove,
  onReorder,
}: {
  dim: DimensionItem;
  currentZone: 'rows' | 'columns' | 'filters';
  index: number;
  total: number;
  onRemove: () => void;
  onMove: (dimId: string, zone: 'rows' | 'columns' | 'filters') => void;
  onReorder: (dir: 'up' | 'down') => void;
}) {
  const otherZones = (['rows', 'columns', 'filters'] as const).filter((z) => z !== currentZone);

  return (
    <div className="flex items-center gap-1 rounded bg-accent/50 px-2 py-1 text-xs">
      <span className="flex-1 truncate text-foreground font-medium">{dim.display_name}</span>
      {total > 1 && (
        <div className="flex gap-0.5">
          <button
            onClick={() => onReorder('up')}
            disabled={index === 0}
            className="p-0.5 hover:bg-accent rounded disabled:opacity-30"
          >
            <ArrowUp className="h-3 w-3" />
          </button>
          <button
            onClick={() => onReorder('down')}
            disabled={index === total - 1}
            className="p-0.5 hover:bg-accent rounded disabled:opacity-30"
          >
            <ArrowDown className="h-3 w-3" />
          </button>
        </div>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="p-0.5 hover:bg-accent rounded">
            <ChevronDown className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          {otherZones.map((z) => (
            <DropdownMenuItem key={z} onClick={() => onMove(dim.id, z)}>
              Move to {z.charAt(0).toUpperCase() + z.slice(1)}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onClick={onRemove} className="text-destructive">
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <button onClick={onRemove} className="p-0.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function FilterChip({
  dim,
  options,
  selected,
  onSelectionChange,
  onRemove,
  onMove,
}: {
  dim: DimensionItem;
  options: string[];
  selected: string[];
  onSelectionChange: (vals: string[]) => void;
  onRemove: () => void;
  onMove: (dimId: string, zone: 'rows' | 'columns' | 'filters') => void;
}) {
  const label =
    selected.length === 0 ? 'All' : selected.length === 1 ? selected[0] : `${selected.length} selected`;

  return (
    <div className="flex items-center gap-1 rounded bg-accent/50 px-2 py-1 text-xs">
      <span className="text-foreground font-medium whitespace-nowrap">{dim.display_name}:</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <span className="truncate max-w-[120px]">{label}</span>
            <ChevronDown className="h-3 w-3 flex-shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52 max-h-60 overflow-y-auto">
          <DropdownMenuItem
            onClick={(e) => {
              e.preventDefault();
              onSelectionChange([]);
            }}
          >
            <span className="text-xs font-medium">Clear All</span>
          </DropdownMenuItem>
          {options.map((opt) => {
            const checked = selected.includes(opt);
            return (
              <DropdownMenuItem
                key={opt}
                onClick={(e) => {
                  e.preventDefault();
                  if (checked) {
                    onSelectionChange(selected.filter((v) => v !== opt));
                  } else {
                    onSelectionChange([...selected, opt]);
                  }
                }}
              >
                <Checkbox checked={checked} className="mr-2" />
                <span className="text-xs truncate">{opt}</span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="p-0.5 hover:bg-accent rounded">
            <ChevronDown className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem onClick={() => onMove(dim.id, 'rows')}>Move to Rows</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onMove(dim.id, 'columns')}>Move to Columns</DropdownMenuItem>
          <DropdownMenuItem onClick={onRemove} className="text-destructive">
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <button onClick={onRemove} className="p-0.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function MeasureChip({
  measure,
  index,
  total,
  onRemove,
  onReorder,
  onEdit,
  onDelete,
}: {
  measure: MeasureItem;
  index: number;
  total: number;
  onRemove: () => void;
  onReorder: (dir: 'up' | 'down') => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const isCalc = isCalculatedMeasure(measure);

  return (
    <div className="flex items-center gap-1 rounded bg-primary/10 px-2 py-1 text-xs">
      {isCalc ? (
        <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono leading-tight flex-shrink-0">
          fx
        </Badge>
      ) : (
        <Sigma className="h-3 w-3 text-primary flex-shrink-0" />
      )}
      <span className="text-foreground font-medium truncate">{measure.display_name}</span>
      {total > 1 && (
        <div className="flex gap-0.5">
          <button
            onClick={() => onReorder('up')}
            disabled={index === 0}
            className="p-0.5 hover:bg-accent rounded disabled:opacity-30"
          >
            <ArrowUp className="h-3 w-3" />
          </button>
          <button
            onClick={() => onReorder('down')}
            disabled={index === total - 1}
            className="p-0.5 hover:bg-accent rounded disabled:opacity-30"
          >
            <ArrowDown className="h-3 w-3" />
          </button>
        </div>
      )}
      {isCalc && onEdit && onDelete ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-0.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground">
              <ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-32">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="h-3 w-3 mr-1.5" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-destructive">
              <Trash2 className="h-3 w-3 mr-1.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <button onClick={onRemove} className="p-0.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground">
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
