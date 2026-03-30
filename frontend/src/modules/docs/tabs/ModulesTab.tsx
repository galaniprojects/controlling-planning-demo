import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/shared/Skeleton';
import { renderMarkdownBold } from '@/lib/renderMarkdownBold';
import { docsApi, type ModuleManual } from '@/api/endpoints';

export function ModulesTab() {
  const [manuals, setManuals] = useState<ModuleManual[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  useEffect(() => {
    docsApi
      .getAllModuleManuals()
      .then((res) => {
        setManuals(res.items);
        if (res.items.length > 0) setExpandedModule(res.items[0].module_id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Skeleton className="h-96 mt-4" />;

  return (
    <div className="flex gap-6 mt-4">
      {/* Left nav */}
      <nav className="w-56 shrink-0 space-y-1">
        {manuals.map((m) => (
          <button
            key={m.module_id}
            onClick={() => setExpandedModule(m.module_id)}
            className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
              expandedModule === m.module_id
                ? 'bg-primary/5 text-primary font-medium'
                : 'text-muted-foreground hover:bg-accent'
            }`}
          >
            {m.module_name}
          </button>
        ))}
      </nav>

      {/* Content area */}
      <div className="flex-1 min-w-0">
        {manuals
          .filter((m) => m.module_id === expandedModule)
          .map((manual) => (
            <div key={manual.module_id} className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">{manual.module_name}</h2>
              {manual.sections.map((section, i) => (
                <Card key={i}>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm font-medium">{section.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground leading-relaxed">
                    {section.body.split('\n').map((line, j) => (
                      <p key={j} className={line.trim() === '' ? 'h-2' : 'mb-1'}>
                        {renderMarkdownBold(line)}
                      </p>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}
