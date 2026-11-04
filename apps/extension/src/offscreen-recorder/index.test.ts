import { RECORDING_STEPS_MAX } from "@sitenote/core";
import { failure, success } from "@sitenote/widget";
import { describe, expect, it, vi } from "vitest";

import { createRecordingStore, RECORDING_TTL_MS } from "../recording-store";
import {
  CAPTURE_TIMESLICE_MS,
  HEARTBEAT_MS,
  VIDEO_BITS_PER_SECOND,
  createOffscreenRecorder,
  type OffscreenRecorderDeps,
  type RecorderLike,
} from ".";

const EXTENSION_ID = "anefihllkbkenhjbjggfndgemgkfaeoa";
const SENDER = { id: EXTENSION_ID };
const MAX_MS = 120_000;
const STOP_BYTES = 40_000_000;

interface RecorderInit {
  mimeType: string;
  videoBitsPerSecond: number;
}

class FakeTrack {
  readonly stop = vi.fn();
  private readonly endedListeners: (() => void)[] = [];

  addEventListener(_type: "ended", listener: () => void): void {
    this.endedListeners.push(listener);
  }

  end(): void {
    for (const listener of this.endedListeners) {
      listener();
    }
  }
}

class FakeStream {
  readonly tracks: FakeTrack[];

  constructor(tracks: FakeTrack[]) {
    this.tracks = tracks;
  }

  getTracks(): FakeTrack[] {
    return this.tracks;
  }

  getVideoTracks(): FakeTrack[] {
    return this.tracks;
  }
}

class FakeRecorder implements RecorderLike {
  state = "inactive";
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: ((event: Event) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  timeslice = 0;
  readonly stream: MediaStream;
  readonly options: RecorderInit;

  constructor(stream: MediaStream, options: RecorderInit) {
    this.stream = stream;
    this.options = options;
  }

  start(timeslice: number): void {
    this.timeslice = timeslice;
    this.state = "recording";
  }

  stop(): void {
    this.state = "inactive";
    this.onstop?.(new Event("stop"));
  }

  emit(size: number): void {
    this.ondataavailable?.({ data: new Blob([new Uint8Array(size)]) } as BlobEvent);
  }
}

function clock(start = 1_000) {
  let time = start;
  let nextId = 1;
  const timers = new Map<number, { at: number; callback: () => void }>();

  function firstDue(until: number): [number, { at: number; callback: () => void }] | undefined {
    return [...timers.entries()]
      .filter(([, timer]) => timer.at <= until)
      .sort(([, a], [, b]) => a.at - b.at)[0];
  }

  return {
    now: () => time,
    setTimeout: (callback: () => void, ms: number) => {
      const id = nextId;
      nextId += 1;
      timers.set(id, { at: time + ms, callback });
      return id;
    },
    clearTimeout: (id: number) => {
      timers.delete(id);
    },
    advance: (ms: number) => {
      const target = time + ms;
      let due = firstDue(target);
      while (due !== undefined) {
        const [id, timer] = due;
        timers.delete(id);
        time = timer.at;
        timer.callback();
        due = firstDue(target);
      }
      time = target;
    },
  };
}

function setup(options: { supported?: string[]; failStart?: boolean } = {}) {
  const time = clock();
  const supported = options.supported ?? ["video/webm;codecs=vp9"];
  const recorders: FakeRecorder[] = [];
  const streams: FakeStream[] = [];
  const constraints: MediaStreamConstraints[] = [];
  const blobs: Blob[] = [];
  const sent: unknown[] = [];

  class Recorder extends FakeRecorder {
    constructor(stream: MediaStream, init: RecorderInit) {
      super(stream, init);
      recorders.push(this);
    }

    override start(timeslice: number): void {
      if (options.failStart === true) {
        throw new Error("start failed");
      }
      super.start(timeslice);
    }
  }

  const getUserMedia = vi.fn((request: MediaStreamConstraints) => {
    constraints.push(request);
    const stream = new FakeStream([new FakeTrack()]);
    streams.push(stream);
    return Promise.resolve(stream as unknown as MediaStream);
  });
  const revokeObjectURL = vi.fn();
  const store = createRecordingStore({
    now: time.now,
    onExpire: (recording) => {
      revokeObjectURL(recording.blobUrl);
    },
  });
  const deps: OffscreenRecorderDeps = {
    extensionId: EXTENSION_ID,
    store,
    getUserMedia,
    MediaRecorder: Recorder,
    isTypeSupported: (mime) => supported.includes(mime),
    createObjectURL: (blob) => {
      blobs.push(blob);
      return `blob:${String(blobs.length - 1)}`;
    },
    revokeObjectURL,
    sendMessage: (message) => {
      sent.push(message);
      return Promise.resolve(undefined);
    },
    now: time.now,
    setTimeout: time.setTimeout,
    clearTimeout: time.clearTimeout,
  };
  const recorder = createOffscreenRecorder(deps);

  async function call(message: unknown, sender: { id?: string; tab?: unknown } = SENDER) {
    return await recorder.handle(message, sender);
  }

  function start(tabId = 4) {
    return call({
      type: "offscreen.start",
      tabId,
      streamId: "stream-1",
      maxMs: MAX_MS,
      stopBytes: STOP_BYTES,
    });
  }

  return {
    call,
    start,
    advance: time.advance,
    recorders,
    streams,
    constraints,
    blobs,
    sent,
    supported,
    getUserMedia,
    revokeObjectURL,
  };
}

function finishedMessages(sent: unknown[]) {
  return sent.filter(
    (message) =>
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      message.type === "recording.finished",
  );
}

describe("createOffscreenRecorder start", () => {
  it("captures the tab with the stream id and answers with the recording status", async () => {
    const { start, constraints, recorders } = setup();

    expect(await start()).toEqual(success({ state: "recording", startedAt: 1_000 }));

    expect(constraints[0]).toMatchObject({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: "stream-1",
          maxWidth: 1920,
          maxHeight: 1080,
          maxFrameRate: 15,
        },
      },
    });
    expect(recorders[0]?.options).toEqual({
      mimeType: "video/webm;codecs=vp9",
      videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
    });
    expect(recorders[0]?.timeslice).toBe(CAPTURE_TIMESLICE_MS);
  });

