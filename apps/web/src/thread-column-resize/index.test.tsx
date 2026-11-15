import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { THREAD_COLUMN_DEFAULT_WIDTHS, ThreadColumnResizeHandle } from ".";

const TARGET_ID = "thread-table";
const STORAGE_KEY = "sitenote.thread-column-widths";

function renderTable() {
  return render(
    <div id={TARGET_ID}>
      <table>
        <colgroup>
          <col data-col="domain" style={{ width: 160 }} />
          <col data-col="route" style={{ width: 240 }} />
        </colgroup>
        <thead>
          <tr>
            <th data-col="domain">
              Domain
              <ThreadColumnResizeHandle targetId={TARGET_ID} columnId="domain" label="Domain" />
            </th>
            <th data-col="route">
              Route
              <ThreadColumnResizeHandle targetId={TARGET_ID} columnId="route" label="Route" />
            </th>
          </tr>
        </thead>
      </table>
    </div>,
  );
}

function col(id: string): HTMLTableColElement {
  const element = document.querySelector<HTMLTableColElement>(`col[data-col="${id}"]`);
  if (element === null) {
    throw new Error("The column is missing");
  }
  return element;
}

function tableElement(): HTMLTableElement {
  const element = document.querySelector("table");
  if (element === null) {
    throw new Error("The table is missing");
  }
  return element;
}

function handle(label: string): HTMLElement {
  return screen.getByRole("separator", { name: `Resize ${label} column` });
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("ThreadColumnResizeHandle", () => {
  it("renders a focusable vertical separator named after its column", () => {
    renderTable();

    const separator = handle("Domain");
    expect(separator.getAttribute("aria-orientation")).toBe("vertical");
    expect(separator.tabIndex).toBe(0);
  });

  it("widens and narrows its column by 16px with the arrow keys and saves the width", async () => {
    const user = userEvent.setup();
    renderTable();

    handle("Route").focus();
    await user.keyboard("{ArrowRight}");
    expect(col("route").style.width).toBe("256px");
    expect(tableElement().style.width).toBe("416px");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('{"route":256}');

    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(col("route").style.width).toBe("224px");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('{"route":224}');
  });

  it("keeps a column within the minimum and maximum width", () => {
    renderTable();

    handle("Domain").focus();
    for (let step = 0; step < 20; step += 1) {
      fireEvent.keyDown(handle("Domain"), { key: "ArrowLeft" });
    }
    expect(col("domain").style.width).toBe("64px");

    for (let step = 0; step < 60; step += 1) {
      fireEvent.keyDown(handle("Domain"), { key: "ArrowRight" });
    }
    expect(col("domain").style.width).toBe("800px");
  });

  it("drags the column edge with the pointer and saves the final width", () => {
    renderTable();
    const separator = handle("Domain");
    separator.setPointerCapture = () => undefined;
    separator.releasePointerCapture = () => undefined;
    separator.hasPointerCapture = () => true;

    fireEvent.pointerDown(separator, { clientX: 200, button: 0, pointerId: 1 });
    fireEvent.pointerMove(separator, { clientX: 260, pointerId: 1 });
    expect(col("domain").style.width).toBe("220px");

    fireEvent.pointerUp(separator, { clientX: 260, pointerId: 1 });
    fireEvent.pointerMove(separator, { clientX: 400, pointerId: 1 });
    expect(col("domain").style.width).toBe("220px");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('{"domain":220}');
  });

  it("applies a saved width on mount and ignores invalid saved values", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ domain: 300, route: 5000, nope: 100, comments: "wide" }),
    );
    renderTable();

    expect(col("domain").style.width).toBe("300px");
    expect(col("route").style.width).toBe("240px");
    expect(tableElement().style.width).toBe("540px");
  });

  it("starts the type column at 100px", () => {
    expect(THREAD_COLUMN_DEFAULT_WIDTHS.type).toBe(100);
  });

  it("keeps working when localStorage is unreadable", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    renderTable();

    handle("Domain").focus();
    await user.keyboard("{ArrowRight}");
    expect(col("domain").style.width).toBe("176px");
  });
});
