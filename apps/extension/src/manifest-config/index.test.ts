import { describe, expect, it } from "vitest";

import { E2E_HOST_PERMISSIONS, TOGGLE_COMMENT_MODE_COMMAND, createManifest } from ".";

describe("createManifest", () => {
  it("asks for no host access at install time in the production build", () => {
    const manifest = createManifest({ e2e: false });

    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.content_scripts).toBeUndefined();
    expect(manifest.optional_host_permissions).toEqual(["http://*/*", "https://*/*"]);
  });

  it("never lists the local test hosts in the production build", () => {
    const serialized = JSON.stringify(createManifest({ e2e: false }));

    expect(serialized).not.toContain("127.0.0.1");
    expect(serialized).not.toContain("localhost");
  });

  it("adds only the fixture hosts as host permissions in the e2e build", () => {
    const manifest = createManifest({ e2e: true });

    expect(manifest.host_permissions).toEqual(["http://127.0.0.1/*", "http://localhost/*"]);
    expect(manifest.host_permissions).toEqual([...E2E_HOST_PERMISSIONS]);
    expect(manifest.optional_host_permissions).toEqual(["http://*/*", "https://*/*"]);
  });

  it.each([false, true])("uses the same API permissions and key when e2e is %s", (e2e) => {
    const manifest = createManifest({ e2e });

    expect(manifest.permissions).toEqual([
      "storage",
      "identity",
      "alarms",
      "scripting",
      "activeTab",
    ]);
    expect(manifest.key).toMatch(/^MIIB/);
  });

  it.each([false, true])("declares the comment mode shortcut when e2e is %s", (e2e) => {
    expect(createManifest({ e2e }).commands).toEqual({
      [TOGGLE_COMMENT_MODE_COMMAND]: {
        suggested_key: { default: "Alt+Shift+C" },
        description: "Toggle comment mode",
      },
    });
  });
});
