import { expect, it, vi } from "vitest";

import { SITENOTE_ROOT_TAG, STEP_URL_MAX } from "@sitenote/core";

import { createReplayRunner, type ReplayView } from ".";

it.each([
  { url: "/user/a", offscreen: false },
  { url: "/user/a", offscreen: true },
  { url: undefined, offscreen: false },
  { url: undefined, offscreen: true },
])(
  "finds a re-rendered carousel card with $url, offscreen=$offscreen",
  async ({ url, offscreen }) => {
    vi.useFakeTimers();
    document.body.innerHTML = '<section id="carousel"><a id="recorded">Anna Trainer</a></section>';
    const onChange = vi.fn<(view: ReplayView | null) => void>();
    const click = vi.fn((event: Event) => {
      event.preventDefault();
    });
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
      timing: { settleQuietMs: 20, stableMaxMs: 0 },
    });
    const timer = window.setTimeout(() => {
      document.body.innerHTML = `<section id="carousel"><a href="/user/a">Other trainer</a><a href="/user/a">${url === undefined ? "  ANNA\n Trainer " : "Visit ANNA Trainer"}</a></section>`;
      for (const element of document.querySelectorAll("a")) {
        vi.spyOn(element, "getClientRects").mockReturnValue([
          new DOMRect(),
        ] as unknown as DOMRectList);
        vi.spyOn(element, "getBoundingClientRect").mockReturnValue(
          new DOMRect(offscreen ? window.innerWidth + 100 : 10, 10, 100, 100),
        );
        element.addEventListener("click", click);
      }
    }, 5);
    try {
      runner.start(
        "thread",
        [
          {
            t: 0,
            kind: "click",
            selector: "#carousel > a#recorded",
            label: "Anna Trainer",
            ...(url === undefined ? {} : { url }),
          },
        ],
        "step",
      );
      await vi.advanceTimersByTimeAsync(100);
      const target = document.querySelector("a:last-child");
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "ready", target, label: "Anna Trainer" }),
      );
      expect(onChange.mock.lastCall?.[0]?.message).toBe(
        offscreen
          ? "This element is outside the visible area, for example in a slider. Next still clicks it."
          : undefined,
      );
      runner.next();
      await vi.advanceTimersByTimeAsync(100);
      expect(click).toHaveBeenCalledOnce();
      expect(click.mock.calls[0]?.[0].target).toBe(target);
    } finally {
      runner.detach();
      window.clearTimeout(timer);
      vi.restoreAllMocks();
      vi.useRealTimers();
      document.body.innerHTML = "";
    }
  },
);

it.each([
  { text: "Anna Trainer", label: "Anna Trainer", hidden: false, laidOut: true, found: true },
  { text: "Anna Trainer Kyiv", label: "Anna Trainer", hidden: false, laidOut: true, found: true },
  { text: "Visit Anna Trainer", label: "Anna Trainer", hidden: false, laidOut: true, found: false },
  { text: "An", label: "An", hidden: false, laidOut: true, found: false },
  { text: "Anna Trainer", label: "Anna Trainer", hidden: true, laidOut: true, found: false },
  { text: "Anna Trainer", label: "Anna Trainer", hidden: false, laidOut: false, found: false },
])(
  "matches a non-interactive tag by label: $text, hidden=$hidden, laidOut=$laidOut",
  async ({ text, label, hidden, laidOut, found }) => {
    vi.useFakeTimers();
    const target = document.createElement("div");
    target.textContent = text;
    target.style.visibility = hidden ? "hidden" : "visible";
    document.body.append(target);
    vi.spyOn(target, "getClientRects").mockReturnValue(
      (laidOut ? [new DOMRect()] : []) as unknown as DOMRectList,
    );
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
      timing: { settleQuietMs: 0, stableMaxMs: 0, elementTimeoutMs: 100 },
    });
    try {
      runner.start(
        "thread",
        [{ t: 0, kind: "click", selector: "section > div.old-slide", label }],
        "step",
      );
      await vi.advanceTimersByTimeAsync(200);
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: found ? "ready" : "missing",
          target: found ? target : null,
        }),
      );
    } finally {
      runner.detach();
      vi.restoreAllMocks();
      vi.useRealTimers();
      target.remove();
    }
  },
);

