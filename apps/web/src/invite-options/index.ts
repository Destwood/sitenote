import type { Enums } from "@sitenote/db";

export type InviteRole = Extract<Enums<"member_role">, "member" | "guest">;

export const INVITE_ROLES: readonly InviteRole[] = ["member", "guest"];

export const INVITE_ROLE_LABELS: Readonly<Record<InviteRole, string>> = {
  member: "Member",
  guest: "Guest",
};

export const EXPIRY_OPTIONS: readonly { days: number; label: string }[] = [
  { days: 1, label: "1 day" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
];

export const DEFAULT_EXPIRY_DAYS = 7;

export function parseInviteRole(value: unknown): InviteRole | null {
  return INVITE_ROLES.find((role) => role === value) ?? null;
}

export function parseExpiryDays(value: unknown): number | null {
  const days = typeof value === "string" ? Number(value) : Number.NaN;
  return EXPIRY_OPTIONS.find((option) => option.days === days)?.days ?? null;
}

export function toInterval(days: number): string {
  return `${String(days)} days`;
}
