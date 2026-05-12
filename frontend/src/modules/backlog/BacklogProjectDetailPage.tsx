/**
 * BacklogProjectDetailPage — legacy `/backlog/:projectId` route.
 *
 * As of the Define-page redesign this route is a thin redirect shell:
 * the Define page is the canonical project home at every DoI level
 * (0 through 5). Old deep-links to `/backlog/{id}` therefore land on
 * `/define/{id}` regardless of the project's stage.
 *
 * The previous tabbed implementation (Scores & Ranking, Financial
 * Overview, Master Data, Milestones) has been folded into the Define
 * page's four tabs:
 *   - Identity        → Master Data fields + project metadata
 *   - Tech Navigator  → Scores & Ranking
 *   - Financials      → Financial Overview + quick sizing + baseline grid
 *   - Approval & Milestones → Milestones + AI Council approval
 *
 * Keeping this file as a redirect (rather than deleting it) preserves
 * link compatibility — bookmarks, history entries, and intra-app
 * deep-links to `/backlog/{id}` keep working.
 */

import { Navigate, useLocation, useParams } from 'react-router-dom';

export function BacklogProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { search, hash } = useLocation();

  if (!projectId) {
    return <Navigate to="/backlog" replace />;
  }

  // Preserve any ?tab= / ?anchor= query the caller may have set —
  // the Define page consumes the same query-param vocabulary for tab
  // and field-anchor deep-linking.
  return <Navigate to={`/define/${projectId}${search}${hash}`} replace />;
}
