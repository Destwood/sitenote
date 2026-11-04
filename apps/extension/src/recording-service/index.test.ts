import { failure, success } from "@sitenote/widget";
import { describe, expect, it, vi } from "vitest";

import type { EnabledEntry } from "../enablement-store";
import type { OffscreenCommand, OffscreenResponse } from "../messages";
import type { ThreadRecordings } from "../recording-upload";
import {
  createNoopRecordingService,
  createRecordingService,
  type RecordingFinished,
  type RecordingServiceDeps,
} from ".";

const ORIGIN = "https://example.test";
const ENTRY: EnabledEntry = {
  siteId: "20000000-0000-4000-8000-000000000001",
  workspaceId: "10000000-0000-4000-8000-000000000001",
  captureErrors: true,
};
const START = { tabId: 4, streamId: "stream-1" };
const FINISHED: RecordingFinished = {
  type: "recording.finished",
  tabId: 4,
  blobUrl: "blob:x",
  durationMs: 5000,
  size: 1024,
  reason: "user",
};

function defaultReply(command: OffscreenCommand): OffscreenResponse {
  if (command.type === "offscreen.start") {
    return success({ state: "recording", startedAt: 1_000 });
  }
  if (command.type === "offscreen.query" && command.tabId !== undefined) {
    return success({ state: "pending", durationMs: 5 });
  }
  return success({ state: "idle" });
}

function setup(
  options: {
    url?: string | null;
    enabled?: boolean;
    document?: boolean;
    reply?: (command: OffscreenCommand) => OffscreenResponse;
  } = {},
) {
  let document = options.document ?? false;
  const commands: OffscreenCommand[] = [];
  const pushes: { tabId: number; message: unknown }[] = [];
  const reply = options.reply ?? defaultReply;
  const recordings = {
    attach: vi.fn<ThreadRecordings["attach"]>(() => Promise.resolve(null)),
    discard: vi.fn<ThreadRecordings["discard"]>(),
  };
  const deps: RecordingServiceDeps = {
    tabs: {
      get: vi.fn(() =>
        Promise.resolve(
          options.url === null ? null : { url: options.url ?? `${ORIGIN}/pricing?x=1` },
        ),
      ),
    },
    getEnabledSite: vi.fn(() => Promise.resolve(options.enabled === false ? null : ENTRY)),
    offscreen: {
      hasDocument: vi.fn(() => Promise.resolve(document)),
      createDocument: vi.fn(() => {
        document = true;
        return Promise.resolve();
      }),
      closeDocument: vi.fn(() => {
        document = false;
        return Promise.resolve();
      }),
    },
    sendToOffscreen: vi.fn((command: OffscreenCommand) => {
      commands.push(command);
      return Promise.resolve(reply(command));
    }),
    sendToTab: vi.fn((tabId: number, message: unknown) => {
      pushes.push({ tabId, message });
      return Promise.resolve();
    }),
    badge: {
      set: vi.fn(() => Promise.resolve()),
      clear: vi.fn(() => Promise.resolve()),
    },
    maxMs: 120_000,
    stopBytes: 39_000_000,
    recordings,
  };
  return { service: createRecordingService(deps), deps, commands, pushes, recordings };
}

describe("createRecordingService start", () => {
  it("creates the offscreen document once under concurrent starts", async () => {
    const { service, deps } = setup();

    await Promise.all([service.start(START), service.start({ tabId: 5, streamId: "stream-2" })]);

    expect(deps.offscreen.createDocument).toHaveBeenCalledTimes(1);
  });

  it("does not create the offscreen document again when it already exists", async () => {
    const { service, deps } = setup({ document: true });

    await service.start(START);

    expect(deps.offscreen.createDocument).not.toHaveBeenCalled();
  });

  it.each([
    ["an origin that is not enabled", { enabled: false }],
    ["a page that cannot be recorded", { url: "https://chromewebstore.google.com/detail/x" }],
    ["a tab that is gone", { url: null }],
  ] as const)("refuses to start for %s", async (_name, options) => {
    const { service, deps, commands } = setup(options);

    expect(await service.start(START)).toEqual(failure("forbidden"));
    expect(deps.offscreen.createDocument).not.toHaveBeenCalled();
    expect(commands).toEqual([]);
  });

  it("maps a busy offscreen document to recording_busy and sets no badge", async () => {
    const { service, deps } = setup({ reply: () => failure("recording_busy") });

    expect(await service.start(START)).toEqual(failure("recording_busy"));
    expect(deps.badge.set).not.toHaveBeenCalled();
  });

  it("maps other offscreen failures and thrown errors to recording_failed", async () => {
    const refused = setup({ reply: () => failure("recording_failed") });
    expect(await refused.service.start(START)).toEqual(failure("recording_failed"));

    const broken = setup();
    vi.mocked(broken.deps.sendToOffscreen).mockImplementationOnce(() =>
      Promise.reject(new Error("no receiver")),
    );
    expect(await broken.service.start(START)).toEqual(failure("recording_failed"));
  });

  it("marks the tab, announces the state and returns the recording status", async () => {
    const { service, deps, commands, pushes } = setup();

    expect(await service.start(START)).toEqual(success({ state: "recording", startedAt: 1_000 }));

    expect(commands).toEqual([
      {
        type: "offscreen.start",
        tabId: 4,
        streamId: "stream-1",
        maxMs: 120_000,
        stopBytes: 39_000_000,
      },
    ]);
    expect(deps.badge.set).toHaveBeenCalledExactlyOnceWith(4, "REC");
    expect(pushes).toEqual([
      { tabId: 4, message: { type: "recording.state", recording: true, startedAt: 1_000 } },
    ]);
  });

  it("still starts when the tab cannot be told about it", async () => {
    const { service, deps } = setup();
    vi.mocked(deps.sendToTab).mockRejectedValueOnce(new Error("no receiver"));

    expect(await service.start(START)).toEqual(success({ state: "recording", startedAt: 1_000 }));
  });
});

