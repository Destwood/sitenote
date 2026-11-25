import { success, failure, type RecordingDraftInput, type ThreadRecord } from "@sitenote/widget";
import { describe, expect, it, vi } from "vitest";

import { createCaptureStore } from "../capture-store";
import { createRecordingDraftStore, DRAFT_SCREENSHOT_MAX_BYTES } from "../recording-draft-store";
import type { RecordingFinished } from "../recording-service";
import { createRecordingDraftService, type RecordingDraftServiceDeps } from ".";

const USER = "00000000-0000-4000-8000-000000000002";
const SITE = "20000000-0000-4000-8000-000000000001";
const WORKSPACE = "10000000-0000-4000-8000-000000000001";
const ID = "30000000-0000-4000-8000-000000000001";
const CAPTURE = "60000000-0000-4000-8000-000000000001";
const PAGE = "https://example.test/pricing";
const INPUT: RecordingDraftInput = {
  draftId: ID,
  siteId: SITE,
  pageUrl: PAGE,
  anchor: {
    kind: "text",
    quote: { exact: "Hi", prefix: "", suffix: "" },
    position: { start: 0, end: 2 },
    container: "body",
  },
  context: {
    viewport: { width: 100, height: 100 },
    devicePixelRatio: 1,
    pageTitle: "Test",
    url: PAGE,
    browser: { name: "Chrome", version: "130" },
    os: { name: "Windows", version: "11" },
    userAgent: "ua",
    consoleErrors: [],
    capturedAt: "2026-11-16T10:00:00.000Z",
  },
  captureId: CAPTURE,
  body: "Hi",
  mentions: [USER],
  startsSignedOut: true,
};
const THREAD: ThreadRecord = {
  id: ID,
  siteId: SITE,
  pageUrl: PAGE,
  anchor: INPUT.anchor,
  context: null,
  status: "open",
  author: { id: USER, displayName: "Me", avatarUrl: null },
  createdAt: "2026-11-16T10:00:00.000Z",
  hasScreenshot: true,
  comments: [],
};
const FINISHED: RecordingFinished = {
  type: "recording.finished",
  tabId: 4,
  blobUrl: "blob:x",
  durationMs: 1000,
  size: 10,
  reason: "user",
};

function setup() {
  const values: Record<string, unknown> = {};
  const store = createRecordingDraftStore({
    get: () => Promise.resolve(structuredClone(values)),
    set: (items) => {
      Object.assign(values, structuredClone(items));
      return Promise.resolve();
    },
    remove: (keys) => {
      for (const key of [keys].flat()) {
        Reflect.deleteProperty(values, key);
      }
      return Promise.resolve();
    },
  });
  const captures = createCaptureStore({ newId: () => CAPTURE });
  captures.add({ blob: new Blob(["image"], { type: "image/png" }), width: 10, height: 20 });
  const deps = {
    store,
    captures,
    auth: {
      getState: vi.fn<RecordingDraftServiceDeps["auth"]["getState"]>().mockResolvedValue(
        success({
          status: "signedIn",
          user: { id: USER, displayName: "Me", email: null, isAnonymous: false },
        }),
      ),
    },
    data: {
      createThread: vi
        .fn<RecordingDraftServiceDeps["data"]["createThread"]>()
        .mockResolvedValue(success(THREAD)),
    },
    recordings: {
      start: vi
        .fn<RecordingDraftServiceDeps["recordings"]["start"]>()
        .mockResolvedValue(success({ state: "recording" })),
      discard: vi.fn(),
    },
    getTab: vi
      .fn<RecordingDraftServiceDeps["getTab"]>()
      .mockResolvedValue({ url: `${PAGE}?plan=1` }),
    getEnabledSite: vi
      .fn<RecordingDraftServiceDeps["getEnabledSite"]>()
      .mockResolvedValue({ siteId: SITE, workspaceId: WORKSPACE, captureErrors: true }),
    isRecording: vi.fn().mockResolvedValue(false),
    getMediaStreamId: vi.fn().mockResolvedValue("stream"),
    sendToTab: vi.fn().mockResolvedValue(success(null)),
  };
  return { deps, store, captures, service: createRecordingDraftService(deps) };
}

