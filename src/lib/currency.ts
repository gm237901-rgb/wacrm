/**
 * Currency — single source of truth for deal-value formatting.
 *
 * The CRM operates in Brazilian reais only. Everything renders as
 * "R$ 1.234" regardless of who is looking: the locale is pinned to
 * pt-BR rather than left to `undefined`, which resolves to the
 * *viewer's* browser locale. That default is why an account could see
 * "BRL300,000" — an English locale with no localized symbol for BRL
 * falls back to printing the ISO code and English grouping.
 *
 * The formatters take no currency argument on purpose. A parameter
 * that only ever accepts one value is an invitation to thread a
 * second one through later.
 */

/** The only currency the CRM stores. Written to the `currency`
 *  columns (deals, products) and `accounts.default_currency`. */
export const DEFAULT_CURRENCY = "BRL";

/** Pinned so output never depends on the viewer's browser locale. */
const LOCALE = "pt-BR";

const BRL = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: DEFAULT_CURRENCY,
  // Whole-number output — deal values are tracked to the real across
  // the app, and centavos only add noise to a pipeline total.
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Format a deal value as reais: 1234 → "R$ 1.234".
 *
 * Total by design — a non-finite value renders as "R$ 0" rather than
 * "R$ NaN", so a bad row can't put garbage on a dashboard.
 */
export function formatCurrency(value: number): string {
  return BRL.format(Number(value) || 0);
}

/**
 * Compact currency for tight spaces (donut center, legend rows):
 * "R$1.2M" / "R$34.5k" / "R$900".
 */
export function formatCurrencyShort(value: number): string {
  return `R$${formatCompactNumber(value)}`;
}

/**
 * Compact number for tight spaces (chart tiles, legends): 1_234 → "1.2k",
 * 1_200_000 → "1.2M", 900 → "900". The unit-less core shared with
 * {@link formatCurrencyShort}.
 */
export function formatCompactNumber(value: number): string {
  const v = Number(value || 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return v.toFixed(0);
}
