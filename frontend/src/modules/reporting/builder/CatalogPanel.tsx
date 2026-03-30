import { useState } from 'react';
import { Box, ChevronDown, ChevronRight, Search, Sigma } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { CatalogResponse, DimensionItem, MeasureItem, ZoneName } from '@/types/reportBuilder';
import { isCalculatedMeasure } from './calculatedMeasures';

interface CatalogPanelProps {
  catalog: CatalogResponse;
  calculatedMeasures?: MeasureItem[];
  findItemZone: (id: string) => ZoneName | null;
  onAddDimension: (dim: DimensionItem, zone: 'rows' | 'columns' | 'filters') => void;
  onAddMeasure: (measure: MeasureItem) => void;
  onRemoveItem: (id: string) => void;
}

const ZONE_LABELS: Record<string, string> = {
  rows: 'Rows',
  columns: 'Columns',
  filters: 'Filters',
  values: 'Values',
};

export function CatalogPanel({
  catalog,
  calculatedMeasures = [],
  findItemZone,
  onAddDimension,
  onAddMeasure,
  onRemoveItem,
}: CatalogPanelProps) {
  const [search, setSearch] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    Dimensions: true,
    Measures: true,
  });
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  const toggleSection = (section: string) =>
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));

  const toggleCategory = (cat: string) =>
    setExpandedCategories((prev) => ({ ...prev, [cat]: prev[cat] === false ? true : (prev[cat] === undefined ? false : !prev[cat]) }));

  const searchLower = search.toLowerCase();

  const filteredDimensions = catalog.dimensions.filter(
    (d) =>
      d.display_name.toLowerCase().includes(searchLower) ||
      d.category.toLowerCase().includes(searchLower),
  );

  const filteredMeasures = catalog.measures.filter(
    (m) =>
      m.display_name.toLowerCase().includes(searchLower) ||
      m.category.toLowerCase().includes(searchLower),
  );

  const dimsByCategory = catalog.dimension_categories
    .map((cat) => ({
      category: cat,
      items: filteredDimensions.filter((d) => d.category === cat),
    }))
    .filter((g) => g.items.length > 0);

  const filteredCalcMeasures = calculatedMeasures.filter(
    (m) =>
      m.display_name.toLowerCase().includes(searchLower) ||
      'calculated'.includes(searchLower),
  );

  const measuresByCategory = [
    ...catalog.measure_categories.map((cat) => ({
      category: cat,
      items: filteredMeasures.filter((m) => m.category === cat),
    })),
    ...(filteredCalcMeasures.length > 0
      ? [{ category: 'Calculated', items: filteredCalcMeasures }]
      : []),
  ].filter((g) => g.items.length > 0);

  return (
    <div className="w-[250px] flex-shrink-0 border-r border-border bg-muted/30 flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search catalog..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm bg-background"
          />
        </div>
      </div>

      {/* Scrollable catalog */}
      <div className="flex-1 overflow-y-auto">
        {/* Dimensions */}
        <SectionHeader
          label="Dimensions"
          count={filteredDimensions.length}
          expanded={expandedSections.Dimensions !== false}
          onToggle={() => toggleSection('Dimensions')}
          icon={<Box className="h-3.5 w-3.5" />}
        />
        {expandedSections.Dimensions !== false &&
          dimsByCategory.map((group) => (
            <CategoryGroup
              key={group.category}
              category={group.category}
              expanded={expandedCategories[group.category] !== false}
              onToggle={() => toggleCategory(group.category)}
            >
              {group.items.map((dim) => (
                <DimensionRow
                  key={dim.id}
                  dim={dim}
                  zone={findItemZone(dim.id)}
                  onAdd={onAddDimension}
                  onRemove={onRemoveItem}
                />
              ))}
            </CategoryGroup>
          ))}

        {/* Measures */}
        <SectionHeader
          label="Measures"
          count={filteredMeasures.length}
          expanded={expandedSections.Measures !== false}
          onToggle={() => toggleSection('Measures')}
          icon={<Sigma className="h-3.5 w-3.5" />}
        />
        {expandedSections.Measures !== false &&
          measuresByCategory.map((group) => (
            <CategoryGroup
              key={group.category}
              category={group.category}
              expanded={expandedCategories[`m_${group.category}`] !== false}
              onToggle={() => toggleCategory(`m_${group.category}`)}
            >
              {group.items.map((measure) => (
                <MeasureRow
                  key={measure.id}
                  measure={measure}
                  zone={findItemZone(measure.id)}
                  onAdd={onAddMeasure}
                  onRemove={onRemoveItem}
                />
              ))}
            </CategoryGroup>
          ))}
      </div>
    </div>
  );
}

