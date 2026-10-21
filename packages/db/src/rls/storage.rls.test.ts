import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createPublicClient,
  createScenario,
  destroyScenario,
  readTestEnv,
  unwrap,
  type Scenario,
  type TestUser,
} from "../test-harness";

const BUCKET = "screenshots";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

let scenario: Scenario;

beforeAll(async () => {
  scenario = await createScenario();
});

afterAll(async () => {
  await destroyScenario(scenario);
});

function newPath(workspaceId: string, extension = "png"): string {
  return `${workspaceId}/${randomUUID()}.${extension}`;
}

async function upload(
  actor: TestUser,
  path: string,
  options: { contentType?: string; upsert?: boolean; body?: Uint8Array } = {},
) {
  const result = await actor.client.storage.from(BUCKET).upload(path, options.body ?? PNG, {
    contentType: options.contentType ?? "image/png",
    upsert: options.upsert ?? false,
  });
  if (result.error === null) {
    scenario.storagePaths.push(path);
  }
  return result;
}

async function adminUpload(path: string) {
  const result = await scenario.admin.storage
    .from(BUCKET)
    .upload(path, PNG, { contentType: "image/png" });
  expect(result.error).toBeNull();
  scenario.storagePaths.push(path);
}

async function objectExists(path: string): Promise<boolean> {
  const [folder = "", name = ""] = path.split("/");
  const result = await scenario.admin.storage.from(BUCKET).list(folder, { search: name });
  expect(result.error).toBeNull();
  return (result.data ?? []).some((entry) => entry.name === name);
}

describe("screenshots bucket configuration", () => {
  it("is private, size limited and restricted to raster image types", async () => {
    const bucket = unwrap(await scenario.admin.storage.getBucket(BUCKET));
    expect(bucket.public).toBe(false);
    expect(bucket.file_size_limit).toBe(5 * 1024 * 1024);
    expect(bucket.allowed_mime_types).toEqual(["image/png", "image/jpeg", "image/webp"]);
  });

  it("is not reachable through a public url", async () => {
    const path = newPath(scenario.workspaceId);
    await adminUpload(path);
    const response = await fetch(`${readTestEnv().url}/storage/v1/object/public/${BUCKET}/${path}`);
    expect(response.ok).toBe(false);
  });
});

describe("screenshots upload", () => {
  it("lets the owner, a member and a guest upload into their workspace folder", async () => {
    for (const actor of [scenario.owner, scenario.member, scenario.guest]) {
      const result = await upload(actor, newPath(scenario.workspaceId));
      expect(result.error).toBeNull();
    }
    for (const extension of ["jpg", "jpeg", "webp"]) {
      const contentType = extension === "webp" ? "image/webp" : "image/jpeg";
      const result = await upload(scenario.member, newPath(scenario.workspaceId, extension), {
        contentType,
      });
      expect(result.error).toBeNull();
    }
  });

  it("denies an outsider and an anonymous non-member", async () => {
    for (const actor of [scenario.outsider, scenario.stranger]) {
      const path = newPath(scenario.workspaceId);
      const result = await upload(actor, path);
      expect(result.error?.message).toMatch(/row-level security/);
      expect(await objectExists(path)).toBe(false);
    }
  });

  it("denies writing into another workspace's folder", async () => {
    const path = newPath(scenario.otherWorkspaceId);
    const result = await upload(scenario.member, path);
    expect(result.error?.message).toMatch(/row-level security/);
    expect(await objectExists(path)).toBe(false);
  });

  it("denies the unauthenticated role", async () => {
    const path = newPath(scenario.workspaceId);
    const result = await createPublicClient()
      .storage.from(BUCKET)
      .upload(path, PNG, { contentType: "image/png" });
    expect(result.error).not.toBeNull();
    expect(await objectExists(path)).toBe(false);
  });

  it("denies every path that is not exactly <workspace>/<thread>.<image extension>", async () => {
    const workspace = scenario.workspaceId;
    const thread = randomUUID();
    const upper = workspace.toUpperCase();
    const paths = [
      `${workspace}/${thread}.svg`,
      `${workspace}/${thread}.PNG`,
      `${workspace}/${thread}.png.html`,
      `${workspace}/${thread}`,
      `${workspace}/nested/${thread}.png`,
      `${upper}/${thread}.png`,
      `${workspace}/not-a-uuid.png`,
      `not-a-uuid/${thread}.png`,
      `${workspace.slice(0, -1)}/${thread}.png`,
      `${workspace}${thread}.png`,
      `${thread}.png`,
      `%2e%2e/${workspace}/${thread}.png`,
      `${workspace}/${thread}.png%00.html`,
    ];
    for (const path of paths) {
      const result = await upload(scenario.member, path);
      expect(result.error, path).not.toBeNull();
    }
  });

  it("denies traversal sequences that survive client-side url normalisation", async () => {
    const env = readTestEnv();
    const session = await scenario.member.client.auth.getSession();
    const token = session.data.session?.access_token ?? "";
    const thread = randomUUID();
    const encoded = [
      `${scenario.workspaceId}%2F..%2F${scenario.otherWorkspaceId}%2F${thread}.png`,
      `${scenario.otherWorkspaceId}%2F..%2F${scenario.workspaceId}%2F${thread}.png`,
      `${scenario.workspaceId}%2F${scenario.otherWorkspaceId}%2F..%2F${thread}.png`,
      `${scenario.workspaceId}%2F%2e%2e%2F${thread}.png`,
      `${scenario.workspaceId}%2F%2F${thread}.png`,
      `%2F${scenario.workspaceId}%2F${thread}.png`,
    ];
    for (const name of encoded) {
      const response = await fetch(`${env.url}/storage/v1/object/${BUCKET}/${name}`, {
        method: "POST",
        headers: {
          apikey: env.publishableKey,
          authorization: `Bearer ${token}`,
          "content-type": "image/png",
        },
        body: PNG,
      });
      expect(response.ok, name).toBe(false);
      expect(await objectExists(`${scenario.otherWorkspaceId}/${thread}.png`)).toBe(false);
      expect(await objectExists(`${scenario.workspaceId}/${thread}.png`)).toBe(false);
    }
  });

  it("denies other content types and oversized files", async () => {
    const svg = await upload(scenario.member, newPath(scenario.workspaceId), {
      contentType: "image/svg+xml",
    });
    expect(svg.error?.message).toMatch(/mime type/i);
    const html = await upload(scenario.member, newPath(scenario.workspaceId), {
      contentType: "text/html",
    });
    expect(html.error?.message).toMatch(/mime type/i);
    const big = await upload(scenario.member, newPath(scenario.workspaceId), {
      body: new Uint8Array(5 * 1024 * 1024 + 1),
    });
    expect(big.error?.message).toMatch(/exceeded the maximum allowed size/i);
  });

  it("does not let a member overwrite an existing screenshot", async () => {
    const path = newPath(scenario.workspaceId);
    expect((await upload(scenario.owner, path)).error).toBeNull();
    const duplicate = await upload(scenario.member, path);
    expect(duplicate.error).not.toBeNull();
    const upsert = await upload(scenario.member, path, { upsert: true });
    expect(upsert.error?.message).toMatch(/row-level security/);
  });

  it("lets the owner replace a screenshot", async () => {
    const path = newPath(scenario.workspaceId);
    expect((await upload(scenario.member, path)).error).toBeNull();
    const result = await upload(scenario.owner, path, { upsert: true });
    expect(result.error).toBeNull();
  });
});