it.each(["step", "auto"] as const)(
  "offers missing links after 8 seconds in %s mode and saves before navigating",
  async (mode) => {
    vi.useFakeTimers();
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => undefined);
    let finishSave = (): void => undefined;
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        }),
    );
    const clear = vi.fn().mockResolvedValue(undefined);
    const onChange = vi.fn<(view: ReplayView | null) => void>();
    const runner = createReplayRunner({
      doc: document,
      win: window,
      store: { load: vi.fn().mockResolvedValue(null), save, clear },
      now: Date.now,
      onChange,
      timing: { settleQuietMs: 10 },
    });
    try {
      runner.start(
        "thread",
        [
          {
            t: 0,
            kind: "click",
            selector: "#missing",
            label: "Anna Trainer",
            url: "/user/a?tab=info#bio",
          },
        ],
        mode,
      );
      await vi.advanceTimersByTimeAsync(8_009);
      expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ status: "waiting" }));
      await vi.advanceTimersByTimeAsync(1);
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: "ready",
          target: null,
          message: "Could not find this element. Next opens the page it led to.",
        }),
      );
      expect(assign).not.toHaveBeenCalled();
      runner.next();
      await vi.advanceTimersByTimeAsync(0);
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ nextIndex: 1 }));
      expect(assign).not.toHaveBeenCalled();
      finishSave();
      await vi.advanceTimersByTimeAsync(100);
      expect(assign).toHaveBeenCalledWith(
        new URL("/user/a?tab=info#bio", window.location.href).href,
      );
      expect(clear).not.toHaveBeenCalled();
    } finally {
      finishSave();
      runner.detach();
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  },
);

it("keeps missing elements without a URL in the retry/skip flow", async () => {
  vi.useFakeTimers();
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
    timing: { settleQuietMs: 10 },
  });
  try {
    runner.start(
      "thread",
      [{ t: 0, kind: "click", selector: "#missing", label: "Absent" }],
      "step",
    );
    await vi.advanceTimersByTimeAsync(8_010);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "missing",
        message: "Could not find this element on the page.",
      }),
    );
    runner.next();
    await vi.advanceTimersByTimeAsync(0);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ status: "missing" }));
    runner.skip();
    await vi.advanceTimersByTimeAsync(0);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ status: "done" }));
  } finally {
    runner.detach();
    vi.useRealTimers();
  }
});

it.each([true, false])("resumes after a click only when it carries a URL: %s", async (hasUrl) => {
  const onChange = vi.fn<(view: ReplayView | null) => void>();
  const clear = vi.fn().mockResolvedValue(undefined);
  const runner = createReplayRunner({
    doc: document,
    win: window,
    store: {
      load: vi.fn().mockResolvedValue({
        threadId: "thread",
        mode: "step",
        nextIndex: 1,
        at: Date.now(),
        steps: [
          {
            t: 0,
            kind: "click",
            selector: "a",
            label: "Anna Trainer",
            ...(hasUrl ? { url: "/user/a" } : {}),
          },
          { t: 1, kind: "reload", selector: "", label: "" },
        ],
      }),
      save: vi.fn().mockResolvedValue(undefined),
      clear,
    },
    now: Date.now,
    onChange,
    timing: { settleQuietMs: 0 },
  });
  try {
    expect(await runner.resumeSaved()).toBe(hasUrl);
    if (hasUrl) {
      await vi.waitFor(() => {
        expect(onChange).toHaveBeenLastCalledWith(
          expect.objectContaining({ status: "ready", label: "Reload the page", index: 1 }),
        );
      });
      expect(clear).not.toHaveBeenCalled();
    } else {
      expect(clear).toHaveBeenCalledOnce();
    }
  } finally {
    runner.detach();
  }
});

