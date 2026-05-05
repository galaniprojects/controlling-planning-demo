import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/shared/Skeleton';
import { renderMarkdownBold } from '@/lib/renderMarkdownBold';
import { docsApi, type ChangelogEntry } from '@/api/endpoints';

export function ChangelogTab() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    docsApi
      .getChangelog()
      .then((res) => setEntries(res.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Skeleton className="h-96 mt-4" />;

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground mt-4">
        No changelog entries available.
      </p>
    );
  }

  return (
    <div className="space-y-8 mt-4">
      {entries.map((entry) => (
        <section key={entry.version} className="space-y-4">
          {/* Version header */}
          <div className="flex flex-wrap items-baseline gap-3 border-b border-border pb-3">
            <h2 className="text-xl font-semibold text-foreground">{entry.version}</h2>
            <Badge variant="outline" className="text-xs font-mono">
              {entry.date}
            </Badge>
            <span className="text-sm text-muted-foreground">{entry.title}</span>
          </div>

          {/* Summary blurb */}
          {entry.summary && (
            <p className="text-sm text-foreground leading-relaxed">
              {renderMarkdownBold(entry.summary)}
            </p>
          )}

          {/* Section cards — same pattern as ModulesTab */}
          <div className="space-y-3">
            {entry.sections.map((section, i) => (
              <Card key={`${entry.version}-${i}`}>
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
        </section>
      ))}
    </div>
  );
}