describe("screenshots read", () => {
  it("lets the owner, a member and a guest download and sign a screenshot", async () => {
    const path = newPath(scenario.workspaceId);
    await adminUpload(path);
    for (const reader of [scenario.owner, scenario.member, scenario.guest]) {
      const download = await reader.client.storage.from(BUCKET).download(path);
      expect(download.error).toBeNull();
      expect(download.data?.size).toBe(PNG.length);
      const signed = await reader.client.storage.from(BUCKET).createSignedUrl(path, 60);
      expect(signed.error).toBeNull();
      expect(signed.data?.signedUrl).toContain("/object/sign/");
    }
  });

  it("hides it from an outsider and an anonymous non-member", async () => {
    const path = newPath(scenario.workspaceId);
    await adminUpload(path);
    for (const reader of [scenario.outsider, scenario.stranger]) {
      const download = await reader.client.storage.from(BUCKET).download(path);
      expect(download.error).not.toBeNull();
      const signed = await reader.client.storage.from(BUCKET).createSignedUrl(path, 60);
      expect(signed.error).not.toBeNull();
      const listing = await reader.client.storage.from(BUCKET).list(scenario.workspaceId);
      expect(listing.error).toBeNull();
      expect(listing.data).toEqual([]);
    }
    const anonymous = await createPublicClient().storage.from(BUCKET).download(path);
    expect(anonymous.error).not.toBeNull();
  });

  it("lists only the caller's own workspace folder", async () => {
    const own = newPath(scenario.workspaceId);
    const foreign = newPath(scenario.otherWorkspaceId);
    await adminUpload(own);
    await adminUpload(foreign);
    const listing = await scenario.member.client.storage.from(BUCKET).list(scenario.workspaceId);
    expect(listing.error).toBeNull();
    expect(listing.data?.map((entry) => entry.name)).toContain(own.split("/")[1]);
    const crossListing = await scenario.member.client.storage
      .from(BUCKET)
      .list(scenario.otherWorkspaceId);
    expect(crossListing.error).toBeNull();
    expect(crossListing.data).toEqual([]);
    const download = await scenario.member.client.storage.from(BUCKET).download(foreign);
    expect(download.error).not.toBeNull();
  });
});

describe("screenshots delete", () => {
  it("lets the owner delete a screenshot", async () => {
    const path = newPath(scenario.workspaceId);
    await adminUpload(path);
    const result = await scenario.owner.client.storage.from(BUCKET).remove([path]);
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
    expect(await objectExists(path)).toBe(false);
  });

  it("removes nothing for a member, a guest, an outsider or an anonymous non-member", async () => {
    const path = newPath(scenario.workspaceId);
    await adminUpload(path);
    for (const actor of [scenario.member, scenario.guest, scenario.outsider, scenario.stranger]) {
      const result = await actor.client.storage.from(BUCKET).remove([path]);
      expect(result.data ?? []).toEqual([]);
    }
    expect(await objectExists(path)).toBe(true);
  });
});
