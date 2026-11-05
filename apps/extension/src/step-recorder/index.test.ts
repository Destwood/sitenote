import { type RecordingStep } from "@sitenote/core";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { createStepRecorder, type StepRecorder } from ".";

const START = 1_700_000_000_000;

let recorders: StepRecorder[] = [];
let send: Mock<(step: RecordingStep) => void>;

function makeRecorder(): StepRecorder {
  const recorder = createStepRecorder({
    doc: document,
    win: window,
    now: () => Date.now(),
    send,
  });
  recorders.push(recorder);
  return recorder;
}

function sent(): RecordingStep[] {
  return send.mock.calls.map(([step]) => step);
}

function trusted(event: Event): Event {
  Object.defineProperty(event, "isTrusted", { value: true });
  return event;
}

function click(target: Element): void {
  target.dispatchEvent(trusted(new MouseEvent("click", { bubbles: true, composed: true })));
}

function change(target: Element): void {
  target.dispatchEvent(trusted(new Event("change", { bubbles: true, composed: true })));
}

function submit(target: Element): void {
  target.dispatchEvent(trusted(new Event("submit", { bubbles: true, composed: true })));
}

function mount(html: string): void {
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.append(container);
}

function el(selector: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(selector);
  if (found === null) {
    throw new Error(`missing ${selector}`);
  }
  return found;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  history.replaceState(null, "", "/start");
  document.body.innerHTML = "";
  recorders = [];
  send = vi.fn<(step: RecordingStep) => void>();
});

afterEach(() => {
  for (const recorder of recorders) {
    recorder.stop();
  }
  vi.useRealTimers();
});

describe("createStepRecorder", () => {
  it("records a click on a button nested in spans with the button's label and selector", () => {
    mount('<button class="primary"><span><span>Save draft</span></span></button>');
    const recorder = makeRecorder();
    recorder.start(START);

    click(el("button.primary > span > span"));

    expect(sent()).toEqual([
      {
        t: 0,
        kind: "click",
        selector: expect.any(String) as string,
        label: "Save draft",
      },
    ]);
    expect(document.querySelector(sent()[0]?.selector ?? "")).toBe(el("button.primary"));
  });

  it("prefers aria-label over the visible text of a clicked control", () => {
    mount('<a href="/x" aria-label="Open menu"><span>Menu</span></a>');
    const recorder = makeRecorder();
    recorder.start(START);

    click(el("a span"));

    expect(sent()).toEqual([expect.objectContaining({ kind: "click", label: "Open menu" })]);
  });

  it("ignores clicks into text fields and keeps clicks on checkboxes", () => {
    mount(
      '<input type="text" name="q"><textarea name="note"></textarea><input type="checkbox" id="agree" name="agree">',
    );
    const recorder = makeRecorder();
    recorder.start(START);

    click(el("input[type=text]"));
    click(el("textarea"));
    click(el("input[type=checkbox]"));

    expect(sent()).toEqual([expect.objectContaining({ kind: "click", label: "agree" })]);
  });

  it("records an input step on change without ever reading the typed value", () => {
    mount(
      '<label for="email">Email</label><input id="email" type="email" value="ann@example.test">',
    );
    const recorder = makeRecorder();
    recorder.start(START);

    const field = el("#email") as HTMLInputElement;
    field.value = "typed-secret@example.test";
    change(field);

    expect(sent()).toEqual([
      { t: 0, kind: "input", selector: expect.any(String) as string, label: "Email" },
    ]);
    expect(JSON.stringify(sent())).not.toContain("example.test");
  });

  it("uses only the accessible name for password and card fields", () => {
    mount(
      '<input type="password" name="secret" placeholder="Password"><input autocomplete="section-pay cc-number" name="cc" placeholder="Card" value="4111111111111111"><span id="card">Card number</span><input type="text" autocomplete="cc-exp" aria-labelledby="card" value="12/30">',
    );
    const recorder = makeRecorder();
    recorder.start(START);

    change(el("input[type=password]"));
    change(el("input[name=cc]"));
    change(el("input[autocomplete='cc-exp']"));

    expect(sent().map((step) => step.label)).toEqual(["", "", "Card number"]);
    expect(JSON.stringify(sent())).not.toMatch(/4111|12\/30/);
  });

  it("records a submit with the form's selector and label", () => {
    mount('<form id="checkout" aria-label="Checkout"><input name="city"></form>');
    const recorder = makeRecorder();
    recorder.start(START);

    submit(el("form"));

    expect(sent()).toEqual([
      { t: 0, kind: "submit", selector: expect.any(String) as string, label: "Checkout" },
    ]);
    expect(document.querySelector(sent()[0]?.selector ?? "")).toBe(el("form"));
  });

  it("records a navigation when the location changes", () => {
    const recorder = makeRecorder();
    recorder.start(START);

    history.pushState(null, "", "/next?plan=pro#top");
    vi.advanceTimersByTime(500);

    expect(sent()).toEqual([
      { t: 500, kind: "navigate", selector: "", label: "", url: "/next?plan=pro#top" },
    ]);
  });

  it("announces the current page once at start when asked to", () => {
    const recorder = makeRecorder();
    recorder.start(START, { announceNavigation: true });

    expect(sent()).toEqual([{ t: 0, kind: "navigate", selector: "", label: "", url: "/start" }]);
  });

  it("does not announce the page at start by default", () => {
    makeRecorder().start(START);

    expect(send).not.toHaveBeenCalled();
  });

  it("ignores events from inside the sitenote root", () => {
    mount('<sitenote-root><button>Comment</button><input type="checkbox"></sitenote-root>');
    const recorder = makeRecorder();
    recorder.start(START);

    click(el("sitenote-root button"));
    click(el("sitenote-root input"));

    expect(send).not.toHaveBeenCalled();
  });

  it("ignores untrusted events", () => {
    mount('<button>Save</button><input type="checkbox" name="agree">');
    const recorder = makeRecorder();
    recorder.start(START);

    el("button").click();
    el("input").dispatchEvent(new Event("change", { bubbles: true }));

    expect(send).not.toHaveBeenCalled();
  });

  it("stops every listener and timer", () => {
    mount('<button>Save</button><input id="name" type="text">');
    const recorder = makeRecorder();
    recorder.start(START);

    recorder.stop();
    click(el("button"));
    change(el("#name"));
    history.pushState(null, "", "/after-stop");
    vi.advanceTimersByTime(1000);

    expect(send).not.toHaveBeenCalled();
    expect(recorder.active()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("starts again without doubling listeners or timers", () => {
    mount("<button>Save</button>");
    const recorder = makeRecorder();
    recorder.start(START);
    recorder.start(START);

    click(el("button"));

    expect(send).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    expect(recorder.active()).toBe(true);
  });

  it("reports the time relative to the start of the recording", () => {
    mount("<button>Save</button>");
    const recorder = makeRecorder();
    recorder.start(START);
    vi.advanceTimersByTime(1200);

    click(el("button"));

    expect(sent()).toEqual([expect.objectContaining({ t: 1200 })]);
  });

  it("drops an identical step repeated within 300 ms and keeps it after that", () => {
    mount("<button>Save</button>");
    const recorder = makeRecorder();
    recorder.start(START);

    click(el("button"));
    click(el("button"));
    vi.advanceTimersByTime(300);
    click(el("button"));

    expect(send).toHaveBeenCalledTimes(2);
  });
});
