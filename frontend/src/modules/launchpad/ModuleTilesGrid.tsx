import { useNavigate } from 'react-router-dom';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MODULE_ROUTES } from '@/lib/routes';
import type { ModuleTile } from '@/types/api';

interface Props {
  modules: ModuleTile[];
}

export function ModuleTilesGrid({ modules }: Props) {
  const navigate = useNavigate();

  const visibleModules = modules
    .filter((m) => m.visible)
    .sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="grid grid-cols-2 gap-4">
      {visibleModules.map((mod) => {
        const isPrimary = mod.sort_order === 1;
        return (
          <Card
            key={mod.id}
            className={`cursor-pointer transition-shadow hover:shadow-md ${
              isPrimary ? 'border-2 border-primary' : ''
            }`}
            onClick={() => navigate(MODULE_ROUTES[mod.id] || '/')}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">{mod.name}</CardTitle>
                {isPrimary && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    Default
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs">{mod.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium text-primary">
                {mod.contextual_metric}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
