import { describe, expect, it, vi } from "vitest";

import { failure, success, type MessageResult } from "@sitenote/widget";
import type { PageSessionDeps } from "../page-session";
import { createPreferenceClient } from ".";

const SITE_ID = "20000000-0000-4000-8000-000000000001";

function setup(result: MessageResult<unknown>) {
  const send = vi.fn(() => Promise.resolve(result));
  return { send, client: createPreferenceClient(send as unknown as PageSessionDeps["send"]) };
}

describe("createPreferenceClient", () => {
  it("loads the stored choice through the background", async () => {
    const shown = setup(success({ showResolved: true }));
    const hidden = setup(success({ showResolved: false }));

    expect(await shown.client.load(SITE_ID)).toBe(true);
    expect(await hidden.client.load(SITE_ID)).toBe(false);
    expect(shown.send).toHaveBeenCalledWith({ type: "preferences.get", siteId: SITE_ID });
  });

  it("falls back to hidden when the background cannot answer", async () => {
    expect(await setup(failure("unavailable")).client.load(SITE_ID)).toBe(false);
  });

  it("saves the choice through the background", async () => {
    const { client, send } = setup(success(null));

    await client.save(SITE_ID, true);

    expect(send).toHaveBeenCalledWith({
      type: "preferences.set",
      siteId: SITE_ID,
      showResolved: true,
    });
  });

  it("rejects with the fixed message when saving fails", async () => {
    const { client } = setup(failure("forbidden"));

    await expect(client.save(SITE_ID, false)).rejects.toThrow(
      "You do not have permission to do this.",
    );
  });
});
