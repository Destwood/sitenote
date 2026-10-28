import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { type AuthState } from "../messages";
import { SignedInView } from ".";

const mocks = vi.hoisted(() => ({
  sitePanelMounted: vi.fn(),
}));

vi.mock("../site-panel", async () => {
  const { useEffect } = await import("react");
  return {
    SitePanel: ({ webUrl, onManageSites }: { webUrl: string; onManageSites: () => void }) => {
      useEffect(() => {
        mocks.sitePanelMounted();
      }, []);
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

vi.mock("../notifications-panel", () => ({
  NotificationsRow: () => <div data-testid="notifications-row" />,
}));

vi.mock("../allowed-sites-panel", () => ({
  AllowedSitesPanel: ({ onChanged }: { onChanged: () => void }) => (
    <button type="button" data-testid="allowed-sites-list" onClick={onChanged}>
      Report change
    </button>
  ),
}));

vi.mock("../account-panel", () => ({
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

beforeEach(() => {
  mocks.sitePanelMounted.mockReset();
});

describe("SignedInView", () => {
  it("shows the site panel, the notifications row and the account on the main screen", () => {
    renderView();

    expect(screen.getByTestId("site-panel").textContent).toBe(WEB_URL);
    expect(screen.getByTestId("notifications-row")).toBeTruthy();
    expect(screen.getByTestId("account-panel").textContent).toBe("Max Member");
    expect(screen.queryByRole("heading", { name: "Allowed sites" })).toBeNull();
  });

  it("opens the allowed sites screen from the site panel and hides the site panel", async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole("button", { name: "Manage sites" }));

    expect(screen.getByRole("heading", { name: "Allowed sites" })).toBeTruthy();
    expect(screen.getByTestId("allowed-sites-list")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    expect(screen.queryByTestId("site-panel")).toBeNull();
    expect(screen.queryByTestId("notifications-row")).toBeNull();
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
