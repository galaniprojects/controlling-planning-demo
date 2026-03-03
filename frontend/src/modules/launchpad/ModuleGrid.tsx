import { useNavigate } from 'react-router-dom';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { MODULE_ROUTES } from '@/lib/routes';
import type { ModuleTile } from '@/types/api';

interface Props {
  modules: ModuleTile[];
}

export function ModuleGrid({ modules }: Props) {
  const navigate = useNavigate();

  const visibleModules = modules
    .filter((m) => m.visible)
    .sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {visibleModules.map((mod) => (
        <Card
          key={mod.id}
          className="cursor-pointer transition-shadow hover:shadow-md"
          onClick={() => navigate(MODULE_ROUTES[mod.id] || '/')}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{mod.name}</CardTitle>
            <CardDescription className="text-xs">{mod.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium text-blue-800">{mod.contextual_metric}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
