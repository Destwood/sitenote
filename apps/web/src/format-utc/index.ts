const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function formatUtcDateTime(iso: string): string {
  return `${DATE_FORMAT.format(new Date(iso))} UTC`;
}
