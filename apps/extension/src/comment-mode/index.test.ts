import { describe, expect, it, vi } from "vitest";

import { failure, success, type MessageResult, type PageThreadSummary } from "@sitenote/widget";
import {
  createToggleListener,
  restoreRecording,
  type RecordingControls,
  type StepControls,
} from ".";
import type {
  CommentModeState,
  CommentOnElementState,
  PageOpenSidebarState,
  PageOpenThreadState,
} from "../messages";

const EXTENSION_ID = "anefihllkbkenhjbjggfndgemgkfaeoa";
const TOGGLE = { type: "commentMode.toggle" };
const COMMENT_ON_ELEMENT = { type: "commentMode.commentOnElement" };
const LIST_THREADS = { type: "page.listThreads" };
const OPEN_THREAD = { type: "page.openThread", threadId: "30000000-0000-4000-8000-000000000001" };
const OPEN_SIDEBAR = { type: "page.openSidebar" };
const RECORDING_STARTED = {
  type: "recording.state",
  recording: true,
  startedAt: 1_700_000_000_000,
};
const RECORDING_STOPPED = { type: "recording.state", recording: false };
const RECORDING_READY = { type: "recording.ready", durationMs: 42_000 };

function recordingControls(): RecordingControls {
  return { show: vi.fn(), hide: vi.fn(), attach: vi.fn(() => success(null)) };
}

function stepControls(): StepControls {
  return { start: vi.fn(), stop: vi.fn() };
}

function listenerWith(
  toggle: () => MessageResult<CommentModeState> = () => success({ active: true }),
  commentOnElement: () => MessageResult<CommentOnElementState> = () => success({ started: true }),
  listThreads: () => MessageResult<PageThreadSummary[]> = () => success([]),
  openThread: (threadId: string) => MessageResult<PageOpenThreadState> = () =>
    success({ opened: true }),
  openSidebar: () => MessageResult<PageOpenSidebarState> = () => success({ opened: true }),
  recording: RecordingControls = recordingControls(),
  steps: StepControls = stepControls(),
) {
  return createToggleListener({
    extensionId: EXTENSION_ID,
    toggle,
    commentOnElement,
    listThreads,
    openThread,
    openSidebar,
    recording,
    steps,
  });
}