  it("refuses a second start while a recording is active, even for another tab", async () => {
    const { start, getUserMedia } = setup();
    await start(4);

    expect(await start(5)).toEqual(failure("recording_busy"));
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("falls back to the next supported mime type and tags the blob as webm", async () => {
    const { start, recorders, call, blobs } = setup({ supported: ["video/webm"] });
    await start();

    expect(recorders[0]?.options.mimeType).toBe("video/webm");
    recorders[0]?.emit(5);
    await call({ type: "offscreen.stop", discard: false });

    expect(blobs[0]?.type).toBe("video/webm");
  });

  it("refuses without a supported mime type and frees the slot", async () => {
    const { start, supported } = setup({ supported: [] });

    expect(await start()).toEqual(failure("recording_failed"));

    supported.push("video/webm");
    expect(await start()).toEqual(success({ state: "recording", startedAt: 1_000 }));
  });

  it("stops the timers and tracks when the recorder cannot start", async () => {
    const { start, advance, streams, sent } = setup({ failStart: true });

    expect(await start()).toEqual(failure("recording_failed"));
    expect(streams[0]?.tracks[0]?.stop).toHaveBeenCalled();

    advance(MAX_MS + HEARTBEAT_MS);
    expect(sent).toEqual([]);
  });

  it("reports a refused capture as a failure and frees the slot", async () => {
    const { start, getUserMedia } = setup();
    getUserMedia.mockRejectedValueOnce(new Error("denied"));

    expect(await start()).toEqual(failure("recording_failed"));
    expect(await start()).toEqual(success({ state: "recording", startedAt: 1_000 }));
  });

  it("ignores messages that do not parse or come from another sender", async () => {
    const { call, getUserMedia, sent } = setup();
    const start = {
      type: "offscreen.start",
      tabId: 4,
      streamId: "stream-1",
      maxMs: MAX_MS,
      stopBytes: STOP_BYTES,
    };

    expect(await call({ type: "offscreen.unknown" })).toBeNull();
    expect(await call({ type: "offscreen.query", tabId: -1 })).toBeNull();
    expect(await call({ type: "notifications.changed", unread: 2 })).toBeNull();
    expect(await call(start, { id: EXTENSION_ID, tab: {} })).toBeNull();
    expect(await call(start, { id: "pnmlpmcmdnkjhkdfmcnpbkalfmnkgnoj" })).toBeNull();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });
});

describe("createOffscreenRecorder stop reasons", () => {
  it("stops at the time limit and sends the finished recording", async () => {
    const { start, advance, recorders, streams, sent } = setup();
    await start();
    recorders[0]?.emit(10);

    advance(MAX_MS);

    expect(recorders[0]?.state).toBe("inactive");
    expect(streams[0]?.tracks[0]?.stop).toHaveBeenCalled();
    expect(finishedMessages(sent)).toEqual([
      {
        type: "recording.finished",
        tabId: 4,
        blobUrl: "blob:0",
        durationMs: MAX_MS,
        size: 10,
        reason: "time",
      },
    ]);
  });

  it("stops as soon as the chunks reach the byte limit", async () => {
    const { call, recorders, sent } = setup();
    await call({ type: "offscreen.start", tabId: 4, streamId: "s", maxMs: MAX_MS, stopBytes: 100 });

    recorders[0]?.emit(60);
    expect(recorders[0]?.state).toBe("recording");
    recorders[0]?.emit(60);

    expect(finishedMessages(sent)).toEqual([
      expect.objectContaining({ tabId: 4, size: 120, reason: "size" }),
    ]);
  });

  it("finishes with reason ended when the video track ends", async () => {
    const { start, streams, sent } = setup();
    await start();

    streams[0]?.tracks[0]?.end();

    expect(finishedMessages(sent)).toEqual([expect.objectContaining({ reason: "ended" })]);
  });

  it("finishes with reason error when the recorder fails", async () => {
    const { start, recorders, sent } = setup();
    await start();

    recorders[0]?.onerror?.(new ErrorEvent("error"));

    expect(finishedMessages(sent)).toEqual([expect.objectContaining({ reason: "error" })]);
  });

  it("stops on request with reason user and answers once the recording is stored", async () => {
    const { start, call, recorders, sent } = setup();
    await start();
    recorders[0]?.emit(4);

    expect(await call({ type: "offscreen.stop", discard: false })).toEqual(
      success({ state: "pending", durationMs: 0 }),
    );
    expect(finishedMessages(sent)).toEqual([expect.objectContaining({ reason: "user" })]);
  });
});

describe("createOffscreenRecorder discard and idle stop", () => {
  it("discards the recording without sending or storing anything", async () => {
    const { start, call, recorders, streams, sent, blobs } = setup();
    await start();
    recorders[0]?.emit(10);

    expect(await call({ type: "offscreen.stop", discard: true })).toEqual(
      success({ state: "idle" }),
    );

    expect(streams[0]?.tracks[0]?.stop).toHaveBeenCalled();
    expect(finishedMessages(sent)).toEqual([]);
    expect(blobs).toEqual([]);
    expect(await call({ type: "offscreen.query", tabId: 4 })).toEqual(success({ state: "idle" }));
  });

  it("answers an idle stop with success and sends nothing", async () => {
    const { call, sent } = setup();

    expect(await call({ type: "offscreen.stop", discard: false })).toEqual(
      success({ state: "idle" }),
    );
    expect(sent).toEqual([]);
  });
});

describe("createOffscreenRecorder pending recordings", () => {
  it("answers a query for the finished tab with its blob url and size", async () => {
    const { start, call, recorders } = setup();
    await start();
    recorders[0]?.emit(10);
    await call({ type: "offscreen.stop", discard: false });

    expect(await call({ type: "offscreen.query", tabId: 4 })).toEqual(
      success({ state: "pending", durationMs: 0, blobUrl: "blob:0", size: 10 }),
    );
    expect(await call({ type: "offscreen.query", tabId: 9 })).toEqual(success({ state: "idle" }));
  });

  it("answers a query for the active tab with the recording status", async () => {
    const { start, call } = setup();
    await start(4);

    expect(await call({ type: "offscreen.query", tabId: 4 })).toEqual(
      success({ state: "recording", startedAt: 1_000 }),
    );
  });

  it("releases the pending blob once and revokes its url", async () => {
    const { start, call, recorders, revokeObjectURL } = setup();
    await start();
    recorders[0]?.emit(10);
    await call({ type: "offscreen.stop", discard: false });

    expect(await call({ type: "offscreen.release" })).toEqual(success({ state: "idle" }));
    expect(await call({ type: "offscreen.release" })).toEqual(success({ state: "idle" }));

    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:0");
    expect(await call({ type: "offscreen.query", tabId: 4 })).toEqual(success({ state: "idle" }));
  });

  it("revokes the previous pending url when a newer recording replaces it", async () => {
    const { start, call, recorders, revokeObjectURL } = setup();
    await start();
    await call({ type: "offscreen.stop", discard: false });
    await start();
    await call({ type: "offscreen.stop", discard: false });

    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:0");
    expect(recorders).toHaveLength(2);
    expect(await call({ type: "offscreen.query", tabId: 4 })).toEqual(
      success({ state: "pending", durationMs: 0, blobUrl: "blob:1", size: 0 }),
    );
  });

  it("releases the pending recording after the ttl, but not a newer one", async () => {
    const { start, call, advance, revokeObjectURL } = setup();
    await start();
    await call({ type: "offscreen.stop", discard: false });
    advance(1_000);
    await start();
    await call({ type: "offscreen.stop", discard: false });

    advance(RECORDING_TTL_MS - 1_000);
    expect(revokeObjectURL.mock.calls).toEqual([["blob:0"]]);

    advance(1_000);
    expect(revokeObjectURL.mock.calls).toEqual([["blob:0"], ["blob:1"]]);
    expect(await call({ type: "offscreen.query", tabId: 4 })).toEqual(success({ state: "idle" }));
  });
});

describe("createOffscreenRecorder heartbeat", () => {
  it("beats every twenty seconds while recording and stops beating after the stop", async () => {
    const { start, call, advance, sent } = setup();
    const beats = () => sent.filter((message) => JSON.stringify(message).includes("heartbeat"));
    await start();

    advance(HEARTBEAT_MS * 2);
    expect(beats()).toEqual([{ type: "recording.heartbeat" }, { type: "recording.heartbeat" }]);

    await call({ type: "offscreen.stop", discard: true });
    advance(HEARTBEAT_MS * 2);
    expect(beats()).toHaveLength(2);
  });
});

describe("createOffscreenRecorder steps", () => {
  const CLICK = { t: 10, kind: "click" as const, selector: "#save", label: "Save" };

  it("keeps the steps of the recording tab and hands them over with the pending video", async () => {
    const { start, call } = setup();
    await start(4);

    expect(await call({ type: "offscreen.step", tabId: 4, step: CLICK })).toEqual(
      success({ state: "recording", startedAt: 1_000 }),
    );
    await call({ type: "offscreen.stop", discard: false });

    expect(await call({ type: "offscreen.query", tabId: 4 })).toEqual(
      success({ state: "pending", durationMs: 0, blobUrl: "blob:0", size: 0, steps: [CLICK] }),
    );
  });

  it("ignores steps for another tab and while nothing records", async () => {
    const { start, call } = setup();
    await call({ type: "offscreen.step", tabId: 4, step: CLICK });
    await start(4);
    await call({ type: "offscreen.step", tabId: 5, step: CLICK });
    await call({ type: "offscreen.stop", discard: false });

    expect(await call({ type: "offscreen.query", tabId: 4 })).toEqual(
      success({ state: "pending", durationMs: 0, blobUrl: "blob:0", size: 0 }),
    );
  });

  it("drops an exact repeat of the previous step and keeps the order", async () => {
    const { start, call } = setup();
    await start(4);
    const cancel = { t: 20, kind: "click" as const, selector: "#cancel", label: "Cancel" };
    for (const step of [CLICK, { ...CLICK, t: 11 }, cancel, CLICK]) {
      await call({ type: "offscreen.step", tabId: 4, step });
    }
    await call({ type: "offscreen.stop", discard: false });

    expect(await call({ type: "offscreen.query", tabId: 4 })).toEqual(
      success({
        state: "pending",
        durationMs: 0,
        blobUrl: "blob:0",
        size: 0,
        steps: [CLICK, cancel, CLICK],
      }),
    );
  });

  it("cleans the labels it keeps and stops at the step limit", async () => {
    const { start, call } = setup();
    await start(4);
    await call({
      type: "offscreen.step",
      tabId: 4,
      step: { t: 1, kind: "click", selector: "#a", label: "  Save \n it  " },
    });
    for (let index = 0; index < RECORDING_STEPS_MAX + 5; index += 1) {
      await call({
        type: "offscreen.step",
        tabId: 4,
        step: { t: index + 2, kind: "click", selector: "#a", label: `s${String(index)}` },
      });
    }
    await call({ type: "offscreen.stop", discard: false });

    const status = await call({ type: "offscreen.query", tabId: 4 });
    expect(status?.ok === true && status.data.steps).toHaveLength(RECORDING_STEPS_MAX);
    expect(status?.ok === true && status.data.steps?.[0]).toEqual({
      t: 1,
      kind: "click",
      selector: "#a",
      label: "Save it",
    });
  });

  it("ignores a step that does not parse", async () => {
    const { start, call } = setup();
    await start(4);

    expect(await call({ type: "offscreen.step", tabId: 4, step: { ...CLICK, t: -1 } })).toBeNull();
    await call({ type: "offscreen.stop", discard: false });

    expect(await call({ type: "offscreen.query", tabId: 4 })).toEqual(
      success({ state: "pending", durationMs: 0, blobUrl: "blob:0", size: 0 }),
    );
  });
});