describe("createRecordingService status and stop", () => {
  it("reports idle without an offscreen document and sends nothing", async () => {
    const { service, commands } = setup();

    expect(await service.status(4)).toEqual(success({ state: "idle" }));
    expect(await service.status()).toEqual(success({ state: "idle" }));
    expect(commands).toEqual([]);
  });

  it("maps the offscreen answer to a recording status without the blob", async () => {
    const { service } = setup({
      document: true,
      reply: () => success({ state: "pending", durationMs: 5, blobUrl: "blob:x", size: 9 }),
    });

    expect(await service.status(4)).toEqual(success({ state: "pending", durationMs: 5 }));
  });

  it("stops the recording of the given tab only", async () => {
    const { service, commands } = setup({
      document: true,
      reply: (command) =>
        command.type === "offscreen.query" && command.tabId === 4
          ? success({ state: "recording", startedAt: 1_000 })
          : success({ state: "idle" }),
    });

    expect(await service.stop(5)).toEqual(success(null));
    expect(commands.some((command) => command.type === "offscreen.stop")).toBe(false);

    expect(await service.stop(4)).toEqual(success(null));
    expect(commands).toContainEqual({ type: "offscreen.stop", discard: false });
  });

  it("stops whichever recording is active when no tab is given", async () => {
    const { service, commands } = setup({ document: true });

    expect(await service.stop()).toEqual(success(null));
    expect(commands).toContainEqual({ type: "offscreen.stop", discard: false });
  });
});

describe("createRecordingService finished recordings", () => {
  it("clears the badge, announces the end and the ready video", async () => {
    const { service, deps, pushes } = setup();

    expect(await service.onFinished(FINISHED)).toEqual(success(null));

    expect(deps.badge.clear).toHaveBeenCalledExactlyOnceWith(4);
    expect(pushes).toEqual([
      { tabId: 4, message: { type: "recording.state", recording: false } },
      { tabId: 4, message: { type: "recording.ready", durationMs: 5000 } },
    ]);
  });

  it.each([
    ["an error", { ...FINISHED, reason: "error" as const }],
    ["an empty video", { ...FINISHED, size: 0 }],
  ])("does not announce a ready video after %s", async (_name, finished) => {
    const { service, pushes } = setup();

    expect(await service.onFinished(finished)).toEqual(success(null));

    expect(pushes).toEqual([{ tabId: 4, message: { type: "recording.state", recording: false } }]);
  });

  it("releases the pending recording of a missing tab and closes an idle document", async () => {
    const { service, deps, commands, pushes } = setup({
      document: true,
      url: null,
      reply: (command) =>
        command.type === "offscreen.query" && command.tabId !== undefined
          ? success({ state: "pending", durationMs: 5 })
          : success({ state: "idle" }),
    });

    expect(await service.onFinished(FINISHED)).toEqual(success(null));

    expect(commands).toContainEqual({ type: "offscreen.release" });
    expect(deps.offscreen.closeDocument).toHaveBeenCalledOnce();
    expect(pushes.some((push) => JSON.stringify(push).includes("recording.ready"))).toBe(false);
  });

  it("keeps the document open for another recording when the tab is missing", async () => {
    const { service, deps } = setup({
      document: true,
      url: null,
      reply: (command) =>
        command.type === "offscreen.query" && command.tabId === undefined
          ? success({ state: "recording", startedAt: 1_000 })
          : success({ state: "idle" }),
    });

    expect(await service.onFinished(FINISHED)).toEqual(success(null));

    expect(deps.offscreen.closeDocument).not.toHaveBeenCalled();
  });
});

