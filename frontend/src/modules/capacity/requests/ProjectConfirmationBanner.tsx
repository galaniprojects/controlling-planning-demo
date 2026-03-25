import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { capacityApi } from '@/api/endpoints';
import { CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';

interface PendingProject {
  id: string;
  name: string;
  lob_name: string;
  pl_name: string | null;
  start_month: string;
  end_month: string | null;
  resource_request_count: number;
  submitted_at: string | null;
}

interface Props {
  onConfirmComplete: () => void;
}

export function ProjectConfirmationBanner({ onConfirmComplete }: Props) {
  const [projects, setProjects] = useState<PendingProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});

  const fetchProjects = () => {
    setLoading(true);
    capacityApi
      .getPendingProjectConfirmations()
      .then((res) => setProjects(res.items))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleConfirm = async (projectId: string) => {
    setSubmitting(projectId);
    try {
      const res = await capacityApi.confirmProject(projectId);
      setResults((prev) => ({ ...prev, [projectId]: `"${res.name}" confirmed — sent to intake queue.` }));
      onConfirmComplete();
      // Remove from list after short delay
      setTimeout(() => {
        setProjects((prev) => prev.filter((p) => p.id !== projectId));
        setResults((prev) => { const n = { ...prev }; delete n[projectId]; return n; });
      }, 2000);
    } catch {
      setResults((prev) => ({ ...prev, [projectId]: 'Confirmation failed. Please try again.' }));
    } finally {
      setSubmitting(null);
    }
  };

  const handleDecline = async (projectId: string) => {
    if (!declineReason.trim()) return;
    setSubmitting(projectId);
    try {
      const res = await capacityApi.declineProject(projectId, declineReason.trim());
      setResults((prev) => ({ ...prev, [projectId]: `"${res.name}" declined — sent back to PL.` }));
      setDecliningId(null);
      setDeclineReason('');
      onConfirmComplete();
      setTimeout(() => {
        setProjects((prev) => prev.filter((p) => p.id !== projectId));
        setResults((prev) => { const n = { ...prev }; delete n[projectId]; return n; });
      }, 2000);
    } catch {
      setResults((prev) => ({ ...prev, [projectId]: 'Decline failed. Please try again.' }));
    } finally {
      setSubmitting(null);
    }
  };

  if (loading || projects.length === 0) return null;

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50">
      {/* Header */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-2">
          <Badge className="bg-blue-600 text-white hover:bg-blue-600">
            {projects.length}
          </Badge>
          <span className="text-sm font-medium text-blue-800">
            {projects.length === 1
              ? 'Project awaiting resource confirmation'
              : 'Projects awaiting resource confirmation'}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-blue-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-blue-500" />
        )}
      </button>

      {/* Project cards */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {projects.map((p) => (
            <Card key={p.id} className="border-blue-100">
              <CardContent className="pt-4 pb-3 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{p.name}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                      <span>{p.lob_name}</span>
                      {p.pl_name && <span>PL: {p.pl_name}</span>}
                      <span>
                        {p.start_month} — {p.end_month || 'Ongoing'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {p.resource_request_count} resource request{p.resource_request_count !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                {/* Result message */}
                {results[p.id] && (
                  <div className="rounded border border-blue-200 bg-white p-2 text-xs text-blue-700">
                    {results[p.id]}
                  </div>
                )}

                {/* Decline reason textarea */}
                {decliningId === p.id && !results[p.id] && (
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
                {!results[p.id] && (
                  <div className="flex gap-2">
                    {decliningId === p.id ? (
                      <>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDecline(p.id)}
                          disabled={!declineReason.trim() || submitting === p.id}
                          className="text-xs"
                        >
                          {submitting === p.id ? 'Declining...' : 'Confirm Decline'}
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
                          onClick={() => handleConfirm(p.id)}
                          disabled={submitting === p.id}
                          className="text-xs"
                        >
                          <CheckCircle className="h-3.5 w-3.5 mr-1" />
                          {submitting === p.id ? 'Confirming...' : 'Confirm Resources'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDecliningId(p.id)}
                          className="text-xs text-red-600 hover:text-red-700"
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" />
                          Decline
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
