/**
 * CubeLegend — static legend for the cube scatter plot. [A-BK-19]
 */

const TYPE_COLORS: Record<number, string> = {
  1: 'var(--chart-1)',
  2: 'var(--chart-2)',
  3: 'var(--chart-3)',
};

const SIZES = [
  { label: 'XS', r: 4 },
  { label: 'S', r: 6 },
  { label: 'M', r: 9 },
  { label: 'L', r: 12 },
  { label: 'XL', r: 16 },
];

export function CubeLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      <div className="flex items-center gap-2 font-medium text-foreground">
        Type:
      </div>
      {([1, 2, 3] as const).map((t) => (
        <div key={t} className="flex items-center gap-1.5">
          <span
            className="inline-block size-2.5 rounded-full"
            style={{ background: TYPE_COLORS[t] }}
          />
          Type {t}
        </div>
      ))}
      <div className="ml-4 flex items-center gap-2 font-medium text-foreground">
        Size:
      </div>
      {SIZES.map((s) => (
        <div key={s.label} className="flex items-center gap-1.5">
          <svg
            width={s.r * 2}
            height={s.r * 2}
            aria-hidden
          >
            <circle
              cx={s.r}
              cy={s.r}
              r={s.r - 1}
              fill="none"
              stroke="var(--muted-foreground)"
              strokeWidth="1.5"
            />
          </svg>
          {s.label}
        </div>
      ))}
    </div>
  );
}
