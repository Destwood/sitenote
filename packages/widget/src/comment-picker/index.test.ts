import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createPicker, type Picker, type PickerHover } from ".";

let host: HTMLElement;
let picker: Picker | null = null;
let under: Element | null = null;
const frames: (() => void)[] = [];

beforeEach(() => {
  document.body.innerHTML =
    '<main id="page"><button id="cta">Book</button><p id="copy">Text</p></main>';
  host = document.createElement("sitenote-root");
  document.body.append(host);
  under = null;
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => under,
  });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    left: 10,
    top: 20,
    width: 100,
    height: 30,
    right: 110,
    bottom: 50,
    x: 10,
    y: 20,
    toJSON: () => ({}),
  });
});

afterEach(() => {
  picker?.disable();
  picker = null;
  frames.length = 0;
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, "elementFromPoint");
  document.getSelection()?.removeAllRanges();
  document.body.innerHTML = "";
});

function flush(): void {
  for (const callback of frames.splice(0)) {
    callback();
  }
}

function start() {
  const hovers: (PickerHover | null)[] = [];
  const picks: Element[] = [];
  const points: { clientX: number; clientY: number }[] = [];
  picker = createPicker({
    doc: document,
    win: window,
    isOwn: (node) => node !== null && (node === host || host.contains(node)),
    onHover: (hover) => hovers.push(hover),
    onPick: (element, point) => {
      picks.push(element);
      points.push(point);
    },
    requestFrame: (callback) => frames.push(callback),
    cancelFrame: () => {
      frames.length = 0;
    },
  });
  picker.enable();
  return { hovers, picks, points };
}

function element(id: string): Element {
  const found = document.querySelector(id);
  if (found === null) {
    throw new Error(`missing ${id}`);
  }
  return found;
}

function move(x = 30, y = 30): void {
  document.dispatchEvent(new MouseEvent("mousemove", { clientX: x, clientY: y, bubbles: true }));
  flush();
}

function click(target: Element, init: MouseEventInit = {}): MouseEvent {
  const event = new MouseEvent("click", {
    clientX: 30,
    clientY: 30,
    detail: 1,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

describe("hover", () => {
  it("reports the element under the pointer with its rectangle", () => {
    const { hovers } = start();
    under = element("#cta");

    move();

    expect(hovers).toEqual([{ element: under, rect: { x: 10, y: 20, width: 100, height: 30 } }]);
  });

  it("does not repeat an unchanged hover", () => {
    const { hovers } = start();
    under = element("#cta");

    move();
    move(31, 31);

    expect(hovers).toHaveLength(1);
  });

  it("reports nothing over html, body, the extension host or empty space", () => {
    const { hovers } = start();

    for (const candidate of [document.documentElement, document.body, host, null]) {
      under = candidate;
      move();
    }

    expect(hovers).toHaveLength(0);
  });

  it("clears the hover when the pointer moves onto the extension UI", () => {
    const { hovers } = start();
    under = element("#cta");
    move();

    under = host;
    move();

    expect(hovers.at(-1)).toBeNull();
  });

  it("clears the hover when the pointer leaves the document", () => {
    const { hovers } = start();
    under = element("#cta");
    move();

    document.documentElement.dispatchEvent(new MouseEvent("mouseleave"));
    flush();

    expect(hovers.at(-1)).toBeNull();
  });

  it("updates the box when the page scrolls under a still pointer", () => {
    const { hovers } = start();
    under = element("#cta");
    move();

    under = element("#copy");
    document.dispatchEvent(new Event("scroll"));
    flush();

    expect(hovers.at(-1)?.element).toBe(under);
  });
});

describe("click", () => {
  it("picks the element at the click point and keeps the page from reacting", () => {
    const { picks, points } = start();
    const cta = element("#cta");
    under = cta;
    const pageClick = vi.fn();
    cta.addEventListener("click", pageClick);

    const event = click(cta);

    expect(picks).toEqual([cta]);
    expect(points).toEqual([{ clientX: 30, clientY: 30 }]);
    expect(event.defaultPrevented).toBe(true);
    expect(pageClick).not.toHaveBeenCalled();
  });

  it("stops other capture listeners on the page", () => {
    start();
    const cta = element("#cta");
    under = cta;
    const other = vi.fn();
    document.addEventListener("click", other, { capture: true });

    click(cta);

    expect(other).not.toHaveBeenCalled();
    document.removeEventListener("click", other, { capture: true });
  });

  it("leaves clicks on the extension UI alone", () => {
    const { picks } = start();
    const inside = document.createElement("button");
    host.append(inside);
    under = host;

    const event = click(inside);

    expect(picks).toHaveLength(0);
    expect(event.defaultPrevented).toBe(false);
  });

  it("ignores clicks that land on html or body", () => {
    const { picks } = start();
    under = document.body;

    const event = click(document.body);

    expect(picks).toHaveLength(0);
    expect(event.defaultPrevented).toBe(true);
  });

  it("does not pick for keyboard-initiated clicks", () => {
    const { picks } = start();
    under = element("#cta");

    const event = click(element("#cta"), { detail: 0 });

    expect(picks).toHaveLength(0);
    expect(event.defaultPrevented).toBe(true);
  });

  it("does not pick while text is selected", () => {
    const { picks } = start();
    under = element("#copy");
    const range = document.createRange();
    range.selectNodeContents(element("#copy"));
    document.getSelection()?.addRange(range);

    click(element("#copy"));

    expect(picks).toHaveLength(0);
  });
});

describe("lifecycle", () => {
  it("does nothing before it is enabled and after it is disabled", () => {
    const { hovers, picks } = start();
    picker?.disable();
    under = element("#cta");

    move();
    const event = click(element("#cta"));

    expect(hovers).toHaveLength(0);
    expect(picks).toHaveLength(0);
    expect(event.defaultPrevented).toBe(false);
  });

  it("clears the hover when disabled and ignores a second enable", () => {
    const { hovers } = start();
    picker?.enable();
    under = element("#cta");
    move();

    picker?.disable();

    expect(hovers.at(-1)).toBeNull();
    expect(hovers).toHaveLength(2);
  });
});
