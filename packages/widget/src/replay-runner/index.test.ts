import { expect, it, vi } from "vitest";

import { STEP_URL_MAX } from "@sitenote/core";

import { createReplayRunner, type ReplayView } from ".";

it.each([false, true])("matches recorded navigation with reachedAhead=%s", async (ahead) => {
  const originalUrl = window.location.href;
  const fullUrl =
    "/login?redirectUrl=%2Fpeople%2F1360c3e1-565b-42af-994b-c82951d0d679%2Fsubscriptions%3FsubscriptionId%3D92f9342b-e113-4983-a162-d7262aad124b";
  const truncatedUrl = fullUrl.slice(0, STEP_URL_MAX);
  const queryStart = `/${"a".repeat(STEP_URL_MAX - 2)}?`;
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
    timing: { settleQuietMs: 0, pollMs: 5, navigateTimeoutMs: 20, elementTimeoutMs: 20 },
  });

  try {
    expect(truncatedUrl).toHaveLength(100);
    for (const [recorded, current, reached] of [
      [truncatedUrl, fullUrl, true],
      ["/login", fullUrl, false],
      ["/saved?tab=one", "/saved?tab=one", true],
      [truncatedUrl, "/unrelated", false],
      [queryStart, `${queryStart}redirect=people`, true],
      [queryStart, `${queryStart.slice(0, -1)}/unrelated`, false],
      ["https://recorded.example/saved?tab=one", "/saved?tab=one", true],
    ] as const) {
      window.history.replaceState(null, "", current);
      runner.start(
        "thread",
        [
          ...(ahead ? [{ t: 0, kind: "click" as const, selector: "#missing", label: "Open" }] : []),
          { t: 1, kind: "navigate", selector: "", label: "", url: recorded },
        ],
        "step",
      );
      await vi.waitFor(() => {
        expect(onChange).toHaveBeenLastCalledWith(
          expect.objectContaining({ status: reached ? "done" : "missing" }),
        );
      });
      runner.detach();
      onChange.mockClear();
    }
  } finally {
    runner.detach();
    window.history.replaceState(null, "", originalUrl);
  }
});

it.each([
  {
    name: "selects the second sibling with an exact label",
    html: "<button>Other gym</button><button>Recorded gym</button><button>Third gym</button>",
    label: "Recorded gym",
    expected: 1,
  },
  {
    name: "selects a sibling by its recorded 40-character prefix",
    html: "<button>Other gym</button><button>Тренажерний зал Олександр Бабаєв Україна Київ</button><button>Third gym</button>",
    label: "Тренажерний зал Олександр Бабаєв Україна Київ".slice(0, 40),
    expected: 1,
  },
  {
    name: "skips the first match without client rects",
    html: '<button style="display: none">Recorded gym</button><button>Recorded gym</button><button>Third gym</button>',
    label: "Recorded gym",
    expected: 1,
  },
  {
    name: "skips the first match with hidden visibility",
    html: '<button style="visibility: hidden">Recorded gym</button><button>Recorded gym</button><button>Third gym</button>',
    label: "Recorded gym",
    expected: 1,
  },
  {
    name: "selects the first visible match for an empty label",
    html: '<button style="display: none">Hidden gym</button><button>First visible gym</button><button>Third gym</button>',
    label: "",
    expected: 1,
  },
  {
    name: "keeps a single match even when its text differs",
    html: "<button>Only gym</button>",
    label: "Recorded gym",
    expected: 0,
  },
  {
    name: "prefers an exact match over a prefix and a contained label",
    html: "<button>Recorded gym Kyiv</button><button>Visit Recorded gym</button><button>Recorded gym</button>",
    label: "Recorded gym",
    expected: 2,
  },
  {
    name: "prefers a prefix over a contained label",
    html: "<button>Visit Recorded gym</button><button>Recorded gym Kyiv</button><button>Third gym</button>",
    label: "Recorded gym",
    expected: 1,
  },
  {
    name: "selects a contained label when no stronger match exists",
    html: "<button>Other gym</button><button>Visit Recorded gym today</button><button>Third gym</button>",
    label: "Recorded gym",
    expected: 1,
  },
  {
    name: "normalizes whitespace and case in the label and visible text",
    html: "<button>Other gym</button><button>  RECORDED\n   gym  </button><button>Third gym</button>",
    label: "  recorded\t gym  ",
    expected: 1,
  },
  {
    name: "keeps document order when label matches tie",
    html: "<button>Other gym</button><button>Recorded gym</button><button>Recorded gym</button>",
    label: "Recorded gym",
    expected: 1,
  },
  {
    name: "selects the first visible match when no text matches",
    html: '<button style="display: none">Hidden gym</button><button>First visible gym</button><button>Third gym</button>',
    label: "Recorded gym",
    expected: 1,
  },
])("$name", async ({ html, label, expected }) => {
  document.body.innerHTML = html;
  const buttons = Array.from(document.querySelectorAll("button"));
  const clicks = buttons.map((button) => vi.spyOn(button, "click"));
  for (const button of buttons) {
    vi.spyOn(button, "getClientRects").mockReturnValue(
      (button.style.display === "none" ? [] : [new DOMRect()]) as unknown as DOMRectList,
    );
  }
  const target = buttons[expected];
  if (target === undefined) {
    throw new Error("Expected replay target is missing.");
  }
  const scroll = vi.spyOn(target, "scrollIntoView");
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
    runner.start("thread", [{ t: 0, kind: "click", selector: "button", label }], "step");
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "ready", target }),
      );
    });
    expect(scroll).toHaveBeenCalledWith({ block: "center", inline: "center", behavior: "smooth" });
    runner.next();
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ status: "done" }));
    });
    for (const [at, click] of clicks.entries()) {
      expect(click).toHaveBeenCalledTimes(at === expected ? 1 : 0);
    }
  } finally {
    runner.detach();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  }
});

