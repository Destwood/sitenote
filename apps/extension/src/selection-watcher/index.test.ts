import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { watchSelection } from ".";

let stop: (() => void) | null = null;

beforeEach(() => {
  document.body.innerHTML =
    '<p id="copy">The quick brown fox jumps over the lazy dog.</p><div id="own">Our own text</div>';
});

afterEach(() => {
  stop?.();
  stop = null;
  document.getSelection()?.removeAllRanges();
  document.body.innerHTML = "";
});

function select(id: string, start: number, end: number): void {
  const node = document.querySelector(`#${id}`)?.firstChild;
  if (node === null || node === undefined) {
    throw new Error("missing text");
  }
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function start(isOwn: (node: Node | null) => boolean = () => false) {
  const onChange = vi.fn<(range: Range | null) => void>();
  stop = watchSelection({ doc: document, isOwn, onChange });
  return onChange;
}

describe("watchSelection", () => {
  it("reports a copy of the selected range after the mouse is released", () => {
    const onChange = start();
    select("copy", 4, 19);

    document.dispatchEvent(new MouseEvent("mouseup"));

    expect(onChange).toHaveBeenCalledTimes(1);
    const range = onChange.mock.calls[0]?.[0];
    expect(range?.toString()).toBe("quick brown fox");
    expect(range).not.toBe(document.getSelection()?.getRangeAt(0));
  });

  it("reports a keyboard selection on key up", () => {
    const onChange = start();
    select("copy", 0, 3);

    document.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowRight", shiftKey: true }));

    expect(onChange.mock.calls[0]?.[0]?.toString()).toBe("The");
  });

  it("reports nothing for a collapsed selection and does not repeat null", () => {
    const onChange = start();
    select("copy", 3, 3);

    document.dispatchEvent(new MouseEvent("mouseup"));
    document.dispatchEvent(new KeyboardEvent("keyup", { key: "a" }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores selections inside the extension UI", () => {
    const own = document.querySelector("#own");
    const onChange = start(
      (node) => node !== null && (node === own || own?.contains(node) === true),
    );
    select("own", 0, 3);

    document.dispatchEvent(new MouseEvent("mouseup"));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores a selection that holds only whitespace", () => {
    document.body.innerHTML = '<p id="copy">a   b</p>';
    const onChange = start();
    select("copy", 1, 4);

    document.dispatchEvent(new MouseEvent("mouseup"));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("reports null once the selection collapses", () => {
    const onChange = start();
    select("copy", 4, 19);
    document.dispatchEvent(new MouseEvent("mouseup"));

    document.getSelection()?.removeAllRanges();
    document.dispatchEvent(new Event("selectionchange"));

    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("stops listening when stopped", () => {
    const onChange = start();
    stop?.();
    stop = null;
    select("copy", 4, 19);

    document.dispatchEvent(new MouseEvent("mouseup"));

    expect(onChange).not.toHaveBeenCalled();
  });
});
