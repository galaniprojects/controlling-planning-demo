/**
 * v5 B2 — Promote-flow placeholder.
 *
 * T4 owns the full promote/ tree (PromoteReviewPage, DiffSelector,
 * RoutingPreview, PromoteConfirmModal, audit drawer, badge). T1
 * ships this placeholder so the controller-only route resolves
 * while T4 is in flight.
 */

import { ArrowLeft, Sparkles } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useCanPromote } from '../permissions/useCanPromote';

export function PromotePlaceholder() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canPromote = useCanPromote();

  if (!canPromote) {
    navigate('/simulator', { replace: true });
    return null;
  }

  const back = `/simulator/scenarios/${params.id ?? ''}`;

  return (
    <div className="px-6 py-6">
      <Button variant="ghost" size="sm" asChild className="mb-4">
        <Link to={back}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to scenario
        </Link>
      </Button>
      <Card className="max-w-md mx-auto p-8 text-center">
        <Sparkles
          className="h-10 w-10 text-muted-foreground mx-auto mb-3"
          aria-hidden="true"
        />
        <h2 className="text-lg font-semibold text-foreground mb-1">
          Promote workflow
        </h2>
        <p className="text-sm text-muted-foreground">
          The Promote review (preview routing → select diffs → confirm →
          audit) is owned by T4 and will land here. Route is reserved.
        </p>
      </Card>
    </div>
  );
}