/* --- Sub-components --- */

function SectionHeader({
  label,
  count,
  expanded,
  onToggle,
  icon,
}: {
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent/50 transition-colors"
    >
      {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      {icon}
      {label}
      <span className="ml-auto text-[10px] font-normal">{count}</span>
    </button>
  );
}

function CategoryGroup({
  category,
  expanded,
  onToggle,
  children,
}: {
  category: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 px-5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent/30 transition-colors"
      >
        {expanded ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
        {category}
      </button>
      {expanded && <div>{children}</div>}
    </div>
  );
}

function DimensionRow({
  dim,
  zone,
  onAdd,
  onRemove,
}: {
  dim: DimensionItem;
  zone: ZoneName | null;
  onAdd: (dim: DimensionItem, zone: 'rows' | 'columns' | 'filters') => void;
  onRemove: (id: string) => void;
}) {
  if (zone) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="w-full flex items-center gap-2 px-7 py-1.5 text-xs hover:bg-accent/30 transition-colors text-left">
            <Box className="h-3 w-3 text-primary flex-shrink-0" />
            <span className="flex-1 truncate text-foreground">{dim.display_name}</span>
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
              {ZONE_LABELS[zone]}
            </Badge>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          {zone !== 'rows' && (
            <DropdownMenuItem onClick={() => onAdd(dim, 'rows')}>Move to Rows</DropdownMenuItem>
          )}
          {zone !== 'columns' && (
            <DropdownMenuItem onClick={() => onAdd(dim, 'columns')}>Move to Columns</DropdownMenuItem>
          )}
          {zone !== 'filters' && (
            <DropdownMenuItem onClick={() => onAdd(dim, 'filters')}>Move to Filters</DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => onRemove(dim.id)} className="text-destructive">
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="w-full flex items-center gap-2 px-7 py-1.5 text-xs hover:bg-accent/30 transition-colors text-left">
          <Box className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          <span className="flex-1 truncate text-foreground">{dim.display_name}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuItem onClick={() => onAdd(dim, 'rows')}>Add to Rows</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAdd(dim, 'columns')}>Add to Columns</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAdd(dim, 'filters')}>Add to Filters</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MeasureRow({
  measure,
  zone,
  onAdd,
  onRemove,
}: {
  measure: MeasureItem;
  zone: ZoneName | null;
  onAdd: (measure: MeasureItem) => void;
  onRemove: (id: string) => void;
}) {
  const isInValues = zone === 'values';

  const isCalc = isCalculatedMeasure(measure);

  return (
    <button
      onClick={() => (isInValues ? onRemove(measure.id) : onAdd(measure))}
      className="w-full flex items-center gap-2 px-7 py-1.5 text-xs hover:bg-accent/30 transition-colors text-left"
    >
      {isCalc ? (
        <span className="text-[9px] font-mono font-semibold text-primary flex-shrink-0">fx</span>
      ) : (
        <Sigma className={`h-3 w-3 flex-shrink-0 ${isInValues ? 'text-primary' : 'text-muted-foreground'}`} />
      )}
      <span className="flex-1 truncate text-foreground">{measure.display_name}</span>
      {isInValues && (
        <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
          Values
        </Badge>
      )}
    </button>
  );
}