it.each([
  ["back", "Go back"],
  ["forward", "Go forward"],
  ["reload", "Reload the page"],
] as const)("replays %s after Next and saving progress", async (kind, label) => {
  vi.useFakeTimers();
  const perform =
    kind === "reload"
      ? vi.spyOn(window.location, "reload").mockImplementation(() => undefined)
      : vi.spyOn(window.history, kind).mockImplementation(() => undefined);
  let finishSave = (): void => undefined;
  const save = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finishSave = resolve;
      }),
  );
  const onChange = vi.fn<(view: ReplayView | null) => void>();
  const runner = createReplayRunner({
    doc: document,
    win: window,
    store: {
      load: vi.fn().mockResolvedValue(null),
      save,
      clear: vi.fn().mockResolvedValue(undefined),
    },
    now: Date.now,
    onChange,
    timing: { settleQuietMs: 10 },
  });
  try {
    runner.start("thread", [{ t: 0, kind, selector: "", label: "" }], "step");
    await vi.advanceTimersByTimeAsync(10);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "ready", label, target: null, total: 1 }),
    );
    expect(perform).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    runner.next();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ nextIndex: 1 }));
    expect(perform).not.toHaveBeenCalled();
    finishSave();
    await vi.advanceTimersByTimeAsync(0);
    expect(perform).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ status: "done" }));
  } finally {
    runner.detach();
    vi.restoreAllMocks();
    vi.useRealTimers();
  }
});

it("paces and pauses browser navigation in auto mode", async () => {
  vi.useFakeTimers();
  const perform = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
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
    timing: { settleQuietMs: 10, minPaceMs: 50 },
  });
  try {
    runner.start("thread", [{ t: 0, kind: "back", selector: "", label: "" }], "auto");
    await vi.advanceTimersByTimeAsync(10);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "running", label: "Go back", target: null }),
    );
    await vi.advanceTimersByTimeAsync(49);
    expect(perform).not.toHaveBeenCalled();
    runner.pause();
    await vi.advanceTimersByTimeAsync(1);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ status: "ready" }));
    expect(perform).not.toHaveBeenCalled();
    runner.resume();
    await vi.advanceTimersByTimeAsync(10);
    expect(perform).toHaveBeenCalledTimes(1);
  } finally {
    runner.detach();
    vi.restoreAllMocks();
    vi.useRealTimers();
  }
});

it("lets Back select the previous step and satisfies navigation after a browser action", async () => {
  const originalUrl = window.location.href;
  const perform = vi.spyOn(window.history, "back").mockImplementation(() => {
    window.history.replaceState(null, "", "/previous");
  });
  const reload = vi.spyOn(window.location, "reload").mockImplementation(() => undefined);
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
    timing: { settleQuietMs: 0, pollMs: 5 },
  });
  try {
    runner.start(
      "thread",
      [
        { t: 0, kind: "back", selector: "", label: "" },
        { t: 1, kind: "navigate", selector: "", label: "", url: "/previous" },
        { t: 2, kind: "reload", selector: "", label: "" },
        { t: 3, kind: "forward", selector: "", label: "" },
      ],
      "step",
    );
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "ready", label: "Go back" }),
      );
    });
    runner.next();
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "ready", label: "Reload the page", index: 1, total: 3 }),
      );
    });
    runner.next();
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "ready", label: "Go forward" }),
      );
    });
    runner.back();
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "ready", label: "Reload the page" }),
      );
    });
    expect(perform).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  } finally {
    runner.detach();
    vi.restoreAllMocks();
    window.history.replaceState(null, "", originalUrl);
  }
});

it.each(["back", "forward", "reload"] as const)("resumes at the action after %s", async (kind) => {
  const onChange = vi.fn<(view: ReplayView | null) => void>();
  const clear = vi.fn().mockResolvedValue(undefined);
  const saved = {
    threadId: "thread",
    mode: "step" as const,
    nextIndex: 1,
    at: Date.now(),
    steps: [
      { t: 0, kind, selector: "", label: "" },
      { t: 1, kind: "reload" as const, selector: "", label: "" },
    ],
  };
  const runner = createReplayRunner({
    doc: document,
    win: window,
    store: {
      load: vi.fn().mockResolvedValue(saved),
      save: vi.fn().mockResolvedValue(undefined),
      clear,
    },
    now: Date.now,
    onChange,
    timing: { settleQuietMs: 0 },
  });
  try {
    expect(await runner.resumeSaved()).toBe(true);
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: "ready",
          index: 1,
          label: "Reload the page",
          target: null,
        }),
      );
    });
    expect(clear).not.toHaveBeenCalled();
  } finally {
    runner.detach();
  }
});

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
      window.history.replaceState(null, "", ahead ? "/replay-start" : current);
      runner.start(
        "thread",
        [
          ...(ahead ? [{ t: 0, kind: "click" as const, selector: "#missing", label: "Open" }] : []),
          { t: 1, kind: "navigate", selector: "", label: "", url: recorded },
        ],
        "step",
      );
      if (ahead) {
        window.history.pushState(null, "", current);
      }
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

