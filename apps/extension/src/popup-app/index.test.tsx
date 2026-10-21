import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { failure, success, type AuthState } from "../messages";
import { PopupApp } from ".";

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));

vi.mock("../message-client", () => ({
  sendMessage: mocks.sendMessage,
  onAuthStateChanged: mocks.onAuthStateChanged,
}));

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

    render(<PopupApp googleEnabled={false} />);
    expect(screen.getByRole("status").textContent).toContain("Loading");

    await act(async () => {
      answer(success(SIGNED_OUT));
      await Promise.resolve();
    });
    expect(await screen.findByLabelText("Email")).toBeTruthy();
  });

  it("asks the background for the state with a typed message", async () => {
    mocks.sendMessage.mockResolvedValue(success(SIGNED_OUT));

    render(<PopupApp googleEnabled={false} />);

    await screen.findByLabelText("Email");
    expect(mocks.sendMessage).toHaveBeenCalledWith({ type: "auth.getState" });
  });

  it("shows the signed-in user", async () => {
    mocks.sendMessage.mockResolvedValue(success(SIGNED_IN));

    render(<PopupApp googleEnabled={false} />);

    expect((await screen.findByTestId("display-name")).textContent).toContain("Max Member");
    expect(screen.getByTestId("account-email").textContent).toContain("max@sitenote.test");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it("follows a state broadcast from the background", async () => {
    mocks.sendMessage.mockResolvedValue(success(SIGNED_OUT));
    render(<PopupApp googleEnabled={false} />);
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
    render(<PopupApp googleEnabled={false} />);

    expect((await screen.findByRole("alert")).textContent).toContain("could not be reached");

    mocks.sendMessage.mockResolvedValueOnce(success(SIGNED_IN));
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByTestId("display-name")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the Google button only when the flag is on", async () => {
    mocks.sendMessage.mockResolvedValue(success(SIGNED_OUT));

    const { unmount } = render(<PopupApp googleEnabled={false} />);
    await screen.findByLabelText("Email");
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
    unmount();

    render(<PopupApp googleEnabled />);
    expect(await screen.findByRole("button", { name: "Continue with Google" })).toBeTruthy();
  });

  it("returns to the sign-in form after signing out", async () => {
    const user = userEvent.setup();
    mocks.sendMessage.mockResolvedValueOnce(success(SIGNED_IN));
    render(<PopupApp googleEnabled={false} />);
    await screen.findByTestId("display-name");

    mocks.sendMessage.mockResolvedValueOnce(success(SIGNED_OUT));
    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByLabelText("Email")).toBeTruthy();
  });

  it("stops listening when it unmounts", async () => {
    mocks.sendMessage.mockResolvedValue(success(SIGNED_OUT));
    const { unmount } = render(<PopupApp googleEnabled={false} />);
    await screen.findByLabelText("Email");

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
