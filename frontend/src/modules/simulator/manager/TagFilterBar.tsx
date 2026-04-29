/**
 * v5 B2 — Tag filter bar for the Scenario Manager.
 *
 * Renders a row of tag chips; the active tag is highlighted. Clicking
 * an active chip clears the filter. Tags come from the
 * `available_tags` field of the scenarios list response.
 */

import { Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  availableTags: string[];
  activeTag: string | null;
  onChange: (tag: string | null) => void;
}

export function TagFilterBar({ availableTags, activeTag, onChange }: Props) {
  if (availableTags.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Tag className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      <span className="text-xs text-muted-foreground mr-1">Filter by tag:</span>
      {availableTags.map((tag) => {
        const active = tag === activeTag;
        return (
          <Button
            key={tag}
            variant={active ? 'default' : 'outline'}
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => onChange(active ? null : tag)}
            aria-pressed={active}
          >
            {tag}
          </Button>
        );
      })}
      {activeTag && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => onChange(null)}
        >
          Clear
        </Button>
      )}
    </div>
  );
}
