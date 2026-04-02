import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ProjectConfirmationBanner } from './ProjectConfirmationBanner';

interface RequestManagementProps {
  ccId: string;
}

export function RequestManagement({ ccId }: RequestManagementProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const highlightCrId = searchParams.get('cr') ? Number(searchParams.get('cr')) : undefined;

  if (!ccId) {
    return (
      <p className="text-sm text-muted-foreground">
        No cost center available for request management.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => navigate('/capacity')}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Capacity Management
      </button>

      <ProjectConfirmationBanner
        onConfirmComplete={() => {}}
        highlightCrId={highlightCrId}
      />
    </div>
  );
}