describe("createToggleListener", () => {
  it("answers a toggle from the extension with the new state", () => {
    const toggle = vi.fn(() => success({ active: true }));
    const respond = vi.fn();

    listenerWith(toggle)(TOGGLE, { id: EXTENSION_ID }, respond);

    expect(toggle).toHaveBeenCalledTimes(1);
    expect(respond).toHaveBeenCalledExactlyOnceWith(success({ active: true }));
  });

  it("passes a failure through", () => {
    const respond = vi.fn();

    listenerWith(vi.fn(() => failure("unauthorized")))(TOGGLE, { id: EXTENSION_ID }, respond);

    expect(respond).toHaveBeenCalledExactlyOnceWith(failure("unauthorized"));
  });

  it("answers a comment on element request from the extension with its result", () => {
    const commentOnElement = vi.fn(() => success({ started: true }));
    const toggle = vi.fn(() => success({ active: true }));
    const respond = vi.fn();

    listenerWith(toggle, commentOnElement)(COMMENT_ON_ELEMENT, { id: EXTENSION_ID }, respond);

    expect(commentOnElement).toHaveBeenCalledTimes(1);
    expect(toggle).not.toHaveBeenCalled();
    expect(respond).toHaveBeenCalledExactlyOnceWith(success({ started: true }));
  });

  it("passes a comment on element failure through", () => {
    const respond = vi.fn();

    listenerWith(
      undefined,
      vi.fn(() => failure("page_unavailable")),
    )(COMMENT_ON_ELEMENT, { id: EXTENSION_ID }, respond);

    expect(respond).toHaveBeenCalledExactlyOnceWith(failure("page_unavailable"));
  });

  it("answers a list threads request from the popup with the page's threads", () => {
    const threads: PageThreadSummary[] = [
      {
        id: "30000000-0000-4000-8000-000000000001",
        number: 1,
        status: "open",
        excerpt: "Hello",
        authorName: "Max",
        replies: 0,
        detached: false,
      },
    ];
    const listThreads = vi.fn(() => success(threads));
    const respond = vi.fn();

    listenerWith(undefined, undefined, listThreads)(LIST_THREADS, { id: EXTENSION_ID }, respond);

    expect(listThreads).toHaveBeenCalledTimes(1);
    expect(respond).toHaveBeenCalledExactlyOnceWith(success(threads));
  });

  it("answers an open thread request with the thread id and the result", () => {
    const openThread = vi.fn(() => success({ opened: false }));
    const respond = vi.fn();

    listenerWith(
      undefined,
      undefined,
      undefined,
      openThread,
    )(OPEN_THREAD, { id: EXTENSION_ID }, respond);

    expect(openThread).toHaveBeenCalledExactlyOnceWith(OPEN_THREAD.threadId);
    expect(respond).toHaveBeenCalledExactlyOnceWith(success({ opened: false }));
  });

  it("answers an open sidebar request from the popup with its result", () => {
    const openSidebar = vi.fn(() => success({ opened: true }));
    const toggle = vi.fn(() => success({ active: true }));
    const respond = vi.fn();

    listenerWith(
      toggle,
      undefined,
      undefined,
      undefined,
      openSidebar,
    )(OPEN_SIDEBAR, { id: EXTENSION_ID }, respond);

    expect(openSidebar).toHaveBeenCalledTimes(1);
    expect(toggle).not.toHaveBeenCalled();
    expect(respond).toHaveBeenCalledExactlyOnceWith(success({ opened: true }));
  });

  it("shows the recording pill from the extension and hides it when the recording stops", () => {
    const recording = recordingControls();
    const respond = vi.fn();
    const listener = listenerWith(undefined, undefined, undefined, undefined, undefined, recording);

    listener(RECORDING_STARTED, { id: EXTENSION_ID }, respond);
    listener(RECORDING_STOPPED, { id: EXTENSION_ID }, respond);

    expect(recording.show).toHaveBeenCalledExactlyOnceWith(1_700_000_000_000);
    expect(recording.hide).toHaveBeenCalledTimes(1);
    expect(respond).not.toHaveBeenCalled();
  });

  it("starts the step collector with the recording and stops it when the recording stops", () => {
    const steps = stepControls();
    const listener = listenerWith(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      recordingControls(),
      steps,
    );

    listener(RECORDING_STARTED, { id: EXTENSION_ID }, vi.fn());
    listener(RECORDING_STOPPED, { id: EXTENSION_ID }, vi.fn());

    expect(steps.start).toHaveBeenCalledExactlyOnceWith(1_700_000_000_000, {
      announceNavigation: false,
    });
    expect(steps.stop).toHaveBeenCalledTimes(1);
  });

  it("hides the pill when a recording state has no start time", () => {
    const recording = recordingControls();
    const steps = stepControls();

    listenerWith(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      recording,
      steps,
    )({ type: "recording.state", recording: true }, { id: EXTENSION_ID }, vi.fn());

    expect(recording.show).not.toHaveBeenCalled();
    expect(recording.hide).toHaveBeenCalledTimes(1);
    expect(steps.start).not.toHaveBeenCalled();
    expect(steps.stop).toHaveBeenCalledTimes(1);
  });

  it("attaches a finished video to the page and answers with the result", () => {
    const recording = recordingControls();
    const respond = vi.fn();

    listenerWith(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      recording,
    )(RECORDING_READY, { id: EXTENSION_ID }, respond);

    expect(recording.attach).toHaveBeenCalledTimes(1);
    expect(respond).toHaveBeenCalledExactlyOnceWith(success(null));
  });

  it("passes a failed attach through", () => {
    const respond = vi.fn();
    const recording = { ...recordingControls(), attach: vi.fn(() => failure("page_unavailable")) };

    listenerWith(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      recording,
    )(RECORDING_READY, { id: EXTENSION_ID }, respond);

    expect(respond).toHaveBeenCalledExactlyOnceWith(failure("page_unavailable"));
  });

  it.each([
    ["another extension", { id: "other" }],
    ["no sender id", {}],
    ["a content script or page tab", { id: EXTENSION_ID, tab: { id: 1 } }],
  ])("ignores a toggle from %s", (_name, sender) => {
    const toggle = vi.fn(() => success({ active: true }));
    const commentOnElement = vi.fn(() => success({ started: true }));
    const openSidebar = vi.fn(() => success({ opened: true }));
    const recording = recordingControls();
    const steps = stepControls();
    const respond = vi.fn();
    const listener = listenerWith(
      toggle,
      commentOnElement,
      undefined,
      undefined,
      openSidebar,
      recording,
      steps,
    );

    listener(TOGGLE, sender, respond);
    listener(COMMENT_ON_ELEMENT, sender, respond);
    listener(OPEN_SIDEBAR, sender, respond);
    listener(RECORDING_STARTED, sender, respond);
    listener(RECORDING_READY, sender, respond);

    expect(toggle).not.toHaveBeenCalled();
    expect(commentOnElement).not.toHaveBeenCalled();
    expect(openSidebar).not.toHaveBeenCalled();
    expect(recording.show).not.toHaveBeenCalled();
    expect(recording.attach).not.toHaveBeenCalled();
    expect(steps.start).not.toHaveBeenCalled();
    expect(steps.stop).not.toHaveBeenCalled();
    expect(respond).not.toHaveBeenCalled();
  });

  it.each([
    ["another message", { type: "auth.stateChanged" }],
    ["a string", "commentMode.toggle"],
    ["undefined", undefined],
  ])("ignores %s", (_name, message) => {
    const toggle = vi.fn(() => success({ active: true }));
    const commentOnElement = vi.fn(() => success({ started: true }));
    const openSidebar = vi.fn(() => success({ opened: true }));
    const recording = recordingControls();
    const respond = vi.fn();

    listenerWith(
      toggle,
      commentOnElement,
      undefined,
      undefined,
      openSidebar,
      recording,
    )(message, { id: EXTENSION_ID }, respond);

    expect(toggle).not.toHaveBeenCalled();
    expect(commentOnElement).not.toHaveBeenCalled();
    expect(openSidebar).not.toHaveBeenCalled();
    expect(recording.show).not.toHaveBeenCalled();
    expect(recording.attach).not.toHaveBeenCalled();
    expect(respond).not.toHaveBeenCalled();
  });
});

