import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "../database-types";
import {
  ELEMENT_ANCHOR,
  UNIQUE_VIOLATION,
  createScenario,
  destroyScenario,
  expectCode,
  expectRlsViolation,
  unwrap,
  type Scenario,
  type TestUser,
} from "../test-harness";

type CreateThreadArgs = Database["public"]["Functions"]["create_thread"]["Args"];

const BUCKET = "screenshots";
const IMAGE = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

let scenario: Scenario;

beforeAll(async () => {
  scenario = await createScenario();
});

afterAll(async () => {
  await destroyScenario(scenario);
});

function args(overrides: Partial<CreateThreadArgs> = {}): CreateThreadArgs {
  return {
    p_site_id: scenario.site.id,
    p_page_url: `${scenario.site.origin}/${randomUUID()}`,
    p_anchor: ELEMENT_ANCHOR,
    p_context: {},
    p_body: "The headline wraps badly",
    p_mentions: [],
    ...overrides,
  };
}

function call(actor: Pick<TestUser, "client">, params: CreateThreadArgs) {
  return actor.client.rpc("create_thread", params);
}

async function storeImage(
  actor: Pick<TestUser, "client">,
  path: string,
  contentType = "image/webp",
) {
  const result = await actor.client.storage
    .from(BUCKET)
    .upload(path, IMAGE, { contentType, upsert: false });
  expect(result.error).toBeNull();
  scenario.storagePaths.push(path);
}

async function adminImage(path: string) {
  const result = await scenario.admin.storage
    .from(BUCKET)
    .upload(path, IMAGE, { contentType: "image/webp" });
  expect(result.error).toBeNull();
  scenario.storagePaths.push(path);
}

describe("create_thread with a screenshot", () => {
  it("uses the given thread id and stores the path of an uploaded image", async () => {
    for (const [actor, extension] of [
      [scenario.owner, "webp"],
      [scenario.member, "png"],
      [scenario.guest, "webp"],
    ] as const) {
      const id = randomUUID();
      const path = `${scenario.workspaceId}/${id}.${extension}`;
      await storeImage(actor, path, extension === "png" ? "image/png" : "image/webp");

      const result = await call(actor, args({ p_id: id, p_screenshot_path: path }));

      expect(unwrap(result)).toMatchObject({ id, screenshot_path: path, created_by: actor.id });
    }
  });

  it("accepts an image written by the service role into the workspace folder", async () => {
    const id = randomUUID();
    const path = `${scenario.workspaceId}/${id}.webp`;
    await adminImage(path);

    const result = await call(scenario.member, args({ p_id: id, p_screenshot_path: path }));

    expect(unwrap(result).screenshot_path).toBe(path);
  });

  it("creates the thread with a null path when the object does not exist", async () => {
    const id = randomUUID();

    const result = await call(
      scenario.member,
      args({ p_id: id, p_screenshot_path: `${scenario.workspaceId}/${id}.webp` }),
    );

    expect(unwrap(result)).toMatchObject({ id, screenshot_path: null });
  });

  it("ignores a path in another workspace", async () => {
    const id = randomUUID();
    const path = `${scenario.otherWorkspaceId}/${id}.webp`;
    await adminImage(path);

    const result = await call(scenario.member, args({ p_id: id, p_screenshot_path: path }));

    expect(unwrap(result)).toMatchObject({ id, screenshot_path: null });
  });

  it("ignores a path that belongs to another thread id", async () => {
    const path = `${scenario.workspaceId}/${randomUUID()}.webp`;
    await storeImage(scenario.member, path);

    const withId = await call(
      scenario.member,
      args({ p_id: randomUUID(), p_screenshot_path: path }),
    );
    const withoutId = await call(scenario.member, args({ p_screenshot_path: path }));

    expect(unwrap(withId).screenshot_path).toBeNull();
    expect(unwrap(withoutId).screenshot_path).toBeNull();
  });

  it("ignores extensions other than webp and png and malformed paths", async () => {
    const jpg = `${scenario.workspaceId}/${randomUUID()}.jpg`;
    await storeImage(scenario.member, jpg, "image/jpeg");
    const jpgId = jpg.slice(jpg.indexOf("/") + 1, jpg.lastIndexOf("."));
    const id = randomUUID();
    const cases: [string, string][] = [
      [jpgId, jpg],
      [id, `${scenario.workspaceId}/${id}.WEBP`],
      [id, `${scenario.workspaceId.toUpperCase()}/${id}.webp`],
      [id, `${scenario.workspaceId}/${id}.webp.html`],
      [id, `${scenario.workspaceId}//${id}.webp`],
      [id, `${id}.webp`],
      [id, ""],
    ];
    for (const [p_id, p_screenshot_path] of cases) {
      const result = await call(scenario.member, args({ p_id, p_screenshot_path }));

      expect(unwrap(result).screenshot_path, p_screenshot_path).toBeNull();
      await scenario.admin.from("threads").delete().eq("id", p_id);
    }
  });

  it("generates the id and stores no path when neither is given", async () => {
    const created = unwrap(await call(scenario.member, args()));

    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(created.screenshot_path).toBeNull();
  });

  it("rejects a thread id that is already taken and leaves the original untouched", async () => {
    const first = unwrap(await call(scenario.member, args()));

    const duplicate = await call(scenario.owner, args({ p_id: first.id }));

    expectCode(duplicate, UNIQUE_VIOLATION);
    const stored = unwrap(
      await scenario.admin.from("threads").select("created_by").eq("id", first.id),
    );
    expect(stored).toEqual([{ created_by: scenario.member.id }]);
  });

  it("still denies an outsider that names an image of the workspace", async () => {
    const id = randomUUID();
    const path = `${scenario.workspaceId}/${id}.webp`;
    await adminImage(path);

    const result = await call(scenario.outsider, args({ p_id: id, p_screenshot_path: path }));

    expectRlsViolation(result);
    const stored = unwrap(await scenario.admin.from("threads").select("id").eq("id", id));
    expect(stored).toEqual([]);
  });
});
