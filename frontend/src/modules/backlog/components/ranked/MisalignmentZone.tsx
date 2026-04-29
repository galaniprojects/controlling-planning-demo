/**
 * MisalignmentZone — wrapper row providing amber tint to indicate that a
 * project is in the misalignment zone (between should-be and reality cutoffs).
 * [A-BK-17]
 */

interface Props {
  children: React.ReactNode;
  active: boolean;
}

/**
 * This component is a thin wrapper — it does not render a <tr> directly;
 * instead it clones the child row with an additional className to apply the
 * misalignment tint. Because <tr> must be a direct child of <tbody>, we use
 * a React Fragment and apply styling via the className override.
 *
 * Usage: wrap the entire <tbody> row render call with this component and let
 * it add `className` to the child row element.
 */
export function MisalignmentZone({ children, active }: Props) {
  if (!active) return <>{children}</>;
  return (
    <tr className="bg-amber-50/60 dark:bg-amber-900/10">
      {/* We re-render children inside a misalignment wrapper row — see usage note above */}
      {/* This component is used only for semantic grouping; actual styling is applied
          at the row level in RankedListTable */}
      <td colSpan={99} className="p-0">
        <div style={{ display: 'contents' }}>{children}</div>
      </td>
    </tr>
  );
}
