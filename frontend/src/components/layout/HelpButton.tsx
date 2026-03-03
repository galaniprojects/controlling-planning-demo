import { useSidePanel } from '@/contexts/SidePanelContext';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function HelpButton() {
  const { openPanel } = useSidePanel();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() =>
            openPanel(
              'Help & FAQ',
              <div className="p-4">
                <p className="text-sm text-slate-500">
                  FAQ walkthroughs will be loaded here in Phase E.
                </p>
              </div>,
            )
          }
          className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-700"
        >
          ?
        </button>
      </TooltipTrigger>
      <TooltipContent>Help & FAQ</TooltipContent>
    </Tooltip>
  );
}
