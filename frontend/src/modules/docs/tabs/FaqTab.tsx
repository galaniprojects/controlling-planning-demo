import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/shared/Skeleton';
import { renderMarkdownBold } from '@/lib/renderMarkdownBold';
import { docsApi } from '@/api/endpoints';
import type { FAQDetail } from '@/types/api';

export function FaqTab() {
  const [faqs, setFaqs] = useState<FAQDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterModule, setFilterModule] = useState<string>('');

  useEffect(() => {
    docsApi
      .getAllFAQs()
      .then((res) => setFaqs(res.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Collect unique modules for filter
  const modules = useMemo(() => {
    const set = new Set<string>();
    faqs.forEach((f) => f.modules_involved?.forEach((m) => set.add(m)));
    return Array.from(set).sort();
  }, [faqs]);

  // Filter
  const filtered = useMemo(() => {
    return faqs.filter((f) => {
      if (search) {
        const q = search.toLowerCase();
        if (!f.question.toLowerCase().includes(q) && !f.summary.toLowerCase().includes(q)) return false;
      }
      if (filterModule && !f.modules_involved?.includes(filterModule)) return false;
      return true;
    });
  }, [faqs, search, filterModule]);

  if (loading) return <Skeleton className="h-96 mt-4" />;

  return (
    <div className="space-y-4 mt-4">
      {/* Search & filter */}
      <div className="flex gap-3 items-center">
        <input
          type="text"
          placeholder="Search FAQs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-sm px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <select
          value={filterModule}
          onChange={(e) => setFilterModule(e.target.value)}
          className="px-3 py-2 border rounded-md text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">All modules</option>
          {modules.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">{filtered.length} of {faqs.length} FAQs</span>
      </div>

      {/* FAQ list */}
      <div className="space-y-2">
        {filtered.map((faq) => {
          const isExpanded = expandedId === faq.id;
          return (
            <Card key={faq.id}>
              <button
                onClick={() => setExpandedId(isExpanded ? null : faq.id)}
                className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-accent transition-colors"
              >
                <span className="text-muted-foreground mt-0.5 text-xs shrink-0">{isExpanded ? '−' : '+'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{faq.question}</p>
                  {!isExpanded && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{faq.summary}</p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  {faq.modules_involved?.map((m) => (
                    <Badge key={m} variant="outline" className="text-xs">{m}</Badge>
                  ))}
                </div>
              </button>

              {isExpanded && (
                <CardContent className="pt-0 pb-4 px-4 ml-6">
                  <p className="text-sm text-muted-foreground mb-3">{faq.summary}</p>

                  {faq.applicable_roles && faq.applicable_roles.length > 0 && (
                    <div className="flex gap-1 mb-3">
                      <span className="text-xs text-muted-foreground">Roles:</span>
                      {faq.applicable_roles.map((r) => (
                        <Badge key={r} variant="secondary" className="text-xs">{r}</Badge>
                      ))}
                    </div>
                  )}

                  {faq.steps && faq.steps.length > 0 && (
                    <ol className="space-y-2">
                      {faq.steps.map((step) => (
                        <li key={step.step_number} className="flex gap-2 text-sm">
                          <span className="text-xs font-mono text-muted-foreground mt-0.5 shrink-0 w-5 text-right">
                            {step.step_number}.
                          </span>
                          <span className="text-foreground">{renderMarkdownBold(step.instruction)}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}

        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No FAQs match your search.</p>
        )}
      </div>
    </div>
  );
}
