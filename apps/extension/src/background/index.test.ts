import { success } from "@sitenote/widget";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMessageRouter } from "../message-router";
import { createRecordingDraftService } from "../recording-draft-service";
import { createRecordingService } from "../recording-service";
import { startBackground } from ".";

const mocks = vi.hoisted(() => {
  const event = () => ({ addListener: vi.fn() });
  const area = () => ({
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    setAccessLevel: vi.fn().mockResolvedValue(undefined),
  });
  return {
    browser: {
      storage: { local: area(), session: area(), onChanged: event() },
      runtime: {
        id: "extension",
        onMessage: event(),
        onMessageExternal: event(),
        onConnect: event(),
        onStartup: event(),
        onInstalled: event(),
        getManifest: () => ({ version: "1" }),
        sendMessage: vi.fn(),
      },
      tabs: {
        get: vi.fn().mockResolvedValue({ url: "https://example.test" }),
        sendMessage: vi.fn().mockResolvedValue({ ok: true, data: null }),
        onRemoved: { addListener: vi.fn<(callback: (tabId: number) => void) => void>() },
      },
      tabCapture: { getMediaStreamId: vi.fn().mockResolvedValue("stream") },
      offscreen: { hasDocument: vi.fn().mockResolvedValue(false) },
      action: {},
      identity: {},
      scripting: {},
      permissions: { onRemoved: event(), onAdded: event() },
      commands: { onCommand: event() },
      contextMenus: { onClicked: event() },
      alarms: { onAlarm: event() },
    },
    removed: vi.fn().mockResolvedValue(undefined),
    finished: vi.fn().mockResolvedValue(true),
    recordingRemoved: vi.fn(),
  };
});

vi.mock("wxt/browser", () => ({ browser: mocks.browser }));
vi.mock("@sitenote/db", () => ({
  createSitenoteClient: () => ({ auth: { onAuthStateChange: vi.fn() } }),
}));
vi.mock("../env", () => ({
  getExtensionEnv: () => ({
    supabaseUrl: "https://db.test",
    supabasePublishableKey: "key",
    webUrl: "https://app.test",
    googleAuthEnabled: false,
  }),
}));
vi.mock("../message-router", () => ({ createMessageRouter: vi.fn(() => vi.fn()) }));
vi.mock("../recording-draft-service", () => ({
  createRecordingDraftService: vi.fn(() => ({
    onFinished: mocks.finished,
    onTabRemoved: mocks.removed,
  })),
}));
vi.mock("../recording-service", async (original) => {
  const actual = await original<typeof import("../recording-service")>();
  return {
    ...actual,
    createRecordingService: vi.fn(() => ({
      ...actual.createNoopRecordingService(),
      onTabRemoved: mocks.recordingRemoved,
    })),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.browser.offscreen.hasDocument.mockResolvedValue(false);
});

describe("background recording draft wiring", () => {
  it("connects session storage, guarded routing and the recording finish hook", async () => {
    startBackground();
    const deps = vi.mocked(createRecordingDraftService).mock.calls[0]?.[0];
    expect(deps).toBeDefined();
    expect(vi.mocked(createMessageRouter).mock.calls[0]?.[0].recordingDrafts).toBe(
      vi.mocked(createRecordingDraftService).mock.results[0]?.value,
    );
    await deps?.store.hasAny();
    expect(mocks.browser.storage.session.get).toHaveBeenCalledWith(null);
    await deps?.sendToTab(4, { type: "recording.commentFirst" });
    expect(mocks.browser.tabs.sendMessage).toHaveBeenCalledExactlyOnceWith(
      4,
      { type: "recording.commentFirst" },
      { frameId: 0 },
    );
    expect(await deps?.getMediaStreamId(4)).toBe("stream");
    expect(mocks.browser.tabCapture.getMediaStreamId).toHaveBeenCalledExactlyOnceWith({
      targetTabId: 4,
    });
    const finished = {
      type: "recording.finished" as const,
      tabId: 4,
      blobUrl: "blob:x",
      durationMs: 1,
      size: 1,
      reason: "user" as const,
    };
    expect(
      await vi.mocked(createRecordingService).mock.calls[0]?.[0].onDraftFinished?.(finished),
    ).toBe(true);
    expect(mocks.finished).toHaveBeenCalledExactlyOnceWith(finished);
    mocks.browser.tabs.onRemoved.addListener.mock.calls[0]?.[0](4);
    expect(mocks.removed).toHaveBeenCalledExactlyOnceWith(4);
    expect(mocks.recordingRemoved).toHaveBeenCalledExactlyOnceWith(4);
  });

  it("checks the global recorder and preserves legacy pending behavior", async () => {
    startBackground();
    const deps = vi.mocked(createRecordingDraftService).mock.calls[0]?.[0];
    expect(await deps?.isRecording()).toBe(false);
    mocks.browser.offscreen.hasDocument.mockResolvedValue(true);
    mocks.browser.runtime.sendMessage.mockResolvedValueOnce(success({ state: "pending" }));
    expect(await deps?.isRecording()).toBe(false);
    mocks.browser.runtime.sendMessage.mockResolvedValueOnce(success({ state: "recording" }));
    expect(await deps?.isRecording()).toBe(true);
    mocks.browser.runtime.sendMessage.mockResolvedValueOnce({
      ok: false,
      error: { message: "offscreen" },
    });
    await expect(deps?.isRecording()).rejects.toThrow("offscreen");
  });
});
