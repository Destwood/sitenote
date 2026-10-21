const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export function formatRelativeTime(iso: string, now: number, locale?: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) {
    return "";
  }
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const seconds = Math.round((time - now) / 1000);
  const magnitude = Math.abs(seconds);
  if (magnitude < MINUTE) {
    return formatter.format(0, "second");
  }
  if (magnitude < HOUR) {
    return formatter.format(Math.trunc(seconds / MINUTE), "minute");
  }
  if (magnitude < DAY) {
    return formatter.format(Math.trunc(seconds / HOUR), "hour");
  }
  if (magnitude < MONTH) {
    return formatter.format(Math.trunc(seconds / DAY), "day");
  }
  if (magnitude < YEAR) {
    return formatter.format(Math.trunc(seconds / MONTH), "month");
  }
  return formatter.format(Math.trunc(seconds / YEAR), "year");
}

export function formatAbsoluteTime(iso: string, locale?: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) {
    return "";
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(time);
}