describe("createRecordingService discard and tab removal", () => {
  it("cancels the recording of a removed tab and closes the idle document", async () => {
    const { service, deps, commands } = setup({
      document: true,
      reply: (command) =>
        command.type === "offscreen.query" && command.tabId === 4
          ? success({ state: "recording", startedAt: 1_000 })
          : success({ state: "idle" }),
    });

    service.onTabRemoved(4);

    await vi.waitFor(() => {
      expect(deps.offscreen.closeDocument).toHaveBeenCalledOnce();
    });
    expect(commands).toContainEqual({ type: "offscreen.stop", discard: true });
  });

  it("releases only the pending recording of a removed tab", async () => {
    const { service, commands } = setup({
      document: true,
      reply: (command) =>
        command.type === "offscreen.query" && command.tabId === 4
          ? success({ state: "pending", durationMs: 5 })
          : success({ state: "recording", startedAt: 1_000 }),
    });

    service.onTabRemoved(4);

    await vi.waitFor(() => {
      expect(commands).toContainEqual({ type: "offscreen.release" });
    });
    expect(commands.some((command) => command.type === "offscreen.stop")).toBe(false);
  });

  it("hands the discard of a tab to the recordings and closes an idle document", async () => {
    const { service, deps, recordings } = setup({ document: true });

    service.discard(4);

    await vi.waitFor(() => {
      expect(deps.offscreen.closeDocument).toHaveBeenCalledOnce();
    });
    expect(recordings.discard).toHaveBeenCalledExactlyOnceWith(4);
  });

  it("keeps the document open while another recording is active on discard", async () => {
    const { service, deps } = setup({
      document: true,
      reply: (command) =>
        command.type === "offscreen.query" && command.tabId === undefined
          ? success({ state: "recording", startedAt: 1_000 })
          : success({ state: "idle" }),
    });

    service.discard(4);

    await vi.waitFor(() => {
      expect(deps.sendToOffscreen).toHaveBeenCalledWith({ type: "offscreen.query" });
    });
    expect(deps.offscreen.closeDocument).not.toHaveBeenCalled();
  });

  it("swallows failures while cancelling a removed tab", async () => {
    const { service, deps } = setup({ document: true });
    vi.mocked(deps.sendToOffscreen).mockRejectedValue(new Error("gone"));

    expect(() => {
      service.onTabRemoved(4);
    }).not.toThrow();
    await vi.waitFor(() => {
      expect(deps.sendToOffscreen).toHaveBeenCalled();
    });
  });

  it("forwards a step only while its tab is recording", async () => {
    const STEP = { t: 120, kind: "click" as const, selector: "#buy", label: "Buy" };
    const { service, commands } = setup({
      document: true,
      reply: (command) =>
        command.type === "offscreen.query" && command.tabId === 4
          ? success({ state: "recording", startedAt: 1_000 })
          : success({ state: "pending", durationMs: 5 }),
    });

    expect(await service.addStep(4, STEP)).toEqual(success(null));
    expect(await service.addStep(5, STEP)).toEqual(success(null));

    expect(commands.filter((command) => command.type === "offscreen.step")).toEqual([
      { type: "offscreen.step", tabId: 4, step: STEP },
    ]);
  });

  it("neither creates the document nor forwards a step when nothing records", async () => {
    const STEP = { t: 120, kind: "click" as const, selector: "#buy", label: "Buy" };
    const { service, deps, commands } = setup();

    expect(await service.addStep(4, STEP)).toEqual(success(null));

    expect(deps.offscreen.createDocument).not.toHaveBeenCalled();
    expect(commands).toEqual([]);
  });

  it("swallows a failed step delivery and still answers success", async () => {
    const STEP = { t: 120, kind: "click" as const, selector: "#buy", label: "Buy" };
    const { service, deps } = setup({ document: true });
    vi.mocked(deps.sendToOffscreen)
      .mockResolvedValueOnce(success({ state: "recording", startedAt: 1_000 }))
      .mockRejectedValueOnce(new Error("gone"));

    expect(await service.addStep(4, STEP)).toEqual(success(null));
  });

  it("does nothing on the noop service", async () => {
    const STEP = { t: 120, kind: "click" as const, selector: "#buy", label: "Buy" };

    expect(await createNoopRecordingService().addStep(4, STEP)).toEqual(success(null));
  });

  it("delegates attach to the recordings without discarding", async () => {
    const { service, recordings } = setup();
    const ref = { path: "workspace/thread.webm", durationMs: 5, size: 9 };
    recordings.attach.mockResolvedValueOnce(ref);

    expect(await service.attach(4, "workspace", "thread")).toEqual(ref);

    expect(recordings.attach).toHaveBeenCalledExactlyOnceWith(4, "workspace", "thread");
    expect(recordings.discard).not.toHaveBeenCalled();
  });
});
