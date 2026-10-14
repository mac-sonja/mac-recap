/** Timestamps are stored in UTC and always shown in Europe/Rome, Italian format. */
const DATE_TIME = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** An ISO timestamp as Italian date and time in Europe/Rome, e.g. `13/10/2026, 09:05`. */
export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
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
