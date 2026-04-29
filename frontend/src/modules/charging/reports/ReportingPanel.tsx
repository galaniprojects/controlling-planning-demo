/**
 * Reporting integration — F5 stub. Surface that links to the existing
 * Report Builder with Cluster F's data layer pre-selected per [F-RV-01].
 */
import { Card } from '@/components/ui/card';
import { FileBarChart2 } from 'lucide-react';

export function ReportingPanel() {
  return (
    <Card className="p-8">
      <div className="flex flex-col items-center text-center max-w-lg mx-auto">
        <FileBarChart2 className="h-10 w-10 text-muted-foreground mb-3" />
        <h2 className="text-base font-semibold text-foreground mb-1">
          Charging Reports
        </h2>
        <p className="text-sm text-muted-foreground">
          The Report Builder bridge for Cluster F's data layer lands in v5 Session F5.
        </p>
      </div>
    </Card>
  );
}
