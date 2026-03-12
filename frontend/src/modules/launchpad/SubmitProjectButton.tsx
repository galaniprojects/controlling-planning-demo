import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SubmitProjectDialog } from '@/components/shared/SubmitProjectDialog';

interface Props {
  onSuccess?: () => void;
}

export function SubmitProjectButton({ onSuccess }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        className="bg-blue-800 hover:bg-blue-900 text-white"
        onClick={() => setOpen(true)}
      >
        + Submit New Project
      </Button>
      <SubmitProjectDialog
        open={open}
        onOpenChange={setOpen}
        onSuccess={onSuccess}
      />
    </>
  );
}