describe("recording draft service", () => {
  it("prepares an enabled tab without capturing or setting a recording state", async () => {
    const { service, deps, store } = setup();
    expect(await service.prepare(4)).toEqual(success(null));
    expect(deps.sendToTab).toHaveBeenCalledExactlyOnceWith(4, { type: "recording.commentFirst" });
    expect(deps.getMediaStreamId).not.toHaveBeenCalled();
    expect(deps.recordings.start).not.toHaveBeenCalled();
    expect(await store.load(4)).toBeNull();
  });

  it("requires an enabled tab and widget acknowledgment", async () => {
    const { service, deps } = setup();
    deps.getEnabledSite.mockResolvedValueOnce(null);
    expect(await service.prepare(4)).toEqual(failure("forbidden"));
    deps.sendToTab.mockResolvedValueOnce(failure("page_unavailable"));
    expect(await service.prepare(4)).toEqual(failure("page_unavailable"));
  });

  it("persists screenshot and identity before requesting the delayed stream", async () => {
    const { service, deps, store } = setup();
    deps.getMediaStreamId.mockImplementationOnce(async () => {
      expect(await store.load(4)).toMatchObject({
        userId: USER,
        workspaceId: WORKSPACE,
        startUrl: `${PAGE}?plan=1`,
        screenshot: { base64: btoa("image") },
      });
      return "stream";
    });
    expect(await service.submit(4, INPUT)).toEqual(success({ state: "recording", draftId: ID }));
    expect(deps.recordings.start).toHaveBeenCalledExactlyOnceWith({ tabId: 4, streamId: "stream" });
    expect(deps.data.createThread).not.toHaveBeenCalled();
  });

  it.each(["stream", "start"])("posts without video after a %s failure", async (phase) => {
    const { service, deps, store } = setup();
    if (phase === "stream") {
      deps.getMediaStreamId.mockRejectedValueOnce(new Error("permission"));
    } else {
      deps.recordings.start.mockResolvedValueOnce(failure("recording_busy"));
    }
    expect(await service.submit(4, INPUT)).toEqual(success({ state: "posted", thread: THREAD }));
    expect(deps.data.createThread).toHaveBeenCalledWith(
      expect.objectContaining({ attachRecording: false, body: INPUT.body, captureId: CAPTURE }),
      { tabId: 4 },
      expect.objectContaining({
        threadId: ID,
        expectedUserId: USER,
        expectedWorkspaceId: WORKSPACE,
      }),
    );
    expect(await store.load(4)).toBeNull();
  });

  it("surfaces quota failure without starting or posting", async () => {
    const { service, deps } = setup();
    vi.spyOn(deps.store, "save").mockRejectedValueOnce(new Error("quota"));
    expect(await service.submit(4, INPUT)).toEqual(failure("recording_failed"));
    expect(deps.getMediaStreamId).not.toHaveBeenCalled();
    expect(deps.data.createThread).not.toHaveBeenCalled();
  });

  it("rejects wrong site, origin, signed-out and failed sessions", async () => {
    const { service, deps } = setup();
    expect(await service.submit(4, { ...INPUT, siteId: USER })).toEqual(failure("forbidden"));
    expect(await service.submit(4, { ...INPUT, pageUrl: "https://other.test/" })).toEqual(
      failure("forbidden"),
    );
    deps.auth.getState.mockResolvedValueOnce(success({ status: "signedOut" }));
    expect(await service.submit(4, INPUT)).toEqual(failure("unauthorized"));
    deps.auth.getState.mockResolvedValueOnce(failure("state_failed"));
    expect(await service.submit(4, INPUT)).toEqual(failure("state_failed"));
    expect(deps.getMediaStreamId).not.toHaveBeenCalled();
  });

  it("blocks prepare, submit and legacy starts while a draft is active", async () => {
    const { service, deps, store } = setup();
    await service.submit(4, INPUT);
    const first = await store.load(4);
    expect(await service.prepare(5)).toEqual(failure("recording_busy"));
    expect(await service.submit(4, { ...INPUT, body: "overwrite" })).toEqual(
      failure("recording_busy"),
    );
    expect(await service.start({ tabId: 5, streamId: "other" })).toEqual(failure("recording_busy"));
    expect(await store.load(4)).toEqual(first);
    expect(deps.recordings.start).toHaveBeenCalledTimes(1);
  });

  it("blocks a concurrent operation and existing legacy recording", async () => {
    const { service, deps } = setup();
    const first = service.prepare(4);
    expect(await service.submit(5, INPUT)).toEqual(failure("recording_busy"));
    await first;
    deps.isRecording.mockResolvedValue(true);
    expect(await service.prepare(4)).toEqual(failure("recording_busy"));
    expect(await service.start({ tabId: 4, streamId: "x" })).toEqual(failure("recording_busy"));
  });

  it("delegates an idle legacy start unchanged", async () => {
    const { service, deps } = setup();
    expect(await service.start({ tabId: 4, streamId: "x" })).toEqual(
      success({ state: "recording" }),
    );
    expect(deps.recordings.start).toHaveBeenCalledExactlyOnceWith({ tabId: 4, streamId: "x" });
  });

  it("restores a screenshot after worker restart and posts on Stop with persisted startUrl", async () => {
    const { service, deps, captures, store } = setup();
    await service.submit(4, INPUT);
    captures.remove(CAPTURE);
    const fresh = createRecordingDraftService(deps);
    deps.data.createThread.mockImplementationOnce(async () => {
      expect(captures.get(CAPTURE)).toMatchObject({
        threadId: ID,
        width: 10,
        height: 20,
        uploaded: false,
      });
      expect(await captures.get(CAPTURE)?.blob.text()).toBe("image");
      return success(THREAD);
    });
    expect(await fresh.onFinished(FINISHED)).toBe(true);
    expect(deps.data.createThread).toHaveBeenCalledWith(
      expect.objectContaining({ attachRecording: true, startsSignedOut: true }),
      { tabId: 4 },
      {
        threadId: ID,
        expectedUserId: USER,
        expectedWorkspaceId: WORKSPACE,
        startUrl: `${PAGE}?plan=1`,
      },
    );
    expect(deps.sendToTab).toHaveBeenCalledWith(
      4,
      expect.objectContaining({ type: "recording.threadCreated", thread: THREAD }),
    );
    expect(await store.load(4)).toBeNull();
  });

  it.each([{ reason: "error" as const }, { size: 0 }])(
    "posts without video for an unusable recording %j",
    async (override) => {
      const { service, deps } = setup();
      await service.submit(4, INPUT);
      await service.onFinished({ ...FINISHED, ...override });
      expect(deps.data.createThread).toHaveBeenCalledWith(
        expect.objectContaining({ attachRecording: false }),
        expect.anything(),
        expect.anything(),
      );
      expect(deps.sendToTab).toHaveBeenCalledWith(
        4,
        expect.objectContaining({ withoutVideo: true }),
      );
    },
  );

  it("posts without screenshot when restoration fails", async () => {
    const { service, deps } = setup();
    await service.submit(4, INPUT);
    vi.spyOn(deps.captures, "restore").mockImplementationOnce(() => {
      throw new Error("restore");
    });
    await service.onFinished(FINISHED);
    expect(deps.data.createThread.mock.calls[0]?.[0]).not.toHaveProperty("captureId");
  });

  it("does not persist oversized screenshots", async () => {
    const { service, captures, store } = setup();
    captures.restore(CAPTURE, {
      blob: new Blob([new Uint8Array(DRAFT_SCREENSHOT_MAX_BYTES + 1)], { type: "image/png" }),
      width: 1,
      height: 1,
      at: Date.now(),
      threadId: null,
      uploaded: false,
    });
    await service.submit(4, INPUT);
    expect(await store.load(4)).not.toHaveProperty("screenshot");
  });

  it("does not start or post if the tab closes while waiting for the stream", async () => {
    const { service, deps, store } = setup();
    deps.getMediaStreamId.mockImplementationOnce(async () => {
      await service.onTabRemoved(4);
      return "stream";
    });
    expect(await service.submit(4, INPUT)).toEqual(failure("page_unavailable"));
    expect(deps.recordings.start).not.toHaveBeenCalled();
    expect(deps.data.createThread).not.toHaveBeenCalled();
    expect(await store.load(4)).toBeNull();
  });

  it("clears the draft when the fallback post also fails", async () => {
    const { service, deps, store } = setup();
    deps.getMediaStreamId.mockRejectedValueOnce(new Error("permission"));
    deps.data.createThread.mockResolvedValueOnce(failure("network"));
    expect(await service.submit(4, INPUT)).toEqual(failure("network"));
    expect(await store.load(4)).toBeNull();
  });

  it("does not report a failed post when delivery of a successful result fails", async () => {
    const { service, deps, store } = setup();
    await service.submit(4, INPUT);
    deps.sendToTab.mockRejectedValueOnce(new Error("gone"));
    await expect(service.onFinished(FINISHED)).rejects.toThrow("gone");
    expect(deps.sendToTab).toHaveBeenCalledTimes(1);
    expect(deps.sendToTab).toHaveBeenCalledWith(
      4,
      expect.objectContaining({ type: "recording.threadCreated" }),
    );
    expect(await store.load(4)).toBeNull();
  });

  it("clears the draft and reports final post errors", async () => {
    const { service, deps, store } = setup();
    await service.submit(4, INPUT);
    deps.data.createThread.mockResolvedValueOnce(failure("network"));
    await service.onFinished(FINISHED);
    expect(deps.sendToTab).toHaveBeenCalledWith(4, {
      type: "recording.threadFailed",
      draftId: ID,
      message: failure("network").error.message,
    });
    expect(await store.load(4)).toBeNull();
  });

  it("clears even when posting throws or the tab cannot receive a result", async () => {
    const { service, deps, store } = setup();
    await service.submit(4, INPUT);
    deps.data.createThread.mockRejectedValueOnce(new Error("post"));
    deps.sendToTab.mockRejectedValue(new Error("gone"));
    await expect(service.onFinished(FINISHED)).rejects.toThrow("gone");
    expect(await store.load(4)).toBeNull();
  });

  it("drops drafts on tab removal without posting", async () => {
    const { service, deps, store } = setup();
    await service.submit(4, INPUT);
    await service.onTabRemoved(4);
    expect(await service.onFinished(FINISHED)).toBe(true);
    expect(await store.load(4)).toBeNull();
    expect(deps.data.createThread).not.toHaveBeenCalled();
  });

  it("coalesces simultaneous Stop notifications and leaves legacy finishes alone", async () => {
    const { service, deps } = setup();
    expect(await service.onFinished(FINISHED)).toBe(false);
    await service.submit(4, INPUT);
    expect(await Promise.all([service.onFinished(FINISHED), service.onFinished(FINISHED)])).toEqual(
      [true, true],
    );
    expect(deps.data.createThread).toHaveBeenCalledTimes(1);
  });
});
