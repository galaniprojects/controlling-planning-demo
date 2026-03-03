import { Badge } from '@/components/ui/badge';

interface Props {
  type: string;
}

export function CapexOpexDisplay({ type }: Props) {
  const label =
    type === 'capex' ? 'CapEx' : type === 'opex' ? 'OpEx' : 'Mixed';

  return (
    <div className="border border-slate-200 rounded-lg p-4">
      <h3 className="text-sm font-medium text-slate-500 mb-2">
        Cost Classification
      </h3>
      <Badge
        variant="outline"
        className="text-sm px-3 py-1 capitalize"
      >
        {label}
      </Badge>
    </div>
  );
}
