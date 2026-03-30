import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { SubmittedCR } from '@/types/api';
import { CheckCircle } from 'lucide-react';

interface Props {
  submittedCRs: SubmittedCR[];
  onDone: () => void;
}

export function Phase5Confirmation({ submittedCRs, onDone }: Props) {
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/30 p-4 flex items-start gap-3">
        <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
        <div>
          <h3 className="text-base font-semibold text-green-800 dark:text-green-400">
            Forecast Changes Submitted
          </h3>
          <p className="text-sm text-green-700 dark:text-green-400 mt-1">
            Your changes have been routed to the relevant CC Owners for
            confirmation. After CC confirmation, they will proceed to the
            Controller for final approval.
          </p>
        </div>
      </div>

      {submittedCRs.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">
            Created Change Requests
          </h4>
          <div className="space-y-1.5">
            {submittedCRs.map((cr) => (
              <div
                key={cr.id}
                className="flex items-center justify-between border border-border rounded-lg px-3 py-2"
              >
                <span className="text-sm text-foreground">CR-{cr.id}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {cr.category.replace('_', ' ')}
                  </Badge>
                  <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-[10px]">
                    Pending CC
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Button onClick={onDone}>Return to Forecast View</Button>
    </div>
  );
}
