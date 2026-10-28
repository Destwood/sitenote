import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SiteMenu } from ".";

vi.mock("../selection-placement-control", () => ({ SelectionPlacementControl: () => null }));

const WEB_URL = "https://web.test";

function renderMenu(overrides: Partial<Parameters<typeof SiteMenu>[0]> = {}) {
  const props = {
    webUrl: WEB_URL,
    captureErrors: true,
    busy: false,
    onToggleCapture: vi.fn(),
    onDisable: vi.fn(),
    onManageSites: vi.fn(),
    ...overrides,
  };
  render(
    <>
      <SiteMenu {...props} />
      <button type="button">Outside</button>
    </>,
  );
  return props;
}

function trigger() {
  return screen.getByRole("button", { name: "More options" });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SiteMenu", () => {
  it("is closed by default", () => {
    renderMenu();

    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("group", { name: "More options" })).toBeNull();
  });

  it("opens on click and lists the menu items", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(trigger());

    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("group", { name: "More options" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Capture console errors" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Allowed sites" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open dashboard" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Disable on this site" })).toBeTruthy();
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(trigger());

    await user.keyboard("{Escape}");

    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("group", { name: "More options" })).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("closes when focus moves to an element outside the menu", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(trigger());

    await user.click(screen.getByRole("button", { name: "Outside" }));

    expect(screen.queryByRole("group", { name: "More options" })).toBeNull();
  });

  it("hides the capture checkbox and disable button when the site is not enabled", async () => {
    const user = userEvent.setup();
    renderMenu({ captureErrors: null });

    await user.click(trigger());

    expect(screen.queryByRole("checkbox", { name: "Capture console errors" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Disable on this site" })).toBeNull();
    expect(screen.getByRole("button", { name: "Allowed sites" })).toBeTruthy();
  });

  it("reports the enabled state of console error capture and toggles it without closing", async () => {
    const user = userEvent.setup();
    const props = renderMenu({ captureErrors: false });
    await user.click(trigger());

    const checkbox = screen.getByRole("checkbox", { name: "Capture console errors" });
    expect(checkbox).toHaveProperty("checked", false);
    await user.click(checkbox);

    expect(props.onToggleCapture).toHaveBeenCalledExactlyOnceWith(true);
    expect(screen.getByRole("group", { name: "More options" })).toBeTruthy();
  });

  it("reports disabling capture when the checkbox is unchecked", async () => {
    const user = userEvent.setup();
    const props = renderMenu({ captureErrors: true });
    await user.click(trigger());

    await user.click(screen.getByRole("checkbox", { name: "Capture console errors" }));

    expect(props.onToggleCapture).toHaveBeenCalledExactlyOnceWith(false);
    expect(screen.getByRole("group", { name: "More options" })).toBeTruthy();
  });

  it("disables the site and closes the menu", async () => {
    const user = userEvent.setup();
    const props = renderMenu();
    await user.click(trigger());

    await user.click(screen.getByRole("button", { name: "Disable on this site" }));

    expect(props.onDisable).toHaveBeenCalledOnce();
    expect(screen.queryByRole("group", { name: "More options" })).toBeNull();
  });

  it("opens the allowed sites list and closes the menu", async () => {
    const user = userEvent.setup();
    const props = renderMenu();
    await user.click(trigger());

    await user.click(screen.getByRole("button", { name: "Allowed sites" }));

    expect(props.onManageSites).toHaveBeenCalledOnce();
    expect(screen.queryByRole("group", { name: "More options" })).toBeNull();
  });

  it("links to the dashboard in a new tab", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(trigger());

    const link = screen.getByRole("link", { name: "Open dashboard" });
    expect(link.getAttribute("href")).toBe("https://web.test/app");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noreferrer");
  });

  it("disables the checkbox and the disable button while busy", async () => {
    const user = userEvent.setup();
    renderMenu({ busy: true });
    await user.click(trigger());

    expect(screen.getByRole("checkbox", { name: "Capture console errors" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("button", { name: "Disable on this site" })).toHaveProperty(
      "disabled",
      true,
    );
  });
});
