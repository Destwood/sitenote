import { describe, expect, it } from "vitest";

import {
  E2E_HOST_PERMISSIONS,
  E2E_WEB_MATCHES,
  TOGGLE_COMMENT_MODE_COMMAND,
  TOGGLE_COMMENT_MODE_SHORTCUT,
  createManifest,
  webMatchOf,
} from ".";

const WEB_URL = "https://app.sitenote.test";

describe("createManifest", () => {
  it("asks for no host access at install time in the production build", () => {
    const manifest = createManifest({ e2e: false, webUrl: WEB_URL });

    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.content_scripts).toBeUndefined();
    expect(manifest.optional_host_permissions).toEqual(["http://*/*", "https://*/*"]);
  });

  it("never lists the local test hosts in the production build", () => {
    const serialized = JSON.stringify(createManifest({ e2e: false, webUrl: WEB_URL }));

    expect(serialized).not.toContain("127.0.0.1");
    expect(serialized).not.toContain("localhost");
    expect(serialized).not.toContain("example.com");
    expect(serialized).not.toContain("<all_urls>");
  });

  it("adds the fixture hosts, example.com and the capture permission as host permissions in the e2e build", () => {
    const manifest = createManifest({ e2e: true, webUrl: WEB_URL });

    expect(manifest.host_permissions).toEqual([
      "http://127.0.0.1/*",
      "http://localhost/*",
      "https://example.com/*",
      "<all_urls>",
    ]);
    expect(manifest.host_permissions).toEqual([...E2E_HOST_PERMISSIONS]);
    expect(manifest.optional_host_permissions).toEqual(["http://*/*", "https://*/*"]);
  });

  it("connects the production build to the configured web origin only", () => {
    const manifest = createManifest({
      e2e: false,
      webUrl: "https://app.sitenote.test/some/path?x=1",
    });

    expect(manifest.externally_connectable).toEqual({ matches: ["https://app.sitenote.test/*"] });
  });

  it("connects the e2e build to the local web app on both loopback names", () => {
    const manifest = createManifest({ e2e: true, webUrl: undefined });

    expect(manifest.externally_connectable).toEqual({
      matches: ["http://localhost:3000/*", "http://127.0.0.1:3000/*"],
    });
    expect(manifest.externally_connectable).toEqual({ matches: [...E2E_WEB_MATCHES] });
  });

  it.each([undefined, "", "not a url", "ftp://app.sitenote.test", "javascript:alert(1)"])(
    "leaves externally_connectable out of the production manifest for the web URL %s",
    (webUrl) => {
      expect(createManifest({ e2e: false, webUrl }).externally_connectable).toBeUndefined();
      expect(webMatchOf(webUrl)).toBeNull();
    },
  );

  it.each([false, true])("uses the same API permissions and key when e2e is %s", (e2e) => {
    const manifest = createManifest({ e2e, webUrl: WEB_URL });

    expect(manifest.permissions).toEqual([
      "storage",
      "identity",
      "alarms",
      "scripting",
      "activeTab",
      "contextMenus",
    ]);
    expect(manifest.key).toMatch(/^MIIB/);
  });

  it.each([false, true])("declares the comment mode shortcut when e2e is %s", (e2e) => {
    expect(createManifest({ e2e, webUrl: WEB_URL }).commands).toEqual({
      [TOGGLE_COMMENT_MODE_COMMAND]: {
        suggested_key: { default: TOGGLE_COMMENT_MODE_SHORTCUT },
        description: "Toggle comment mode",
      },
    });
  });

  it("suggests the comment mode shortcut from the constant", () => {
    expect(createManifest({ e2e: false, webUrl: WEB_URL }).commands).toMatchObject({
      [TOGGLE_COMMENT_MODE_COMMAND]: { suggested_key: { default: TOGGLE_COMMENT_MODE_SHORTCUT } },
    });
  });
});
