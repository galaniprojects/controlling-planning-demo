/**
 * v5 B2 — Compare-view placeholder.
 *
 * T3 owns the full compare/ tree (selection, 3-level pages, color
 * coding). T1 ships this placeholder so the route resolves while
 * T3 is in flight.
 */

import { ArrowLeft, GitCompare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function ComparePlaceholder() {
  return (
    <div className="px-6 py-6">
      <Button variant="ghost" size="sm" asChild className="mb-4">
        <Link to="/simulator">
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Simulator
        </Link>
      </Button>
      <Card className="max-w-md mx-auto p-8 text-center">
        <GitCompare
          className="h-10 w-10 text-muted-foreground mx-auto mb-3"
          aria-hidden="true"
        />
        <h2 className="text-lg font-semibold text-foreground mb-1">
          Compare view
        </h2>
        <p className="text-sm text-muted-foreground">
          The Compare view (3 drill levels: portfolio → project → line) is
          owned by T3 and will land here. Routes are reserved.
        </p>
      </Card>
    </div>
  );
}
