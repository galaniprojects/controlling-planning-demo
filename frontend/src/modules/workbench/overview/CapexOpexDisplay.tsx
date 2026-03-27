import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/formatters';

interface Props {
  type: string;
  capexAmount?: number;
  opexAmount?: number;
  capexPct?: number;
  opexPct?: number;
}

export function CapexOpexDisplay({ type, capexAmount, opexAmount, capexPct, opexPct }: Props) {
  const label =
    type === 'capex' ? 'CapEx' : type === 'opex' ? 'OpEx' : 'Mixed';

  const isMixed = type === 'mixed' && capexAmount != null && opexAmount != null;

  return (
    <div className="border border-border rounded-lg p-4">
      <h3 className="text-sm font-medium text-muted-foreground mb-2">
        Cost Classification
      </h3>
      <Badge
        variant="outline"
        className="text-sm px-3 py-1 capitalize"
      >
        {label}
      </Badge>
      {isMixed ? (
        <div className="mt-3 space-y-2">
          {/* Split bar */}
          <div className="flex h-2 rounded-full overflow-hidden">
            <div
              className="bg-blue-500"
              style={{ width: `${capexPct}%` }}
            />
            <div
              className="bg-amber-500"
              style={{ width: `${opexPct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1" />
              CapEx {capexPct?.toFixed(0)}% ({formatCurrency(capexAmount!)})
            </span>
            <span>
              <span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1" />
              OpEx {opexPct?.toFixed(0)}% ({formatCurrency(opexAmount!)})
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-3 text-xs text-muted-foreground">
          <span className={`inline-block w-2 h-2 rounded-full mr-1 ${type === 'capex' ? 'bg-blue-500' : 'bg-amber-500'}`} />
          {label} 100%
          {type === 'capex' && capexAmount != null && ` (${formatCurrency(capexAmount)})`}
          {type === 'opex' && opexAmount != null && ` (${formatCurrency(opexAmount)})`}
        </div>
      )}
    </div>
  );
}
