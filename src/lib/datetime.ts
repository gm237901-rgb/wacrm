/**
 * Date, time and number formatting — pinned to pt-BR.
 *
 * Every one of these used to be an inline `toLocaleDateString()` or
 * `toLocaleString(undefined, …)`. Both forms mean "format this the way
 * the *viewer's* browser is configured", which is why an account on an
 * English machine saw `08/13/2026 09:51 AM` while the rest of the app
 * spoke Portuguese. Same defect as the currency formatter had.
 *
 * Pinning also removes a class of hydration warning: the server and the
 * browser no longer have to agree on a locale they were never told.
 *
 * Note this does NOT cover `<input type="datetime-local">`. That
 * control's display format comes from the operating system and cannot
 * be set from the page — only a custom picker can change it.
 */

const LOCALE = "pt-BR";

/** Accepts what the DB hands us (ISO string) or a live Date. */
type DateInput = string | number | Date;

function toDate(value: DateInput): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const DATE = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const DATE_TIME = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const TIME = new Intl.DateTimeFormat(LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const LONG_DATE = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const DAY_MONTH = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "2-digit",
});

const WEEKDAY_DAY_MONTH = new Intl.DateTimeFormat(LOCALE, {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

const NUMBER = new Intl.NumberFormat(LOCALE);

/** Placeholder for a null/unparseable date. Never render "Invalid Date". */
const EMPTY = "—";

/** 13/08/2026 */
export function formatDate(value: DateInput): string {
  const d = toDate(value);
  return d ? DATE.format(d) : EMPTY;
}

/** 13/08/2026 09:51 */
export function formatDateTime(value: DateInput): string {
  const d = toDate(value);
  return d ? DATE_TIME.format(d).replace(", ", " ") : EMPTY;
}

/** 09:51 */
export function formatTime(value: DateInput): string {
  const d = toDate(value);
  return d ? TIME.format(d) : EMPTY;
}

/** 13 de agosto de 2026 */
export function formatLongDate(value: DateInput): string {
  const d = toDate(value);
  return d ? LONG_DATE.format(d) : EMPTY;
}

/** 13/08 — compact enough for a chart axis. */
export function formatDayMonth(value: DateInput): string {
  const d = toDate(value);
  return d ? DAY_MONTH.format(d) : EMPTY;
}

/** qua., 13/08 — for chart tooltips, where the weekday earns its space. */
export function formatWeekdayDayMonth(value: DateInput): string {
  const d = toDate(value);
  return d ? WEEKDAY_DAY_MONTH.format(d) : EMPTY;
}

/** 1.234 — thousands grouped the Brazilian way, not 1,234. */
export function formatNumber(value: number): string {
  return NUMBER.format(Number(value) || 0);
}
