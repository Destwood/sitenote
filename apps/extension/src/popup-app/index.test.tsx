import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { failure, success, type AuthState } from "../messages";
import { PopupApp, notificationsTabLabel } from ".";

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));

vi.mock("../message-client", () => ({
  sendMessage: mocks.sendMessage,
  onAuthStateChanged: mocks.onAuthStateChanged,
}));

vi.mock("../site-panel", () => ({
  SitePanel: ({ webUrl }: { webUrl: string }) => <div data-testid="site-panel">{webUrl}</div>,
}));

vi.mock("../notifications-panel", () => ({
  NotificationsPanel: ({ onUnreadChange }: { onUnreadChange: (unread: number) => void }) => (
    <button
      type="button"
      data-testid="notifications-panel"
      onClick={() => {
        onUnreadChange(3);
      }}
    >
      report unread
    </button>
  ),
}));

const WEB_URL = "https://web.test";

const SIGNED_IN: AuthState = {
  status: "signedIn",
  user: { id: "u", email: "max@sitenote.test", displayName: "Max Member", isAnonymous: false },
};
const SIGNED_OUT: AuthState = { status: "signedOut" };

let broadcast: (state: AuthState) => void;
let unsubscribe: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  mocks.sendMessage.mockReset();
  unsubscribe = vi.fn();
  mocks.onAuthStateChanged.mockReset();
  mocks.onAuthStateChanged.mockImplementation((listener: (state: AuthState) => void) => {
    broadcast = listener;
    return unsubscribe;
  });
});

