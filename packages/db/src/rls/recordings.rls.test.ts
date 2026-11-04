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

const BUCKET = "recordings";
const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00]);
const SIZE_LIMIT = 40 * 1024 * 1024;

let scenario: Scenario;

beforeAll(async () => {
  scenario = await createScenario();
});

afterAll(async () => {
  await destroyScenario(scenario);
});

function newPath(workspaceId: string, extension = "webm"): string {
  return `${workspaceId}/${randomUUID()}.${extension}`;
}

async function upload(
  actor: TestUser,
  path: string,
  options: { contentType?: string; upsert?: boolean; body?: Uint8Array } = {},
) {
  const result = await actor.client.storage.from(BUCKET).upload(path, options.body ?? WEBM, {
    contentType: options.contentType ?? "video/webm",
    upsert: options.upsert ?? false,
  });
  if (result.error === null) {
    scenario.recordingPaths.push(path);
  }
  return result;
}

async function adminUpload(path: string) {
  const result = await scenario.admin.storage
    .from(BUCKET)
    .upload(path, WEBM, { contentType: "video/webm" });
  expect(result.error).toBeNull();
  scenario.recordingPaths.push(path);
}

async function objectExists(path: string): Promise<boolean> {
  const [folder = "", name = ""] = path.split("/");
  const result = await scenario.admin.storage.from(BUCKET).list(folder, { search: name });
  expect(result.error).toBeNull();
  return (result.data ?? []).some((entry) => entry.name === name);
}

describe("recordings bucket configuration", () => {
  it("is private, size limited and restricted to webm video", async () => {
    const bucket = unwrap(await scenario.admin.storage.getBucket(BUCKET));
    expect(bucket.public).toBe(false);
    expect(bucket.file_size_limit).toBe(SIZE_LIMIT);
    expect(bucket.allowed_mime_types).toEqual(["video/webm"]);
  });

  it("is not reachable through a public url", async () => {
    const path = newPath(scenario.workspaceId);
    await adminUpload(path);
    const response = await fetch(`${readTestEnv().url}/storage/v1/object/public/${BUCKET}/${path}`);
    expect(response.ok).toBe(false);
  });
});

describe("recordings upload", () => {
  it("lets the owner, a member and a guest upload into their workspace folder", async () => {
    for (const actor of [scenario.owner, scenario.member, scenario.guest]) {
      const result = await upload(actor, newPath(scenario.workspaceId));
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
      .upload(path, WEBM, { contentType: "video/webm" });
    expect(result.error).not.toBeNull();
    expect(await objectExists(path)).toBe(false);
  });

  it("denies every path that is not exactly <workspace>/<thread>.webm", async () => {
    const workspace = scenario.workspaceId;
    const thread = randomUUID();
    const upper = workspace.toUpperCase();
    const paths = [
      `${workspace}/${thread}.mp4`,
      `${workspace}/${thread}.WEBM`,
      `${workspace}/${thread}.webm.html`,
      `${workspace}/${thread}`,
      `${workspace}/nested/${thread}.webm`,
      `${upper}/${thread}.webm`,
      `${workspace}/not-a-uuid.webm`,
      `not-a-uuid/${thread}.webm`,
      `${workspace.slice(0, -1)}/${thread}.webm`,
      `${workspace}${thread}.webm`,
      `${thread}.webm`,
      `%2e%2e/${workspace}/${thread}.webm`,
      `${workspace}/${thread}.webm%00.html`,
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
      `${scenario.workspaceId}%2F..%2F${scenario.otherWorkspaceId}%2F${thread}.webm`,
      `${scenario.otherWorkspaceId}%2F..%2F${scenario.workspaceId}%2F${thread}.webm`,
      `${scenario.workspaceId}%2F${scenario.otherWorkspaceId}%2F..%2F${thread}.webm`,
      `${scenario.workspaceId}%2F%2e%2e%2F${thread}.webm`,
      `${scenario.workspaceId}%2F%2F${thread}.webm`,
      `%2F${scenario.workspaceId}%2F${thread}.webm`,
    ];
    for (const name of encoded) {
      const response = await fetch(`${env.url}/storage/v1/object/${BUCKET}/${name}`, {
        method: "POST",
        headers: {
          apikey: env.publishableKey,
          authorization: `Bearer ${token}`,
          "content-type": "video/webm",
        },
        body: WEBM,
      });
      expect(response.ok, name).toBe(false);
      expect(await objectExists(`${scenario.otherWorkspaceId}/${thread}.webm`)).toBe(false);
      expect(await objectExists(`${scenario.workspaceId}/${thread}.webm`)).toBe(false);
    }
  });

  it("denies other content types, other extensions and oversized files", async () => {
    const png = await upload(scenario.member, newPath(scenario.workspaceId), {
      contentType: "image/png",
    });
    expect(png.error?.message).toMatch(/mime type/i);
    const mp4 = await upload(scenario.member, newPath(scenario.workspaceId, "mp4"));
    expect(mp4.error).not.toBeNull();
    expect(await objectExists(newPath(scenario.workspaceId, "mp4"))).toBe(false);
    const big = await upload(scenario.member, newPath(scenario.workspaceId), {
      body: new Uint8Array(SIZE_LIMIT + 1),
    });
    expect(big.error?.message).toMatch(/exceeded the maximum allowed size/i);
  });

  it("does not let a member overwrite an existing recording", async () => {
    const path = newPath(scenario.workspaceId);
    expect((await upload(scenario.owner, path)).error).toBeNull();
    const duplicate = await upload(scenario.member, path);
    expect(duplicate.error).not.toBeNull();
    const upsert = await upload(scenario.member, path, { upsert: true });
    expect(upsert.error?.message).toMatch(/row-level security/);
  });

  it("lets the owner replace a recording", async () => {
    const path = newPath(scenario.workspaceId);
    expect((await upload(scenario.member, path)).error).toBeNull();
    const result = await upload(scenario.owner, path, { upsert: true });
    expect(result.error).toBeNull();
  });
});

describe("recordings read", () => {
  it("lets the owner, a member and a guest download and sign a recording", async () => {
    const path = newPath(scenario.workspaceId);
    await adminUpload(path);
    for (const reader of [scenario.owner, scenario.member, scenario.guest]) {
      const download = await reader.client.storage.from(BUCKET).download(path);
      expect(download.error).toBeNull();
      expect(download.data?.size).toBe(WEBM.length);
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

describe("recordings delete", () => {
  it("lets the owner delete a recording", async () => {
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
