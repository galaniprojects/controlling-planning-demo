import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/shared/Skeleton';
import { BudgetByLobChart } from '@/components/charts/BudgetByLobChart';
import { ForecastTrajectoryChart } from '@/components/charts/ForecastTrajectoryChart';
import { RAGDonutChart } from '@/components/charts/RAGDonutChart';
import type { ChartData } from '@/types/api';

interface Props {
  data: ChartData | null;
}

export function DashboardCharts({ data }: Props) {
  if (!data) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-4 w-28 mb-4" />
              <Skeleton className="h-[200px] w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-600">Budget by LoB</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <BudgetByLobChart data={data.budget_by_lob} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-600">Forecast Trajectory</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ForecastTrajectoryChart data={data.forecast_trajectory} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-600">RAG Distribution</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <RAGDonutChart data={data.rag_distribution} />
        </CardContent>
      </Card>
    </div>
  );
}
