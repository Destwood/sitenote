import type { Enums } from "@sitenote/db";

export const MEMBER_ROLE_LABELS: Readonly<Record<Enums<"member_role">, string>> = {
  owner: "Owner",
  member: "Member",
  guest: "Guest",
};

export const ASSIGNABLE_ROLES = ["member", "guest"] as const;

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export function parseAssignableRole(value: unknown): AssignableRole | null {
  return ASSIGNABLE_ROLES.find((role) => role === value) ?? null;
}
