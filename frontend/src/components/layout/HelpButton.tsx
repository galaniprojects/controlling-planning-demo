import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSidePanel } from '@/contexts/SidePanelContext';
import { useRole } from '@/contexts/RoleContext';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { docsApi } from '@/api/endpoints';
import { MODULE_ROUTES } from '@/lib/routes';
import { Skeleton } from '@/components/shared/Skeleton';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import type { FAQSummary, FAQDetail } from '@/types/api';
import { renderMarkdownBold } from '@/lib/renderMarkdownBold';

function FAQPanelContent() {
  const { context } = useRole();
  const navigate = useNavigate();
  const { closePanel } = useSidePanel();
  const [faqs, setFaqs] = useState<FAQSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFaq, setSelectedFaq] = useState<FAQDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    docsApi.getFAQs().then((res) => {
      setFaqs(res.items);
      setLoading(false);
    });
  }, []);

  const filtered = context
    ? faqs.filter((f) => f.applicable_roles.includes(context.role))
    : faqs;

  const handleSelect = async (faqId: string) => {
    setDetailLoading(true);
    try {
      const detail = await docsApi.getFAQDetail(faqId);
      setSelectedFaq(detail);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleNavigate = (moduleKey: string) => {
    const route = MODULE_ROUTES[moduleKey];
    if (route) {
      closePanel();
      navigate(route);
    }
  };

  if (loading) return <Skeleton className="h-40" />;

  // Detail view
  if (selectedFaq) {
    if (detailLoading) return <Skeleton className="h-40" />;
    return (
      <div className="space-y-4">
        <button
          onClick={() => setSelectedFaq(null)}
          className="flex items-center gap-1 text-sm text-primary hover:text-primary/80"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to FAQs
        </button>
        <h3 className="text-sm font-semibold text-foreground">
          {selectedFaq.question}
        </h3>
        <p className="text-xs text-muted-foreground">{selectedFaq.summary}</p>
        <ol className="space-y-3">
          {selectedFaq.steps.map((step) => (
            <li key={step.step_number} className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                {step.step_number}
              </span>
              <div className="space-y-1">
                <p className="text-sm text-foreground">{renderMarkdownBold(step.instruction)}</p>
                {step.target_module && (
                  <button
                    onClick={() => handleNavigate(step.target_module!)}
                    className="flex items-center gap-1 text-xs text-primary/80 hover:text-primary"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open {step.target_module.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-3">
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No FAQs available for your role.</p>
      ) : (
        filtered.map((faq) => (
          <button
            key={faq.id}
            onClick={() => handleSelect(faq.id)}
            className="w-full rounded-lg border border-border p-3 text-left hover:bg-accent transition-colors"
          >
            <p className="text-sm font-medium text-foreground">{faq.question}</p>
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{faq.summary}</p>
          </button>
        ))
      )}
    </div>
  );
}

export function HelpButton() {
  const { openPanel } = useSidePanel();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() =>
            openPanel('Help & FAQ', <FAQPanelContent />)
          }
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          ?
        </button>
      </TooltipTrigger>
      <TooltipContent>Help & FAQ</TooltipContent>
    </Tooltip>
  );
}
