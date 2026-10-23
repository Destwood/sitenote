import type { SitenoteClient } from "@sitenote/db";
import { randomUUID } from "node:crypto";

import { SEEDED_WORKSPACE_ID } from "../invites";

export const SEEDED_SITE_ID = "20000000-0000-4000-8000-000000000001";
export const FIXTURE_PAGE_ORIGIN = "http://127.0.0.1:4173";
export const SEEDED_MEMBER_ID = "00000000-0000-4000-8000-000000000002";

const ANCHOR = {
  kind: "element",
  selectors: {
    css: "#cta",
    nthPath: "body > main:nth-of-type(1) > section:nth-of-type(1) > button:nth-of-type(1)",
    id: "cta",
  },
  fingerprint: { tag: "button", text: "Book a call", classes: ["cta"], width: 127, height: 50 },
  offset: { x: 0.5, y: 0.5 },
};

export interface DashboardThread {
  id: string;
  pagePath: string;
}

export function uniqueToken(): string {
  return randomUUID().replaceAll("-", "").slice(0, 12);
}

export async function createDashboardThread(
  owner: SitenoteClient,
  token: string,
): Promise<DashboardThread> {
  const pagePath = `/dashboard/${token}`;
  const { data, error } = await owner.rpc("create_thread", {
    p_site_id: SEEDED_SITE_ID,
    p_page_url: `${FIXTURE_PAGE_ORIGIN}${pagePath}`,
    p_anchor: ANCHOR,
    p_context: {},
    p_body: `Dashboard check ${token}`,
    p_mentions: [],
  });
  if (error !== null) {
    throw new Error(`create_thread failed: ${error.message}`);
  }
  return { id: data.id, pagePath };
}

export async function deleteDashboardThread(owner: SitenoteClient, id: string): Promise<void> {
  const { error } = await owner.from("threads").delete().eq("id", id);
  if (error !== null) {
    throw new Error(`Deleting the thread failed: ${error.message}`);
  }
}

export async function setSeededMemberRole(
  owner: SitenoteClient,
  userId: string,
  role: "member" | "guest",
): Promise<void> {
  const { error } = await owner
    .from("members")
    .update({ role })
    .eq("workspace_id", SEEDED_WORKSPACE_ID)
    .eq("user_id", userId);
  if (error !== null) {
    throw new Error(`Setting the role failed: ${error.message}`);
  }
}