it.each([
  {
    name: "clicks the single interactive descendant of a recorded container",
    html: '<div id="target"><a href="/user/recorded"><img alt="Profile"></a></div>',
    expected: "a",
  },
  {
    name: "clicks the recorded container when it contains two links",
    html: '<div id="target"><a href="/first">First</a><a href="/second">Second</a></div>',
    expected: "#target",
  },
  {
    name: "clicks a recorded button itself",
    html: '<button id="target"><span role="link">Open</span></button>',
    expected: "#target",
  },
  {
    name: "clicks the recorded container when it has no interactive descendants",
    html: '<div id="target"><span>Open</span></div>',
    expected: "#target",
  },
  {
    name: "keeps the recorded target when it has an interactive ancestor",
    html: '<div role="button"><div id="target"><a href="/user/recorded">Open</a></div></div>',
    expected: "#target",
  },
])("$name", async ({ html, expected }) => {
  document.body.innerHTML = html;
  const target = document.querySelector<HTMLElement>("#target");
  const clickTarget = document.querySelector<HTMLElement>(expected);
  if (target === null || clickTarget === null) {
    throw new Error("Expected replay target is missing.");
  }
  vi.spyOn(target, "getClientRects").mockReturnValue([new DOMRect()] as unknown as DOMRectList);
  const elements = [target, ...target.querySelectorAll<HTMLElement>("a,[role=link]")];
  const clicks = elements.map((element) => vi.spyOn(element, "click"));
  const handlers = elements.map((element) => {
    const handler = vi.fn((event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    element.addEventListener("click", handler);
    return handler;
  });
  const events: string[] = [];
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    clickTarget.addEventListener(type, () => {
      events.push(type);
    });
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
    runner.start("thread", [{ t: 0, kind: "click", selector: "#target", label: "Open" }], "step");
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "ready", target }),
      );
    });
    runner.next();
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ status: "done" }));
    });
    for (const [at, element] of elements.entries()) {
      const count = element === clickTarget ? 1 : 0;
      expect(clicks[at]).toHaveBeenCalledTimes(count);
      expect(handlers[at]).toHaveBeenCalledTimes(count);
    }
    expect(events).toEqual(["pointerdown", "mousedown", "pointerup", "mouseup", "click"]);
  } finally {
    runner.detach();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  }
});

it.each(["step", "auto"] as const)(
  "reports targets outside the viewport in %s mode",
  async (mode) => {
    const target = document.createElement("button");
    document.body.append(target);
    vi.spyOn(target, "getClientRects").mockReturnValue([new DOMRect()] as unknown as DOMRectList);
    const rect = vi.spyOn(target, "getBoundingClientRect");
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
      for (const [bounds, offscreen] of [
        [new DOMRect(window.innerWidth, 10, 100, 100), true],
        [new DOMRect(-100, 10, 100, 100), true],
        [new DOMRect(10, window.innerHeight, 100, 100), true],
        [new DOMRect(10, -100, 100, 100), true],
        [new DOMRect(10, 10, 100, 100), false],
        [new DOMRect(window.innerWidth - 1, 10, 100, 100), false],
      ] as const) {
        rect.mockReturnValue(bounds);
        runner.start("thread", [{ t: 0, kind: "click", selector: "button", label: "Open" }], mode);
        await vi.waitFor(() => {
          expect(onChange).toHaveBeenLastCalledWith(
            expect.objectContaining({ status: mode === "step" ? "ready" : "running", target }),
          );
        });
        const view = onChange.mock.lastCall?.[0];
        if (offscreen) {
          expect(view?.message).toBe(
            "This element is outside the visible area, for example in a slider. Next still clicks it.",
          );
        } else {
          expect(view).not.toHaveProperty("message");
        }
        runner.detach();
        onChange.mockClear();
      }
    } finally {
      runner.detach();
      vi.restoreAllMocks();
      target.remove();
    }
  },
);

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
