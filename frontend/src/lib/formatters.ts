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
 * Compact European currency for grid cells — K with up to 2 decimals.
 * Examples: 6,35K €  14,4K €  850 €  1,2M €
 */
export function formatCurrencyCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) {
    const m = (abs / 1_000_000).toFixed(2).replace('.', ',').replace(/,?0+$/, '');
    return `${sign}${m}M €`;
  }
  if (abs >= 1_000) {
    const k = (abs / 1_000).toFixed(2).replace('.', ',').replace(/,?0+$/, '');
    return `${sign}${k}K €`;
  }
  if (abs === 0) return '—';
  return `${sign}${Math.round(abs)} €`;
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
