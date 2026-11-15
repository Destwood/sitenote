import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThreadColumnPicker } from ".";

const TARGET_ID = "thread-table";
const STORAGE_KEY = "sitenote.thread-columns";

function renderPicker() {
  return render(
    <>
      <ThreadColumnPicker targetId={TARGET_ID} />
      <div id={TARGET_ID} />
    </>,
  );
}

function target() {
  const element = document.getElementById(TARGET_ID);
  if (element === null) {
    throw new Error("The target is missing");
  }
  return element;
}

function checkbox(name: string) {
  return screen.getByRole<HTMLInputElement>("checkbox", { name });
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ThreadColumnPicker", () => {
  it("opens the column list on the Columns button and closes it on Escape", async () => {
    const user = userEvent.setup();
    renderPicker();

    const trigger = screen.getByRole("button", { name: "Columns" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-haspopup")).toBe("true");
    expect(screen.queryByRole("checkbox")).toBeNull();

    await user.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByRole("checkbox")).toHaveLength(9);

    await user.keyboard("{Escape}");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("closes the column list on a pointer press outside it", async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByRole("button", { name: "Columns" }));
    expect(screen.getAllByRole("checkbox")).toHaveLength(9);

    await user.click(document.body);
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("hides a column on the target and saves it when its checkbox is cleared", async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByRole("button", { name: "Columns" }));
    await user.click(checkbox("Domain"));

    expect(target().getAttribute("data-hidden-cols")).toBe("domain");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('["domain"]');

    await user.click(checkbox("Domain"));

    expect(target().hasAttribute("data-hidden-cols")).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("[]");
  });

  it("restores the saved hidden columns on mount", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(["route", "comments"]));
    const user = userEvent.setup();
    renderPicker();

    expect(target().getAttribute("data-hidden-cols")).toBe("route comments");

    await user.click(screen.getByRole("button", { name: "Columns" }));
    expect(checkbox("Route").checked).toBe(false);
    expect(checkbox("Comments").checked).toBe(false);
    expect(checkbox("Domain").checked).toBe(true);
  });

  it("ignores stored data that is not a list of known column ids", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    const first = renderPicker();
    expect(target().hasAttribute("data-hidden-cols")).toBe(false);
    first.unmount();

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ domain: true }));
    const second = renderPicker();
    expect(target().hasAttribute("data-hidden-cols")).toBe(false);
    second.unmount();

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(["nope", 5, null, "domain", "domain"]));
    renderPicker();
    expect(target().getAttribute("data-hidden-cols")).toBe("domain");
  });

  it("keeps a column added after the saved list visible", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        "domain",
        "route",
        "firstComment",
        "author",
        "status",
        "comments",
        "created",
        "lastActivity",
      ]),
    );
    renderPicker();

    expect(target().getAttribute("data-hidden-cols")).toBe(
      "domain route firstComment author status comments created lastActivity",
    );
  });

  it("ignores a stored list that hides every column", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        "domain",
        "route",
        "firstComment",
        "type",
        "author",
        "status",
        "comments",
        "created",
        "lastActivity",
      ]),
    );
    renderPicker();

    expect(target().hasAttribute("data-hidden-cols")).toBe(false);
  });

  it("disables the last checked column so one column always stays visible", async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByRole("button", { name: "Columns" }));
    await user.click(checkbox("Domain"));
    await user.click(checkbox("Route"));
    for (const label of ["First comment", "Type", "Author", "Status", "Comments", "Created"]) {
      await user.click(checkbox(label));
    }

    expect(checkbox("Last activity").disabled).toBe(true);
    expect(checkbox("Created").disabled).toBe(false);
    expect(checkbox("Domain").disabled).toBe(false);
  });

  it("keeps working when localStorage throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const user = userEvent.setup();
    renderPicker();

    expect(target().hasAttribute("data-hidden-cols")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Columns" }));
    await user.click(checkbox("Author"));

    expect(target().getAttribute("data-hidden-cols")).toBe("author");
    expect(checkbox("Author").checked).toBe(false);
  });
});
