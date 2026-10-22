import type { UserManifest } from "wxt";

import { EXTENSION_PUBLIC_KEY } from "../extension-key";

export const TOGGLE_COMMENT_MODE_COMMAND = "toggle-comment-mode";
export const E2E_HOST_PERMISSIONS: readonly string[] = [
  "http://127.0.0.1/*",
  "http://localhost/*",
  "https://example.com/*",
];

export const E2E_WEB_MATCHES: readonly string[] = [
  "http://localhost:3000/*",
  "http://127.0.0.1:3000/*",
];

export interface ManifestOptions {
  e2e: boolean;
  webUrl: string | undefined;
}

export function webMatchOf(webUrl: string | undefined): string | null {
  const url = webUrl === undefined ? null : URL.parse(webUrl);
  return url !== null && (url.protocol === "http:" || url.protocol === "https:")
    ? `${url.origin}/*`
    : null;
}

function connectableMatches(e2e: boolean, webUrl: string | undefined): string[] {
  if (e2e) {
    return [...E2E_WEB_MATCHES];
  }
  const match = webMatchOf(webUrl);
  return match === null ? [] : [match];
}

export function createManifest({ e2e, webUrl }: ManifestOptions): UserManifest {
  const matches = connectableMatches(e2e, webUrl);
  return {
    name: "Sitenote",
    description: "Figma-style comments on any live website.",
    key: EXTENSION_PUBLIC_KEY,
    permissions: ["storage", "identity", "alarms", "scripting", "activeTab"],
    optional_host_permissions: ["http://*/*", "https://*/*"],
    ...(matches.length > 0 ? { externally_connectable: { matches } } : {}),
    ...(e2e ? { host_permissions: [...E2E_HOST_PERMISSIONS] } : {}),
    commands: {
      [TOGGLE_COMMENT_MODE_COMMAND]: {
        suggested_key: { default: "Alt+Shift+C" },
        description: "Toggle comment mode",
      },
    },
  };
}
