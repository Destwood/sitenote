import { browser } from "wxt/browser";

import { RECORDING_STEPS_MAX, sanitizeStep, type RecordingStep } from "@sitenote/core";
import { failure, success, type MessageResult } from "@sitenote/widget";

import {
  offscreenCommandSchema,
  type DataRequest,
  type OffscreenCommand,
  type OffscreenResponse,
  type OffscreenStatus,
} from "../messages";
import {
  RECORDING_TTL_MS,
  createRecordingStore,
  pickMimeType,
  type RecordingStore,
} from "../recording-store";

export const CAPTURE_TIMESLICE_MS = 1_000;
export const HEARTBEAT_MS = 20_000;
export const VIDEO_BITS_PER_SECOND = 1_500_000;
export const RECORDING_MAX_WIDTH = 1920;
export const RECORDING_MAX_HEIGHT = 1080;
export const RECORDING_MAX_FRAME_RATE = 15;

type FinishedMessage = Extract<DataRequest, { type: "recording.finished" }>;
type StopReason = FinishedMessage["reason"];
type StartCommand = Extract<OffscreenCommand, { type: "offscreen.start" }>;
type TimerId = number;

export interface RecorderLike {
  readonly state: string;
  ondataavailable: ((event: BlobEvent) => void) | null;
  onstop: ((event: Event) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  start: (timeslice: number) => void;
  stop: () => void;
}

export type RecorderConstructor = new (
  stream: MediaStream,
  options: { mimeType: string; videoBitsPerSecond: number },
) => RecorderLike;

export interface OffscreenRecorderDeps {
  extensionId: string;
  store: RecordingStore;
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  MediaRecorder: RecorderConstructor;
  isTypeSupported: (mimeType: string) => boolean;
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  sendMessage: (message: unknown) => Promise<unknown>;
  now: () => number;
  setTimeout: (callback: () => void, ms: number) => TimerId;
  clearTimeout: (id: TimerId) => void;
}

export interface OffscreenSender {
  id?: string | undefined;
  tab?: unknown;
}

export interface OffscreenRecorder {
  handle: (message: unknown, sender: OffscreenSender) => Promise<OffscreenResponse> | null;
}

interface Session {
  tabId: number;
  startedAt: number;
  recorder: RecorderLike;
  stream: MediaStream;
  chunks: Blob[];
  bytes: number;
  steps: RecordingStep[];
  stopping: boolean;
  discard: boolean;
  reason: StopReason;
  maxTimer: TimerId;
  heartbeatTimer: TimerId;
  settle: () => void;
  done: Promise<void>;
}

function appendStep(steps: RecordingStep[], step: RecordingStep): void {
  const sanitized = sanitizeStep(step);
  const last = steps.at(-1);
  if (steps.length >= RECORDING_STEPS_MAX) {
    return;
  }
  if (sanitized.kind === "navigate" && last?.kind === "navigate" && last.url === sanitized.url) {
    return;
  }
  steps.push(sanitized);
}

function captureConstraints(streamId: string): MediaStreamConstraints {
  return {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId,
        maxWidth: RECORDING_MAX_WIDTH,
        maxHeight: RECORDING_MAX_HEIGHT,
        maxFrameRate: RECORDING_MAX_FRAME_RATE,
      },
    },
  } as unknown as MediaStreamConstraints;
}