it.each([false, true])(
  "does not jump ahead when the route never changed after anchoring (%s)",
  async (afterClick) => {
    const originalUrl = window.location.href;
    window.history.replaceState(null, "", afterClick ? "/start" : "/");
    const home = document.createElement("button");
    home.id = "home";
    vi.spyOn(home, "getClientRects").mockReturnValue([new DOMRect()] as unknown as DOMRectList);
    home.addEventListener("click", () => {
      window.history.pushState(null, "", "/");
    });
    document.body.append(home);
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
      timing: { settleQuietMs: 0, stableMaxMs: 0, pollMs: 5, elementTimeoutMs: 1_000 },
    });

    try {
      runner.start(
        "thread",
        [
          ...(afterClick
            ? [{ t: 0, kind: "click" as const, selector: "#home", label: "Start" }]
            : []),
          { t: 0, kind: "click", selector: "#card-a", label: "Card A" },
          { t: 1, kind: "navigate", selector: "", label: "", url: "/user/a" },
          { t: 2, kind: "click", selector: "#logo", label: "Home" },
          { t: 3, kind: "navigate", selector: "", label: "", url: "/" },
          { t: 4, kind: "click", selector: "#card-b", label: "Card B" },
        ],
        "step",
      );
      if (afterClick) {
        await vi.waitFor(() => {
          expect(onChange).toHaveBeenLastCalledWith(
            expect.objectContaining({ status: "ready", target: home }),
          );
        });
        runner.next();
      }
      await vi.waitFor(() => {
        expect(onChange).toHaveBeenLastCalledWith(
          expect.objectContaining({ status: "waiting", label: "Card A" }),
        );
      });
      const target = document.createElement("button");
      target.id = "card-a";
      vi.spyOn(target, "getClientRects").mockReturnValue([new DOMRect()] as unknown as DOMRectList);
      document.body.append(target);
      await vi.waitFor(() => {
        expect(onChange).toHaveBeenLastCalledWith(
          expect.objectContaining({ status: "ready", index: afterClick ? 1 : 0, target }),
        );
      });
      expect(onChange.mock.calls.some(([view]) => view?.message?.includes("already further"))).toBe(
        false,
      );
    } finally {
      runner.detach();
      vi.restoreAllMocks();
      window.history.replaceState(null, "", originalUrl);
      document.body.innerHTML = "";
    }
  },
);

it.each(["animation", "sitenote"])("settles despite constant %s mutations", async (kind) => {
  vi.useFakeTimers();
  const target = document.createElement("button");
  target.id = "target";
  const host = document.createElement(SITENOTE_ROOT_TAG);
  const content = document.createElement("span");
  content.textContent = "Replay";
  host.append(content);
  document.body.append(target, host);
  vi.spyOn(target, "getClientRects").mockReturnValue([new DOMRect()] as unknown as DOMRectList);
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
    timing: { settleQuietMs: 50, settleMaxMs: 500, stableMaxMs: 0, pollMs: 5 },
  });
  let tick = 0;
  const animation = window.setInterval(() => {
    tick += 1;
    if (kind === "animation") {
      target.style.transform = `translateX(${String(tick)}px)`;
      target.className = `slide-${String(tick)}`;
    } else {
      host.setAttribute("aria-busy", "false");
      content.textContent = String(tick);
    }
  }, 10);

  try {
    runner.start(
      "thread",
      [
        { t: 0, kind: "click", selector: "#target", label: "First" },
        { t: 1, kind: "click", selector: "#target", label: "Second" },
      ],
      "step",
    );
    await vi.advanceTimersByTimeAsync(150);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "ready", label: "First" }),
    );
    runner.next();
    await vi.advanceTimersByTimeAsync(150);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "ready", label: "Second" }),
    );
    expect(tick).toBeGreaterThan(0);
  } finally {
    runner.detach();
    window.clearInterval(animation);
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
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
