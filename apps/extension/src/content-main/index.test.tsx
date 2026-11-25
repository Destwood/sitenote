import { success } from "@sitenote/widget";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { beforeEach, expect, it, vi } from "vitest";

import { createToggleListener } from "../comment-mode";
import { startContentScript } from ".";

const mocks = vi.hoisted(() => ({
  begin: vi.fn(() => true),
  created: vi.fn(),
  failed: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  stop: vi.fn(),
}));

vi.mock("@sitenote/widget", async (original) => {
  const actual = await original<typeof import("@sitenote/widget")>();
  return {
    ...actual,
    createWidget: () => ({
      store: { subscribe: vi.fn(), getState: () => ({ status: "ready" }) },
      start: vi.fn().mockResolvedValue(undefined),
      stop: mocks.stop,
      beginRecordingComment: mocks.begin,
      recordingThreadCreated: mocks.created,
      recordingThreadFailed: mocks.failed,
    }),
  };
});
vi.mock("wxt/browser", () => ({
  browser: {
    runtime: {
      id: "extension",
      onMessage: { addListener: mocks.addListener, removeListener: mocks.removeListener },
    },
  },
}));
vi.mock("../comment-mode", () => ({
  createToggleListener: vi.fn(() => vi.fn()),
  restoreRecording: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../env", () => ({ getExtensionEnv: () => ({ webUrl: "https://app.test" }) }));
vi.mock("../extension-backend", () => ({ createExtensionBackend: vi.fn() }));
vi.mock("../recording-pill", () => ({
  createRecordingPill: () => ({ show: vi.fn(), hide: vi.fn() }),
}));
vi.mock("../step-recorder", () => ({
  createStepRecorder: () => ({ start: vi.fn(), stop: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.begin.mockReturnValue(true);
});

it("connects comment-first and final outcomes to the widget and removes its listener", async () => {
  let invalidate: () => void = () => undefined;
  const ctx = {
    onInvalidated: (callback: () => void) => {
      invalidate = callback;
    },
  } as unknown as ContentScriptContext;
  await startContentScript(ctx, "");
  const deps = vi.mocked(createToggleListener).mock.calls[0]?.[0];
  expect(deps?.recording.commentFirst?.()).toEqual(success(null));
  expect(mocks.begin).toHaveBeenCalledTimes(1);
  expect(deps?.recording.threadCreated).toBe(mocks.created);
  expect(deps?.recording.threadFailed).toBe(mocks.failed);
  mocks.begin.mockReturnValue(false);
  expect(deps?.recording.commentFirst?.()).toMatchObject({
    ok: false,
    error: { code: "page_unavailable" },
  });
  invalidate();
  expect(mocks.stop).toHaveBeenCalledTimes(1);
  expect(mocks.removeListener).toHaveBeenCalledWith(mocks.addListener.mock.calls[0]?.[0]);
});
