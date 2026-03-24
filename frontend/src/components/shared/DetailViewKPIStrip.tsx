import { Card, CardContent } from '@/components/ui/card';
import { formatCurrencyDetailed } from '@/lib/formatters';
import type { DetailViewKPI } from '@/lib/detailViewTypes';

interface Props {
  kpis: DetailViewKPI[];
}

export function DetailViewKPIStrip({ kpis }: Props) {
  return (
    <div className="grid grid-cols-3 gap-4">
      {kpis.map((kpi) => (
        <Card key={kpi.label}>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 mb-1">{kpi.label}</p>
            <p
              className="text-base font-semibold"
              style={{ color: kpi.color || '#334155' }}
            >
              {formatCurrencyDetailed(kpi.value)}
            </p>
            {kpi.secondaryLabel && (
              <p
                className="text-xs font-medium"
                style={{ color: kpi.color || '#334155' }}
              >
                {kpi.secondaryLabel}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
