import type { UserManifest } from "wxt";

import { EXTENSION_PUBLIC_KEY } from "../extension-key";

export const TOGGLE_COMMENT_MODE_COMMAND = "toggle-comment-mode";
export const E2E_HOST_PERMISSIONS: readonly string[] = ["http://127.0.0.1/*", "http://localhost/*"];

export interface ManifestOptions {
  e2e: boolean;
}

export function createManifest({ e2e }: ManifestOptions): UserManifest {
  return {
    name: "Sitenote",
    description: "Figma-style comments on any live website.",
    key: EXTENSION_PUBLIC_KEY,
    permissions: ["storage", "identity", "alarms", "scripting", "activeTab"],
    optional_host_permissions: ["http://*/*", "https://*/*"],
    ...(e2e ? { host_permissions: [...E2E_HOST_PERMISSIONS] } : {}),
    commands: {
      [TOGGLE_COMMENT_MODE_COMMAND]: {
        suggested_key: { default: "Alt+Shift+C" },
        description: "Toggle comment mode",
      },
    },
  };
}
