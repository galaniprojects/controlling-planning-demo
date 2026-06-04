/**
 * Abbreviated European currency format for KPIs, charts, tree tables.
 * Examples: €1,2M  €450K  €800  -€200K
 */
export function formatCurrency(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (abs >= 1_000_000) {
    const m = (abs / 1_000_000).toFixed(1).replace('.', ',');
    return `${sign}€${m}M`;
  }
  if (abs >= 1_000) {
    const k = Math.round(abs / 1_000)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${sign}€${k}K`;
  }
  return `${sign}€${Math.round(abs)}`;
}

/**
 * Abbreviated European currency with explicit +/- sign for deltas.
 * Examples: +€200K  -€1,2M
 */
export function formatCurrencyDelta(value: number): string {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${formatCurrency(value)}`;
}

/**
 * Detailed European currency for table cells (no decimals).
 * Examples: 8.340 €  1.200.000 €  850 €
 */
export function formatCurrencyDetailed(value: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Compact European currency for grid cells — k with up to 2 decimals.
 * Examples: 6,35k€  14,4k€  850€  1,2M€
 */
export function formatCurrencyCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) {
    const m = (abs / 1_000_000).toFixed(2).replace('.', ',').replace(/,?0+$/, '');
    return `${sign}${m}M€`;
  }
  if (abs >= 1_000) {
    const k = (abs / 1_000).toFixed(2).replace('.', ',').replace(/,?0+$/, '');
    return `${sign}${k}k€`;
  }
  if (abs === 0) return '—';
  return `${sign}${Math.round(abs)}€`;
}

/**
 * European number format for non-currency values (hours, quantities).
 * Examples: 14.400  1.200  850
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('de-DE', {
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * European percentage format.
 *
 * Default behaviour (signed: true, decimals: 1) renders deltas: "+3,5%", "-1,2%".
 * Pass `{ signed: false }` for share / portion percentages: "82,5%".
 * Pass `decimals` to override the precision (default 1).
 */
export function formatPercent(
  value: number,
  options?: { signed?: boolean; decimals?: number },
): string {
  const decimals = options?.decimals ?? 1;
  const signed = options?.signed ?? true;
  const sign = signed && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals).replace('.', ',')}%`;
}

/**
 * Unitless decimal number with European separator. For scores, ratios, FTE.
 * Examples: formatDecimal(3.45, 2) => "3,45"; formatDecimal(1.2, 1) => "1,2".
 */
export function formatDecimal(value: number, decimals: number = 2): string {
  return value.toFixed(decimals).replace('.', ',');
}

/**
 * Parse a backend timestamp string to epoch millis, treating it as UTC.
 *
 * The backend emits naive UTC timestamps via `str(datetime.utcnow())` /
 * `.isoformat()`, e.g. `"2026-06-04 10:30:00.123456"` or
 * `"2026-06-04T10:30:00.123456"` — no timezone designator. `Date.parse` would
 * treat a tz-less string as LOCAL time, skewing any "N ago" / localized
 * display by the viewer's UTC offset (and some engines reject the
 * space separator outright). Normalise to ISO-UTC: swap a space for `T` and
 * append `Z` when no timezone designator is present. Returns `NaN` on
 * unparseable input (callers should guard).
 */
export function parseServerTimestamp(raw: string): number {
  const s = raw.trim().replace(' ', 'T');
  const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s);
  return Date.parse(hasTz ? s : `${s}Z`);
}
