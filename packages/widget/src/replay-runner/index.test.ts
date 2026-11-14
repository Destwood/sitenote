import { expect, it, vi } from "vitest";

import { createReplayRunner, type ReplayView } from ".";

it("waits for navigation between actions without counting it as a step", async () => {
  const originalUrl = window.location.href;
  window.history.replaceState(null, "", "/start");
  document.body.innerHTML = '<button id="save">Save</button><button id="next">Next</button>';
  const buttons = document.querySelectorAll("button");
  for (const button of buttons) {
    vi.spyOn(button, "getClientRects").mockReturnValue([new DOMRect()] as unknown as DOMRectList);
  }
  const onChange = vi.fn<(view: ReplayView | null) => void>();
  const runner = createReplayRunner({
    doc: document,
    win: window,
    store: {
      load: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    },
    now: Date.now,
    onChange,
    timing: { settleQuietMs: 0, stableMaxMs: 0, pollMs: 5 },
  });

  try {
    runner.start(
      "thread",
      [
        { t: 0, kind: "click", selector: "#save", label: "Save" },
        { t: 1, kind: "navigate", selector: "", label: "", url: "/saved" },
        { t: 2, kind: "click", selector: "#next", label: "Next" },
      ],
      "step",
    );
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "ready", index: 0, total: 2 }),
      );
    });
    runner.next();
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: "waiting",
          label: "Waiting for /saved",
          index: 0,
          total: 2,
        }),
      );
    });
    window.history.pushState(null, "", "/saved");
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "ready", label: "Next", index: 1, total: 2 }),
      );
    });
  } finally {
    runner.detach();
    vi.restoreAllMocks();
    window.history.replaceState(null, "", originalUrl);
    document.body.innerHTML = "";
  }
});

it("stops before executing a step and clears progress after a pending save", async () => {
  const button = document.createElement("button");
  document.body.append(button);
  const click = vi.fn();
  button.addEventListener("click", click);
  const rects = vi
    .spyOn(button, "getClientRects")
    .mockReturnValue([new DOMRect()] as unknown as DOMRectList);
  let finishSave!: () => void;
  const pendingSave = new Promise<void>((resolve) => {
    finishSave = resolve;
  });
  const save = vi.fn(() => pendingSave);
  const clear = vi.fn().mockResolvedValue(undefined);
  const onChange = vi.fn<(view: ReplayView | null) => void>();
  const runner = createReplayRunner({
    doc: document,
    win: window,
    store: { load: vi.fn().mockResolvedValue(null), save, clear },
    now: Date.now,
    onChange,
    timing: { settleQuietMs: 0, stableMaxMs: 0 },
  });

  try {
    runner.start("thread", [{ t: 0, kind: "click", selector: "button", label: "Save" }], "step");
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ status: "ready" }));
    });
    runner.next();
    await vi.waitFor(() => {
      expect(save).toHaveBeenCalledOnce();
    });

    runner.stop();
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(clear).not.toHaveBeenCalled();
    finishSave();
    await vi.waitFor(() => {
      expect(clear).toHaveBeenCalledOnce();
    });
    expect(click).not.toHaveBeenCalled();
  } finally {
    finishSave();
    runner.detach();
    rects.mockRestore();
    button.remove();
  }
});
