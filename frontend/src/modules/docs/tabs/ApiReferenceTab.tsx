import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/shared/Skeleton';

interface OpenAPISpec {
  paths: Record<string, Record<string, EndpointDef>>;
  info?: { title?: string; version?: string };
}

interface EndpointDef {
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: ParamDef[];
  requestBody?: { content?: Record<string, { schema?: SchemaRef }> };
  responses?: Record<string, { description?: string }>;
}

interface ParamDef {
  name: string;
  in: string;
  required?: boolean;
  schema?: { type?: string };
  description?: string;
}

interface SchemaRef {
  $ref?: string;
  type?: string;
}

interface GroupedEndpoint {
  method: string;
  path: string;
  summary: string;
  description: string;
  parameters: ParamDef[];
  hasBody: boolean;
  responses: string[];
}

const METHOD_COLORS: Record<string, string> = {
  get: 'bg-green-100 text-green-800',
  post: 'bg-blue-100 text-blue-800',
  put: 'bg-amber-100 text-amber-800',
  delete: 'bg-red-100 text-red-800',
};

const TAG_ORDER = [
  'Global & Launchpad',
  'Portfolio Overview',
  'Project Workbench',
  'Capacity Management',
  'Scenarios',
  'Reports',
  'Administration',
  'Reference Data',
  'Documentation',
];

export function ApiReferenceTab() {
  const [groups, setGroups] = useState<Record<string, GroupedEndpoint[]>>({});
  const [loading, setLoading] = useState(true);
  const [expandedTag, setExpandedTag] = useState<string | null>(null);
  const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/docs/openapi')
      .then((r) => r.json())
      .then((spec: OpenAPISpec) => {
        const grouped: Record<string, GroupedEndpoint[]> = {};

        for (const [path, methods] of Object.entries(spec.paths)) {
          for (const [method, def] of Object.entries(methods)) {
            if (['get', 'post', 'put', 'delete'].indexOf(method) === -1) continue;
            const tag = def.tags?.[0] || 'Other';
            if (!grouped[tag]) grouped[tag] = [];

            grouped[tag].push({
              method: method.toUpperCase(),
              path,
              summary: def.summary || '',
              description: def.description || '',
              parameters: (def.parameters || []).filter((p) => p.in !== 'header'),
              hasBody: !!def.requestBody,
              responses: Object.entries(def.responses || {}).map(
                ([code, r]) => `${code}: ${r.description || ''}`
              ),
            });
          }
        }

        setGroups(grouped);
        // Auto-expand first tag
        const sortedTags = sortTags(Object.keys(grouped));
        if (sortedTags.length > 0) setExpandedTag(sortedTags[0]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Skeleton className="h-96 mt-4" />;

  const sortedTags = sortTags(Object.keys(groups));

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <span>{sortedTags.length} endpoint groups</span>
        <span className="text-slate-300">|</span>
        <span>{Object.values(groups).flat().length} total endpoints</span>
        <span className="text-slate-300">|</span>
        <a
          href="http://localhost:8000/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          Open Swagger UI
        </a>
      </div>

      {sortedTags.map((tag) => {
        const endpoints = groups[tag];
        const isExpanded = expandedTag === tag;

        return (
          <Card key={tag}>
            <CardHeader
              className="py-3 cursor-pointer hover:bg-slate-50 transition-colors"
              onClick={() => setExpandedTag(isExpanded ? null : tag)}
            >
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{tag}</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {endpoints.length} endpoint{endpoints.length !== 1 ? 's' : ''}
                  </Badge>
                  <span className="text-slate-400 text-xs">{isExpanded ? '−' : '+'}</span>
                </div>
              </div>
            </CardHeader>

            {isExpanded && (
              <CardContent className="pt-0 space-y-1">
                {endpoints.map((ep) => {
                  const key = `${ep.method} ${ep.path}`;
                  const isEndpointExpanded = expandedEndpoint === key;

                  return (
                    <div key={key} className="border rounded-md">
                      <button
                        onClick={() => setExpandedEndpoint(isEndpointExpanded ? null : key)}
                        className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-slate-50 transition-colors"
                      >
                        <Badge className={`text-xs font-mono px-2 py-0.5 ${METHOD_COLORS[ep.method.toLowerCase()] || 'bg-slate-100 text-slate-700'}`}>
                          {ep.method}
                        </Badge>
                        <code className="text-xs text-slate-700 font-mono">{ep.path}</code>
                        {ep.summary && (
                          <span className="text-xs text-slate-400 ml-auto truncate max-w-[300px]">
                            {ep.summary}
                          </span>
                        )}
                      </button>

                      {isEndpointExpanded && (
                        <div className="px-3 pb-3 space-y-3 border-t bg-slate-50/50">
                          {ep.description && (
                            <p className="text-xs text-slate-600 pt-2">{ep.description}</p>
                          )}

                          {ep.parameters.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-slate-500 mb-1">Parameters</p>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b">
                                    <th className="text-left py-1 text-slate-400">Name</th>
                                    <th className="text-left py-1 text-slate-400">In</th>
                                    <th className="text-left py-1 text-slate-400">Type</th>
                                    <th className="text-left py-1 text-slate-400">Required</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {ep.parameters.map((p) => (
                                    <tr key={p.name} className="border-b last:border-0">
                                      <td className="py-1 font-mono">{p.name}</td>
                                      <td className="py-1 text-slate-500">{p.in}</td>
                                      <td className="py-1 text-slate-500">{p.schema?.type || '—'}</td>
                                      <td className="py-1">{p.required ? 'Yes' : 'No'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {ep.hasBody && (
                            <p className="text-xs text-slate-500">Request body: JSON</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function sortTags(tags: string[]): string[] {
  return tags.sort((a, b) => {
    const ai = TAG_ORDER.indexOf(a);
    const bi = TAG_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });
}