describe("PopupApp", () => {
  it("shows a loading state until the background answers", async () => {
    let answer: (value: unknown) => void = () => undefined;
    mocks.sendMessage.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );

    render(<PopupApp googleEnabled={false} webUrl={WEB_URL} />);
    expect(screen.getByRole("status").textContent).toContain("Loading");

    await act(async () => {
      answer(success(SIGNED_OUT));
      await Promise.resolve();
    });
    expect(await screen.findByLabelText("Email")).toBeTruthy();
  });

  it("asks the background for the state with a typed message", async () => {
    mocks.sendMessage.mockResolvedValue(success(SIGNED_OUT));

    render(<PopupApp googleEnabled={false} webUrl={WEB_URL} />);

    await screen.findByLabelText("Email");
    expect(mocks.sendMessage).toHaveBeenCalledWith({ type: "auth.getState" });
  });

  it("shows the signed-in user", async () => {
    mocks.sendMessage.mockResolvedValue(success(SIGNED_IN));

    render(<PopupApp googleEnabled={false} webUrl={WEB_URL} />);

    expect((await screen.findByTestId("display-name")).textContent).toContain("Max Member");
    expect(screen.getByTestId("account-email").textContent).toContain("max@sitenote.test");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it("shows the site panel only to a signed-in user and hands it the web url", async () => {
    mocks.sendMessage.mockResolvedValue(success(SIGNED_OUT));
    const { unmount } = render(<PopupApp googleEnabled={false} webUrl={WEB_URL} />);
    await screen.findByLabelText("Email");
    expect(screen.queryByTestId("site-panel")).toBeNull();
    unmount();

    mocks.sendMessage.mockResolvedValue(success(SIGNED_IN));
    render(<PopupApp googleEnabled={false} webUrl={WEB_URL} />);

    expect((await screen.findByTestId("site-panel")).textContent).toBe(WEB_URL);
  });

  it("labels the notifications tab with the unread count", () => {
    expect(notificationsTabLabel(0)).toBe("Notifications");
    expect(notificationsTabLabel(1)).toBe("Notifications (1)");
    expect(notificationsTabLabel(120)).toBe("Notifications (120)");
  });

  it("shows the Site tab first and the notifications panel hidden behind its tab", async () => {
    const user = userEvent.setup();
    mocks.sendMessage.mockResolvedValue(success(SIGNED_IN));
    render(<PopupApp googleEnabled={false} webUrl={WEB_URL} />);
    await screen.findByTestId("site-panel");

    const site = screen.getByRole("tab", { name: "Site" });
    const notifications = screen.getByRole("tab", { name: "Notifications" });
    expect(site.getAttribute("aria-selected")).toBe("true");
    expect(notifications.getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("tabpanel", { name: "Site" })).toBeTruthy();
    expect(screen.queryByRole("tabpanel", { name: "Notifications" })).toBeNull();

    await user.click(notifications);

    expect(notifications.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel", { name: "Notifications" })).toBeTruthy();
    expect(screen.queryByRole("tabpanel", { name: "Site" })).toBeNull();
    expect(notifications.getAttribute("aria-controls")).toBe(
      screen.getByRole("tabpanel", { name: "Notifications" }).getAttribute("id"),
    );
  });

  it("shows the unread count reported by the notifications panel in its tab", async () => {
    const user = userEvent.setup();
    mocks.sendMessage.mockResolvedValue(success(SIGNED_IN));
    render(<PopupApp googleEnabled={false} webUrl={WEB_URL} />);
    await screen.findByTestId("site-panel");

    await user.click(screen.getByRole("tab", { name: "Notifications" }));
    await user.click(screen.getByTestId("notifications-panel"));

    expect(screen.getByRole("tab", { name: "Notifications (3)" })).toBeTruthy();
  });

  it("moves between the tabs with the arrow keys, Home and End", async () => {
    const user = userEvent.setup();
    mocks.sendMessage.mockResolvedValue(success(SIGNED_IN));
    render(<PopupApp googleEnabled={false} webUrl={WEB_URL} />);
    await screen.findByTestId("site-panel");
    const site = screen.getByRole("tab", { name: "Site" });
    const notifications = screen.getByRole("tab", { name: "Notifications" });

    site.focus();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(notifications);
    expect(notifications.getAttribute("aria-selected")).toBe("true");
    expect(notifications.getAttribute("tabindex")).toBe("0");
    expect(site.getAttribute("tabindex")).toBe("-1");

    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(site);

    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(notifications);

    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(site);

    await user.keyboard("{End}");
    expect(document.activeElement).toBe(notifications);
  });

  it("does not show the tabs to a signed-out user", async () => {
    mocks.sendMessage.mockResolvedValue(success(SIGNED_OUT));
    render(<PopupApp googleEnabled={false} webUrl={WEB_URL} />);
    await screen.findByLabelText("Email");

    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByTestId("notifications-panel")).toBeNull();
  });

  it("follows a state broadcast from the background", async () => {
    mocks.sendMessage.mockResolvedValue(success(SIGNED_OUT));
    render(<PopupApp googleEnabled={false} webUrl={WEB_URL} />);
    await screen.findByLabelText("Email");

    act(() => {
      broadcast(SIGNED_IN);
    });
    expect((await screen.findByTestId("display-name")).textContent).toContain("Max Member");

    act(() => {
      broadcast(SIGNED_OUT);
    });
    expect(await screen.findByLabelText("Email")).toBeTruthy();
  });

  it("shows a fixed message and retries when the background is unavailable", async () => {
    const user = userEvent.setup();
    mocks.sendMessage.mockResolvedValueOnce(failure("unavailable"));
    render(<PopupApp googleEnabled={false} webUrl={WEB_URL} />);

    expect((await screen.findByRole("alert")).textContent).toContain("could not be reached");

    mocks.sendMessage.mockResolvedValueOnce(success(SIGNED_IN));
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByTestId("display-name")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the Google button only when the flag is on", async () => {
    mocks.sendMessage.mockResolvedValue(success(SIGNED_OUT));

    const { unmount } = render(<PopupApp googleEnabled={false} webUrl={WEB_URL} />);
    await screen.findByLabelText("Email");
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
    unmount();

    render(<PopupApp googleEnabled webUrl={WEB_URL} />);
    expect(await screen.findByRole("button", { name: "Continue with Google" })).toBeTruthy();
  });

  it("returns to the sign-in form after signing out", async () => {
    const user = userEvent.setup();
    mocks.sendMessage.mockResolvedValueOnce(success(SIGNED_IN));
    render(<PopupApp googleEnabled={false} webUrl={WEB_URL} />);
    await screen.findByTestId("display-name");

    mocks.sendMessage.mockResolvedValueOnce(success(SIGNED_OUT));
    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByLabelText("Email")).toBeTruthy();
  });

  it("stops listening when it unmounts", async () => {
    mocks.sendMessage.mockResolvedValue(success(SIGNED_OUT));
    const { unmount } = render(<PopupApp googleEnabled={false} webUrl={WEB_URL} />);
    await screen.findByLabelText("Email");

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
