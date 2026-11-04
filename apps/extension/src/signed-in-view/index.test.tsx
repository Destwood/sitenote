import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceInfo } from "@sitenote/widget";
import { type AuthState } from "../messages";
import type { WorkspaceControl } from "../site-panel";
import { SignedInView } from ".";

const mocks = vi.hoisted(() => ({
  sitePanelMounted: vi.fn(),
  workspaceControl: null as WorkspaceControl | null,
}));

vi.mock("../site-panel", async () => {
  const { useEffect } = await import("react");
  return {
    SitePanel: ({
      webUrl,
      onManageSites,
      onWorkspaceControl,
    }: {
      webUrl: string;
      onManageSites: () => void;
      onWorkspaceControl: (control: WorkspaceControl | null) => void;
    }) => {
      useEffect(() => {
        mocks.sitePanelMounted();
        onWorkspaceControl(mocks.workspaceControl);
      }, [onWorkspaceControl]);
      return (
        <>
          <div data-testid="site-panel">{webUrl}</div>
          <button type="button" onClick={onManageSites}>
            Manage sites
          </button>
        </>
      );
    },
  };
});

vi.mock("../notifications-panel", async () => {
  const { useEffect } = await import("react");
  return {
    NOTIFICATIONS_PREVIEW_SIZE: 5,
    NotificationsPanel: ({
      onUnreadChange,
      webUrl,
    }: {
      onUnreadChange: (unread: number) => void;
      webUrl: string;
    }) => {
      useEffect(() => {
        onUnreadChange(3);
      }, [onUnreadChange]);
      return <div data-testid="notifications-panel">{webUrl}</div>;
    },
  };
});

vi.mock("../allowed-sites-panel", () => ({
  AllowedSitesPanel: ({ onChanged }: { onChanged: () => void }) => (
    <button type="button" data-testid="allowed-sites-list" onClick={onChanged}>
      Report change
    </button>
  ),
}));

vi.mock("../account-panel", () => ({
  initialOf: (name: string) => name.charAt(0),
  AccountPanel: ({ user }: { user: { displayName: string } }) => (
    <div data-testid="account-panel">{user.displayName}</div>
  ),
}));

const WEB_URL = "https://web.test";
const USER = { id: "u", email: "max@sitenote.test", displayName: "Max Member", isAnonymous: false };
const SIGNED_IN: Extract<AuthState, { status: "signedIn" }> = { status: "signedIn", user: USER };

function renderView() {
  return render(<SignedInView user={SIGNED_IN.user} webUrl={WEB_URL} onSignedOut={vi.fn()} />);
}

function bell() {
  return screen.getByRole("button", { name: "Notifications" });
}

function account() {
  return screen.getByRole("button", { name: "Account" });
}

function notificationsTray(): HTMLElement {
  const tray = document.getElementById("notifications-tray");
  if (tray === null) {
    throw new Error("The notifications tray is missing");
  }
  return tray;
}

const NORTHWIND: WorkspaceInfo = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "Northwind",
  role: "owner",
};
const AGENCY: WorkspaceInfo = {
  id: "10000000-0000-4000-8000-000000000002",
  name: "Agency",
  role: "guest",
};

function publishControl(overrides: Partial<WorkspaceControl> = {}) {
  mocks.workspaceControl = {
    value: NORTHWIND.id,
    options: [NORTHWIND],
    onChange: vi.fn(),
    disabled: false,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.sitePanelMounted.mockReset();
  mocks.workspaceControl = null;
});

