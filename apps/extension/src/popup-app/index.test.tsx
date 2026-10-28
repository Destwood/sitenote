import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { type AuthState } from "../messages";
import { failure, success } from "@sitenote/widget";
import { PopupApp } from ".";

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));

vi.mock("../message-client", () => ({
  sendMessage: mocks.sendMessage,
  onAuthStateChanged: mocks.onAuthStateChanged,
}));

vi.mock("../sign-in-panel", () => ({
  SignInPanel: ({
    googleEnabled,
    onSignedIn,
  }: {
    googleEnabled: boolean;
    onSignedIn: (state: AuthState) => void;
  }) => (
    <button
      type="button"
      data-testid="sign-in-panel"
      data-google={String(googleEnabled)}
      onClick={() => {
        onSignedIn(SIGNED_IN);
      }}
    >
      Sign in
    </button>
  ),
}));

vi.mock("../signed-in-view", () => ({
  SignedInView: ({
    user,
    webUrl,
    onSignedOut,
  }: {
    user: { displayName: string };
    webUrl: string;
    onSignedOut: (state: AuthState) => void;
  }) => (
    <div data-testid="signed-in-view">
      <span>{user.displayName}</span>
      <span>{webUrl}</span>
      <button
        type="button"
        onClick={() => {
          onSignedOut(SIGNED_OUT);
        }}
      >
        Sign out
      </button>
    </div>
  ),
}));

const WEB_URL = "https://web.test";
const VALUE_LINE = "Leave comments directly on any website and review them with your team.";

const SIGNED_IN: AuthState = {
  status: "signedIn",
  user: { id: "u", email: "max@sitenote.test", displayName: "Max Member", isAnonymous: false },
};
const SIGNED_OUT: AuthState = { status: "signedOut" };

let broadcast: (state: AuthState) => void;
let unsubscribe: ReturnType<typeof vi.fn>;

beforeEach(() => {
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
    expect(await screen.findByTestId("sign-in-panel")).toBeTruthy();
  });

  it("asks the background for the state with a typed message", async () => {
    mocks.sendMessage.mockResolvedValue(success(SIGNED_OUT));

    render(<PopupApp googleEnabled={false} webUrl={WEB_URL} />);

    await screen.findByTestId("sign-in-panel");
    expect(mocks.sendMessage).toHaveBeenCalledWith({ type: "auth.getState" });
  });

  it("shows the value line and the sign-in panel to a signed-out user", async () => {
    mocks.sendMessage.mockResolvedValue(success(SIGNED_OUT));

    render(<PopupApp googleEnabled webUrl={WEB_URL} />);

    expect(await screen.findByText(VALUE_LINE)).toBeTruthy();
    expect(screen.getByTestId("sign-in-panel").getAttribute("data-google")).toBe("true");
    expect(screen.queryByTestId("signed-in-view")).toBeNull();
  });

  it("shows the signed-in view with the user and the web url to a signed-in user", async () => {
    mocks.sendMessage.mockResolvedValue(success(SIGNED_IN));

    render(<PopupApp googleEnabled={false} webUrl={WEB_URL} />);

    const view = await screen.findByTestId("signed-in-view");
    expect(view.textContent).toContain("Max Member");
    expect(view.textContent).toContain(WEB_URL);
    expect(screen.queryByTestId("sign-in-panel")).toBeNull();
    expect(screen.queryByText(VALUE_LINE)).toBeNull();
  });

  it("shows a fixed message and retries when the background is unavailable", async () => {
    const user = userEvent.setup();
    mocks.sendMessage.mockResolvedValueOnce(failure("unavailable"));
    render(<PopupApp googleEnabled={false} webUrl={WEB_URL} />);

    expect((await screen.findByRole("alert")).textContent).toContain("could not be reached");

    mocks.sendMessage.mockResolvedValueOnce(success(SIGNED_IN));
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByTestId("signed-in-view")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("switches between the signed-in view and the sign-in panel on a state broadcast", async () => {
    mocks.sendMessage.mockResolvedValue(success(SIGNED_OUT));
    render(<PopupApp googleEnabled={false} webUrl={WEB_URL} />);
    await screen.findByTestId("sign-in-panel");

    act(() => {
      broadcast(SIGNED_IN);
    });
    expect(await screen.findByTestId("signed-in-view")).toBeTruthy();
    expect(screen.queryByTestId("sign-in-panel")).toBeNull();

    act(() => {
      broadcast(SIGNED_OUT);
    });
    expect(await screen.findByTestId("sign-in-panel")).toBeTruthy();
    expect(screen.queryByTestId("signed-in-view")).toBeNull();
  });

  it("switches to the signed-in view when the sign-in panel reports a sign-in", async () => {
    const user = userEvent.setup();
    mocks.sendMessage.mockResolvedValue(success(SIGNED_OUT));
    render(<PopupApp googleEnabled={false} webUrl={WEB_URL} />);
    await user.click(await screen.findByTestId("sign-in-panel"));

    expect(await screen.findByTestId("signed-in-view")).toBeTruthy();
  });

  it("returns to the sign-in panel when the signed-in view reports a sign-out", async () => {
    const user = userEvent.setup();
    mocks.sendMessage.mockResolvedValue(success(SIGNED_IN));
    render(<PopupApp googleEnabled={false} webUrl={WEB_URL} />);
    await user.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(await screen.findByTestId("sign-in-panel")).toBeTruthy();
  });

  it("stops listening when it unmounts", async () => {
    mocks.sendMessage.mockResolvedValue(success(SIGNED_OUT));
    const { unmount } = render(<PopupApp googleEnabled={false} webUrl={WEB_URL} />);
    await screen.findByTestId("sign-in-panel");

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