export function createOffscreenRecorder(deps: OffscreenRecorderDeps): OffscreenRecorder {
  const { store } = deps;
  let session: Session | null = null;

  function send(message: unknown): void {
    deps.sendMessage(message).catch(() => undefined);
  }

  function documentStatus(): OffscreenStatus {
    const { active, pending } = store.snapshot();
    if (active !== null) {
      return { state: "recording", startedAt: active.startedAt };
    }
    if (pending !== null) {
      return { state: "pending", durationMs: pending.durationMs };
    }
    return { state: "idle" };
  }

  function tabStatus(tabId: number): OffscreenStatus {
    const status = store.query(tabId);
    const { pending } = store.snapshot();
    return status.state === "pending" && pending !== null
      ? {
          ...status,
          blobUrl: pending.blobUrl,
          size: pending.size,
          ...(pending.steps.length === 0 ? {} : { steps: pending.steps }),
        }
      : status;
  }

  function addStep(tabId: number, step: RecordingStep): void {
    const current = session;
    if (current?.tabId !== tabId || current.stopping) {
      return;
    }
    appendStep(current.steps, step);
  }

  function releasePending(): void {
    const dropped = store.release();
    if (dropped !== null) {
      deps.revokeObjectURL(dropped.blobUrl);
    }
  }

  function expirePending(blobUrl: string): void {
    if (store.snapshot().pending?.blobUrl === blobUrl) {
      releasePending();
    }
  }

  function beat(current: Session): void {
    current.heartbeatTimer = deps.setTimeout(() => {
      send({ type: "recording.heartbeat" });
      beat(current);
    }, HEARTBEAT_MS);
  }

  function finish(current: Session): void {
    if (session !== current) {
      return;
    }
    session = null;
    for (const track of current.stream.getTracks()) {
      track.stop();
    }
    if (current.discard) {
      store.cancel();
    } else {
      const blob = new Blob(current.chunks, { type: "video/webm" });
      const durationMs = deps.now() - current.startedAt;
      const blobUrl = deps.createObjectURL(blob);
      const replaced = store.finish({
        tabId: current.tabId,
        blob,
        blobUrl,
        durationMs,
        size: blob.size,
        steps: current.steps,
      });
      if (replaced !== null) {
        deps.revokeObjectURL(replaced.blobUrl);
      }
      deps.setTimeout(() => {
        expirePending(blobUrl);
      }, RECORDING_TTL_MS);
      send({
        type: "recording.finished",
        tabId: current.tabId,
        blobUrl,
        durationMs,
        size: blob.size,
        reason: current.reason,
      });
    }
    current.settle();
  }

  function halt(reason: StopReason, discard: boolean): void {
    const current = session;
    if (current === null || current.stopping) {
      return;
    }
    current.stopping = true;
    current.reason = reason;
    current.discard = discard;
    deps.clearTimeout(current.maxTimer);
    deps.clearTimeout(current.heartbeatTimer);
    if (current.recorder.state === "inactive") {
      finish(current);
      return;
    }
    try {
      current.recorder.stop();
    } catch {
      finish(current);
    }
  }

  function attach(current: Session, command: StartCommand): void {
    current.recorder.ondataavailable = (event) => {
      current.chunks.push(event.data);
      current.bytes += event.data.size;
      if (current.bytes >= command.stopBytes) {
        halt("size", false);
      }
    };
    current.recorder.onstop = () => {
      finish(current);
    };
    current.recorder.onerror = () => {
      halt("error", false);
    };
    for (const track of current.stream.getVideoTracks()) {
      track.addEventListener("ended", () => {
        halt("ended", false);
      });
    }
    current.maxTimer = deps.setTimeout(() => {
      halt("time", false);
    }, command.maxMs);
    beat(current);
  }

  async function start(command: StartCommand): Promise<OffscreenResponse> {
    if (!store.begin(command.tabId)) {
      return failure("recording_busy");
    }
    const mimeType = pickMimeType((candidate) => deps.isTypeSupported(candidate));
    if (mimeType === null) {
      store.cancel();
      return failure("recording_failed");
    }
    let stream: MediaStream | null = null;
    let current: Session | null = null;
    try {
      stream = await deps.getUserMedia(captureConstraints(command.streamId));
      const recorder = new deps.MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
      });
      let settle: () => void = () => undefined;
      const done = new Promise<void>((resolve) => {
        settle = resolve;
      });
      current = {
        tabId: command.tabId,
        startedAt: deps.now(),
        recorder,
        stream,
        chunks: [],
        bytes: 0,
        steps: [],
        stopping: false,
        discard: false,
        reason: "user",
        maxTimer: 0,
        heartbeatTimer: 0,
        settle,
        done,
      };
      attach(current, command);
      recorder.start(CAPTURE_TIMESLICE_MS);
      session = current;
      return success(tabStatus(command.tabId));
    } catch {
      if (current !== null) {
        deps.clearTimeout(current.maxTimer);
        deps.clearTimeout(current.heartbeatTimer);
      }
      for (const track of stream?.getTracks() ?? []) {
        track.stop();
      }
      store.cancel();
      return failure("recording_failed");
    }
  }

  async function stop(discard: boolean): Promise<MessageResult<OffscreenStatus>> {
    const current = session;
    halt("user", discard);
    if (current !== null) {
      await current.done;
    }
    return success(documentStatus());
  }

  function dispatch(command: OffscreenCommand): Promise<OffscreenResponse> {
    switch (command.type) {
      case "offscreen.start":
        return start(command);
      case "offscreen.stop":
        return stop(command.discard);
      case "offscreen.query":
        return Promise.resolve(
          success(command.tabId === undefined ? documentStatus() : tabStatus(command.tabId)),
        );
      case "offscreen.release":
        releasePending();
        return Promise.resolve(success(documentStatus()));
      case "offscreen.step":
        addStep(command.tabId, command.step);
        return Promise.resolve(success(documentStatus()));
    }
  }

  return {
    handle: (message, sender) => {
      if (sender.id !== deps.extensionId || sender.tab !== undefined) {
        return null;
      }
      const parsed = offscreenCommandSchema.safeParse(message);
      return parsed.success ? dispatch(parsed.data) : null;
    },
  };
}

export function startOffscreenRecorder(): void {
  const recorder = createOffscreenRecorder({
    extensionId: browser.runtime.id,
    store: createRecordingStore({
      onExpire: (recording) => {
        URL.revokeObjectURL(recording.blobUrl);
      },
    }),
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    MediaRecorder,
    isTypeSupported: (mimeType) => MediaRecorder.isTypeSupported(mimeType),
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => {
      URL.revokeObjectURL(url);
    },
    sendMessage: (message) => browser.runtime.sendMessage(message),
    now: () => Date.now(),
    setTimeout: (callback, ms) => window.setTimeout(callback, ms),
    clearTimeout: (id) => {
      window.clearTimeout(id);
    },
  });
  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    const reply = recorder.handle(message, sender);
    if (reply === null) {
      return undefined;
    }
    reply.then(sendResponse).catch(() => undefined);
    return true;
  });
}
