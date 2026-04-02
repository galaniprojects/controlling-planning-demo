import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { capacityApi } from '@/api/endpoints';
import { Users, XCircle, ChevronDown, ChevronUp, FileText } from 'lucide-react';

interface PendingItem {
  id: string;
  type: 'project' | 'change_request';
  name: string;
  lob_name: string;
  pl_name: string | null;
  start_month: string;
  end_month: string | null;
  resource_request_count: number;
  submitted_at: string | null;
  cr_id?: number;
  cr_summary?: string;
}

interface Props {
  onConfirmComplete: () => void;
  highlightCrId?: number;
}

export function ProjectConfirmationBanner({ onConfirmComplete, highlightCrId }: Props) {
  const navigate = useNavigate();
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});

  const fetchItems = () => {
    setLoading(true);
    capacityApi
      .getPendingProjectConfirmations()
      .then((res) => setItems(res.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchItems();
  }, []);

  // Build a unique key for each item (projects and CRs can share a project id)
  const itemKey = (p: PendingItem) =>
    p.type === 'change_request' ? `cr-${p.cr_id}` : `proj-${p.id}`;

  const handleReviewAssign = (item: PendingItem) => {
    if (item.type === 'change_request' && item.cr_id != null) {
      navigate(`/capacity/project-assignment/${item.id}?cr=${item.cr_id}`);
    } else {
      navigate(`/capacity/project-assignment/${item.id}`);
    }
  };

  const handleDecline = async (item: PendingItem) => {
    if (!declineReason.trim()) return;
    const key = itemKey(item);
    setSubmitting(key);
    try {
      // Decline only works for projects (not CRs — CRs are handled at request level)
      const res = await capacityApi.declineProject(item.id, declineReason.trim());
      setResults((prev) => ({ ...prev, [key]: `"${res.name}" declined -- sent back to PL.` }));
      setDecliningId(null);
      setDeclineReason('');
      onConfirmComplete();
      setTimeout(() => {
        setItems((prev) => prev.filter((p) => itemKey(p) !== key));
        setResults((prev) => { const n = { ...prev }; delete n[key]; return n; });
      }, 2000);
    } catch {
      setResults((prev) => ({ ...prev, [key]: 'Decline failed. Please try again.' }));
    } finally {
      setSubmitting(null);
    }
  };

  if (loading || items.length === 0) return null;

  const bannerLabel = items.length === 1
    ? 'Item awaiting resource confirmation'
    : 'Items awaiting resource confirmation';

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20">
      {/* Header */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-2">
          <Badge className="bg-primary text-primary-foreground hover:bg-primary">
            {items.length}
          </Badge>
          <span className="text-sm font-medium text-blue-800 dark:text-blue-300">
            {bannerLabel}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-blue-500 dark:text-blue-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-blue-500 dark:text-blue-400" />
        )}
      </button>

      {/* Item cards */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {items.map((p) => {
            const key = itemKey(p);
            const isHighlighted = p.type === 'change_request' && p.cr_id === highlightCrId;

            return (
              <Card
                key={key}
                className={
                  isHighlighted
                    ? 'border-primary ring-1 ring-primary dark:border-primary'
                    : 'border-blue-100 dark:border-blue-800'
                }
              >
                <CardContent className="pt-4 pb-3 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{p.name}</p>
                        {p.type === 'change_request' && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            <FileText className="h-3 w-3 mr-0.5" />
                            Change Request
                          </Badge>
                        )}
                      </div>
                      {p.type === 'change_request' && p.cr_summary && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {p.cr_summary}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>{p.lob_name}</span>
                        {p.pl_name && <span>PL: {p.pl_name}</span>}
                        <span>
                          {p.start_month} -- {p.end_month || 'Ongoing'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {p.resource_request_count} resource request{p.resource_request_count !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>

                  {/* Result message */}
                  {results[key] && (
                    <div className="rounded border border-blue-200 bg-card p-2 text-xs text-primary dark:border-blue-700">
                      {results[key]}
                    </div>
                  )}

                  {/* Decline reason textarea (projects only) */}
                  {decliningId === key && !results[key] && (
                    <div className="space-y-2">
                      <Textarea
                        value={declineReason}
                        onChange={(e) => setDeclineReason(e.target.value)}
                        placeholder="Reason for declining resources..."
                        rows={2}
                        className="text-sm"
                      />
                    </div>
                  )}

                  {/* Actions */}
                  {!results[key] && (
                    <div className="flex gap-2">
                      {decliningId === key ? (
                        <>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDecline(p)}
                            disabled={!declineReason.trim() || submitting === key}
                            className="text-xs"
                          >
                            {submitting === key ? 'Declining...' : 'Confirm Decline'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { setDecliningId(null); setDeclineReason(''); }}
                            className="text-xs"
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleReviewAssign(p)}
                            className="text-xs"
                          >
                            <Users className="h-3.5 w-3.5 mr-1" />
                            Review & Assign Resources
                          </Button>
                          {p.type === 'project' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setDecliningId(key)}
                              className="text-xs text-red-600 hover:text-red-700"
                            >
                              <XCircle className="h-3.5 w-3.5 mr-1" />
                              Decline
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
