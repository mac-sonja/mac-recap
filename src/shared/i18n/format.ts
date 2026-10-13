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
