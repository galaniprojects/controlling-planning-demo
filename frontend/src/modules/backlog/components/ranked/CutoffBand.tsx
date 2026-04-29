/**
 * CutoffBand — full-width band separating above-cutoff and below-cutoff
 * sections. [A-BK-17]
 */

import { cn } from '@/lib/utils';

interface Props {
  label: string;
  explanation: string;
  variant: 'should-be' | 'reality';
  id?: string;
}

export function CutoffBand({ label, explanation, variant, id }: Props) {
  return (
    <tr id={id} aria-label={label}>
      <td
        colSpan={99}
        className={cn(
          'px-4 py-2 text-xs font-medium',
          variant === 'should-be'
            ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
            : 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
        )}
      >
        <span className="font-semibold">{label}</span>
        {explanation ? (
          <span className="ml-2 font-normal opacity-80">{explanation}</span>
        ) : null}
      </td>
    </tr>
  );
}
