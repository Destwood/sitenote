import type { Enums } from "@sitenote/db";

export const THREAD_STATUS_LABELS: Readonly<Record<Enums<"thread_status">, string>> = {
  open: "Open",
  resolved: "Resolved",
};