describe("restoreRecording", () => {
  const NOW = 1_700_000_500_000;

  function restoreDeps() {
    return { show: vi.fn(), startSteps: vi.fn(), now: vi.fn(() => NOW) };
  }

  it("shows the pill and starts the steps when the page loads during a recording", async () => {
    const deps = restoreDeps();

    await restoreRecording(
      () => Promise.resolve(success({ state: "recording", startedAt: 1_700_000_000_000 })),
      deps,
    );

    expect(deps.show).toHaveBeenCalledExactlyOnceWith(1_700_000_000_000);
    expect(deps.startSteps).toHaveBeenCalledExactlyOnceWith(1_700_000_000_000, {
      announceNavigation: true,
    });
  });

  it("uses the current time when the recording has no start time", async () => {
    const deps = restoreDeps();

    await restoreRecording(() => Promise.resolve(success({ state: "recording" })), deps);

    expect(deps.show).toHaveBeenCalledExactlyOnceWith(NOW);
    expect(deps.startSteps).toHaveBeenCalledExactlyOnceWith(NOW, { announceNavigation: true });
  });

  it.each([
    ["idle", () => Promise.resolve(success({ state: "idle" as const }))],
    ["pending", () => Promise.resolve(success({ state: "pending" as const, durationMs: 10 }))],
    ["failed", () => Promise.resolve(failure("unavailable"))],
  ])(
    "does not show the pill or start the steps when the state is %s",
    async (_name, readStatus) => {
      const deps = restoreDeps();

      await restoreRecording(readStatus, deps);

      expect(deps.show).not.toHaveBeenCalled();
      expect(deps.startSteps).not.toHaveBeenCalled();
    },
  );
});