describe("SignedInView header", () => {
  it("shows the bell with the unread count and the account trigger with the initial", async () => {
    renderView();

    expect(await within(bell()).findByText("3")).toBeTruthy();
    expect(account().textContent).toBe("M");
    expect(account().getAttribute("data-testid")).toBe("account-trigger");
  });

  it("keeps the notifications list mounted while its tray is closed", () => {
    renderView();

    expect(screen.getByTestId("notifications-panel").textContent).toBe(WEB_URL);
    expect(notificationsTray().hidden).toBe(true);
    expect(bell().getAttribute("aria-expanded")).toBe("false");
  });

  it("opens the notifications tray from the bell and closes it when the bell is pressed again", async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(bell());
    expect(notificationsTray().hidden).toBe(false);
    expect(bell().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("heading", { name: "Notifications" })).toBeTruthy();

    await user.click(bell());
    expect(notificationsTray().hidden).toBe(true);
    expect(bell().getAttribute("aria-expanded")).toBe("false");
  });

  it("closes the open tray on Escape", async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(bell());

    await user.keyboard("{Escape}");

    expect(notificationsTray().hidden).toBe(true);
  });

  it("closes the open tray when the user clicks outside the header", async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(bell());

    await user.click(screen.getByTestId("site-panel"));

    expect(notificationsTray().hidden).toBe(true);
  });

  it("keeps the tray open when the user clicks inside it", async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(bell());

    await user.click(screen.getByTestId("notifications-panel"));

    expect(notificationsTray().hidden).toBe(false);
  });

  it("opens the account tray with the account panel and closes the notifications tray", async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(bell());

    await user.click(account());

    expect(screen.getByTestId("account-panel").textContent).toBe("Max Member");
    expect(account().getAttribute("aria-expanded")).toBe("true");
    expect(notificationsTray().hidden).toBe(true);
    expect(bell().getAttribute("aria-expanded")).toBe("false");
  });

  it("closes the account tray when the account trigger is pressed again", async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(account());

    await user.click(account());

    expect(screen.queryByTestId("account-panel")).toBeNull();
    expect(account().getAttribute("aria-expanded")).toBe("false");
  });

  it("does not show the account panel on the main screen until the account is opened", () => {
    renderView();

    expect(screen.queryByTestId("account-panel")).toBeNull();
  });
});

describe("SignedInView main screen", () => {
  it("shows the site panel and the footer with the dashboard link and the workspace name", async () => {
    publishControl();
    renderView();

    expect(screen.getByTestId("site-panel").textContent).toBe(WEB_URL);
    expect(await screen.findByText("Northwind")).toBeTruthy();
    const link = screen.getByRole("link", { name: "Open dashboard" });
    expect(link.getAttribute("href")).toBe(`${WEB_URL}/app`);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noreferrer");
    expect(screen.queryByRole("heading", { name: "Allowed sites" })).toBeNull();
  });

  it("shows a static workspace label in the footer when the user has one workspace", async () => {
    publishControl();
    renderView();

    expect(await screen.findByText("Northwind")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Workspace" })).toBeNull();
  });

  it("shows the workspace picker in the footer when the user has several workspaces", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    publishControl({ value: AGENCY.id, options: [NORTHWIND, AGENCY], onChange });
    renderView();

    const trigger = await screen.findByRole("button", { name: "Workspace" });
    expect(trigger.textContent).toContain("Agency");
    expect(trigger.closest("footer")).not.toBeNull();

    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: "Northwind" }));

    expect(onChange).toHaveBeenCalledWith(NORTHWIND.id);
  });

  it("shows no workspace in the footer while the site panel publishes none", async () => {
    renderView();

    await vi.waitFor(() => {
      expect(mocks.sitePanelMounted).toHaveBeenCalled();
    });
    expect(screen.queryByRole("button", { name: "Workspace" })).toBeNull();
    expect(screen.queryByText("Northwind")).toBeNull();
    expect(screen.getByRole("link", { name: "Open dashboard" })).toBeTruthy();
  });

  it("opens the allowed sites screen from the site panel and hides the site panel", async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole("button", { name: "Manage sites" }));

    expect(screen.getByRole("heading", { name: "Allowed sites" })).toBeTruthy();
    expect(screen.getByTestId("allowed-sites-list")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    expect(screen.queryByTestId("site-panel")).toBeNull();
  });

  it("keeps the header and the footer on the allowed sites screen", async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole("button", { name: "Manage sites" }));

    expect(account()).toBeTruthy();
    expect(bell()).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open dashboard" })).toBeTruthy();
    expect(screen.queryByTestId("account-panel")).toBeNull();
  });

  it("returns to the main screen when Back is pressed", async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole("button", { name: "Manage sites" }));

    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByTestId("site-panel")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Allowed sites" })).toBeNull();
  });

  it("remounts the site panel after the allowed sites change", async () => {
    const user = userEvent.setup();
    renderView();
    expect(mocks.sitePanelMounted).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Manage sites" }));

    await user.click(screen.getByTestId("allowed-sites-list"));
    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(mocks.sitePanelMounted).toHaveBeenCalledTimes(2);
  });
});
