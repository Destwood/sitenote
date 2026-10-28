import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { type AuthState } from "../messages";
import { failure, success } from "@sitenote/widget";
import { PopupApp, commentsTabLabel, notificationsTabLabel } from ".";

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  onAuthStateChanged: vi.fn(),
  threadsMounted: vi.fn(),
}));

vi.mock("../message-client", () => ({
  sendMessage: mocks.sendMessage,
  onAuthStateChanged: mocks.onAuthStateChanged,
}));

vi.mock("../site-panel", () => ({
  SitePanel: ({
    webUrl,
    onStateChange,
  }: {
    webUrl: string;
    onStateChange?: (enabled: boolean, tabId: number | null) => void;
  }) => (
    <>
      <div data-testid="site-panel">{webUrl}</div>
      <button
        type="button"
        onClick={() => {
          onStateChange?.(true, 7);
        }}
      >
        Report enabled
      </button>
    </>
  ),
}));

vi.mock("../page-threads-panel", async () => {
  const { useEffect } = await import("react");
  return {
    PageThreadsPanel: ({
      tabId,
      onCount,
    }: {
      tabId: number;
      onCount: (openCount: number) => void;
    }) => {
      useEffect(() => {
        mocks.threadsMounted(tabId);
      }, [tabId]);
      return (
        <button
          type="button"
          data-testid="page-threads-panel"
          onClick={() => {
            onCount(2);
          }}
        >
          Report open threads
        </button>
      );
    },
  };
});

vi.mock("../selection-placement-control", () => ({
  SelectionPlacementControl: () => <div data-testid="selection-placement-control" />,
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
  mocks.threadsMounted.mockReset();
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
    expect(screen.getByTestId("display-name").getAttribute("title")).toBe("max@sitenote.test");
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

  it("labels the comments tab with the open threads of the page when they are known", () => {
    expect(commentsTabLabel(null)).toBe("Comments");
    expect(commentsTabLabel(0)).toBe("Comments (0)");
    expect(commentsTabLabel(4)).toBe("Comments (4)");
  });

  it("shows the Comments tab first and the notifications panel hidden behind its tab", async () => {
    const user = userEvent.setup();
    mocks.sendMessage.mockResolvedValue(success(SIGNED_IN));
    render(<PopupApp googleEnabled={false} webUrl={WEB_URL} />);
    await screen.findByTestId("site-panel");

    const comments = screen.getByRole("tab", { name: "Comments" });
    const notifications = screen.getByRole("tab", { name: "Notifications" });
    expect(comments.getAttribute("aria-selected")).toBe("true");
    expect(notifications.getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("tabpanel", { name: "Comments" })).toBeTruthy();
    expect(screen.queryByRole("tabpanel", { name: "Notifications" })).toBeNull();

    await user.click(notifications);

    expect(notifications.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel", { name: "Notifications" })).toBeTruthy();
    expect(screen.queryByRole("tabpanel", { name: "Comments" })).toBeNull();
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
    const comments = screen.getByRole("tab", { name: "Comments" });
    const notifications = screen.getByRole("tab", { name: "Notifications" });

    comments.focus();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(notifications);
    expect(notifications.getAttribute("aria-selected")).toBe("true");
    expect(notifications.getAttribute("tabindex")).toBe("0");
    expect(comments.getAttribute("tabindex")).toBe("-1");

    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(comments);

    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(notifications);

    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(comments);

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

  it("lists the page's threads under the site panel only once the site is enabled", async () => {
    const user = userEvent.setup();
    mocks.sendMessage.mockResolvedValue(success(SIGNED_IN));
    render(<PopupApp googleEnabled={false} webUrl={WEB_URL} />);
    await screen.findByTestId("site-panel");
    expect(screen.queryByTestId("page-threads-panel")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Report enabled" }));

    expect(screen.getByTestId("page-threads-panel")).toBeTruthy();
    expect(mocks.threadsMounted).toHaveBeenCalledWith(7);
  });

  it("labels the comments tab with the open threads the page reports", async () => {
    const user = userEvent.setup();
    mocks.sendMessage.mockResolvedValue(success(SIGNED_IN));
    render(<PopupApp googleEnabled={false} webUrl={WEB_URL} />);
    await screen.findByTestId("site-panel");
    await user.click(screen.getByRole("button", { name: "Report enabled" }));

    await user.click(screen.getByTestId("page-threads-panel"));

    expect(screen.getByRole("tab", { name: "Comments (2)" })).toBeTruthy();
  });

  it("lists the page's threads again each time the comments tab is opened", async () => {
    const user = userEvent.setup();
    mocks.sendMessage.mockResolvedValue(success(SIGNED_IN));
    render(<PopupApp googleEnabled={false} webUrl={WEB_URL} />);
    await screen.findByTestId("site-panel");
    await user.click(screen.getByRole("button", { name: "Report enabled" }));
    expect(mocks.threadsMounted).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("tab", { name: "Notifications" }));
    await user.click(screen.getByRole("tab", { name: "Comments" }));

    expect(mocks.threadsMounted).toHaveBeenCalledTimes(2);
  });

  it("shows the comment button setting in the header only to a signed-in user", async () => {
    mocks.sendMessage.mockResolvedValue(success(SIGNED_OUT));
    const { unmount } = render(<PopupApp googleEnabled={false} webUrl={WEB_URL} />);
    await screen.findByLabelText("Email");
    expect(screen.queryByTestId("selection-placement-control")).toBeNull();
    unmount();

    mocks.sendMessage.mockResolvedValue(success(SIGNED_IN));
    render(<PopupApp googleEnabled={false} webUrl={WEB_URL} />);

    expect(await screen.findByTestId("selection-placement-control")).toBeTruthy();
    expect(
      screen
        .getByRole("heading", { name: "Sitenote" })
        .parentElement?.contains(screen.getByTestId("selection-placement-control")),
    ).toBe(true);
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
