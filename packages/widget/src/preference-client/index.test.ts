import { describe, expect, it, vi } from "vitest";

import type { WidgetBackend } from "../backend";
import { failure, success, type MessageResult } from "../result";
import { createPreferenceClient } from ".";

const SITE_ID = "20000000-0000-4000-8000-000000000001";

function setup(result: MessageResult<unknown>) {
  const getPreference = vi.fn<WidgetBackend["getPreference"]>(() =>
    Promise.resolve(result as MessageResult<{ showResolved: boolean }>),
  );
  const setPreference = vi.fn<WidgetBackend["setPreference"]>(() =>
    Promise.resolve(result as MessageResult<null>),
  );
  return {
    getPreference,
    setPreference,
    client: createPreferenceClient({ getPreference, setPreference }),
  };
}

describe("createPreferenceClient", () => {
  it("loads the stored choice through the backend", async () => {
    const shown = setup(success({ showResolved: true }));
    const hidden = setup(success({ showResolved: false }));

    expect(await shown.client.load(SITE_ID)).toBe(true);
    expect(await hidden.client.load(SITE_ID)).toBe(false);
    expect(shown.getPreference).toHaveBeenCalledWith(SITE_ID);
  });

  it("falls back to hidden when the backend cannot answer", async () => {
    expect(await setup(failure("unavailable")).client.load(SITE_ID)).toBe(false);
  });

  it("saves the choice through the backend", async () => {
    const { client, setPreference } = setup(success(null));

    await client.save(SITE_ID, true);

    expect(setPreference).toHaveBeenCalledWith(SITE_ID, true);
  });

  it("rejects with the fixed message when saving fails", async () => {
    const { client } = setup(failure("forbidden"));

    await expect(client.save(SITE_ID, false)).rejects.toThrow(
      "You do not have permission to do this.",
    );
  });
});
