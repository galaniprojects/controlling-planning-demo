/**
 * v5 B2 — `SurfaceCard` shared shell for sandbox surfaces.
 *
 * The 17 sandbox surfaces share a top-level layout: a small header with
 * surface title + subtitle, an optional "Sandbox edit" badge, an error
 * card, and a body. Centralising the chrome here keeps each surface file
 * focused on its specific lever logic without duplicating ~40 lines of
 * boilerplate per file.
 */
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';

interface Props {
  title: string;
  subtitle?: string;
  /** Optional inline action — typically a primary "Apply to scenario" button. */
  toolbar?: ReactNode;
  /** Visible alert when the surface failed to dispatch. */
  error?: string | null;
  /** Mute the body when sandbox/recalc is in flight. */
  busy?: boolean;
  children: ReactNode;
}

export function SurfaceCard({
  title,
  subtitle,
  toolbar,
  error,
  busy,
  children,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <Badge
              variant="outline"
              className="text-[10px] border-blue-500 text-blue-700 dark:text-blue-400"
            >
              Sandbox edit
            </Badge>
          </div>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
        {toolbar}
      </div>

      {error && (
        <Card className="border-red-500 bg-red-50 dark:bg-red-900/20 p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-red-700 dark:text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
        </Card>
      )}

      <div className={busy ? 'opacity-60 pointer-events-none' : ''}>
        {children}
      </div>
    </div>
  );
}
