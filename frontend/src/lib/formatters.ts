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
 * Detailed European currency for table cells.
 * Examples: €14.400,00  €1.200.000,00  €850,00
 */
export function formatCurrencyDetailed(value: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
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

export function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1).replace('.', ',')}%`;
}
