import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { BookOpen } from 'lucide-react';
import { useSidePanel } from '@/contexts/SidePanelContext';
import { docsApi } from '@/api/endpoints';
import { renderMarkdownBold } from '@/lib/renderMarkdownBold';

interface Props {
  moduleId: string;
}

export function ModuleGuideButton({ moduleId }: Props) {
  const { openPanel } = useSidePanel();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const manual = await docsApi.getModuleManual(moduleId);
      openPanel(
        manual.module_name + ' Guide',
        <div className="space-y-6">
          {manual.sections.map((section, i) => (
            <div key={i} className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-line">{renderMarkdownBold(section.body)}</p>
            </div>
          ))}
        </div>,
      );
    } catch {
      // Silently fail if manual not found
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={loading}>
      <BookOpen className="h-4 w-4 mr-1.5" />
      Guide
    </Button>
  );
}
