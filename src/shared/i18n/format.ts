/** Timestamps are stored in UTC and always shown in Europe/Rome, Italian format. */
const DAY_TIME = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const DAY_YEAR_TIME = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * An ISO timestamp as a short Italian date and time in Europe/Rome: `13 ott, 09:05`
 * in the current year, `13 ott 2025, 09:05` otherwise.
 */
export function formatDateTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  return (currentYear(date) === currentYear(now) ? DAY_TIME : DAY_YEAR_TIME).format(date);
}

const YEAR = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Rome", year: "numeric" });

/** The calendar year in Europe/Rome at `now`, e.g. `2026`. */
export function currentYear(now: Date = new Date()): number {
  return Number(YEAR.format(now));
}

const SIZE = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });
const KB = 1024;
const MB = 1024 * 1024;

/**
 * A file size in Italian format, binary units (1 MB = 1024 × 1024 bytes, as the
 * per-file upload limit), e.g. `4,2 MB`, `512 KB`, `820 B`.
 */
export function formatBytes(bytes: number): string {
  if (bytes < KB) return `${SIZE.format(bytes)} B`;
  // The unit is chosen after rounding, so 1,048,575 B reads "1 MB", never "1024 KB".
  const kilobytes = Math.round((bytes / KB) * 10) / 10;
  if (kilobytes < 1024) return `${SIZE.format(kilobytes)} KB`;
  return `${SIZE.format(bytes / MB)} MB`;
}
