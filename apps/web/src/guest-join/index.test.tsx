import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  signInAnonymously: vi.fn(),
  rpc: vi.fn(),
  order: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  sendSessionToExtension: vi.fn(),
  forgetWebSession: vi.fn(),
}));

vi.mock("../supabase-browser", () => ({
  getSupabaseBrowserClient: () => ({
    auth: { getSession: mocks.getSession, signInAnonymously: mocks.signInAnonymously },
    rpc: mocks.rpc,
    from: mocks.from,
  }),
}));
vi.mock("../extension-bridge", () => ({ sendSessionToExtension: mocks.sendSessionToExtension }));
vi.mock("../web-session", () => ({ forgetWebSession: mocks.forgetWebSession }));

import { GuestJoin } from ".";

const TOKEN = "a".repeat(48);
const EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop";
const SESSION = { access_token: "access", refresh_token: "refresh" };

function setup() {
  const user = userEvent.setup();
  render(<GuestJoin token={TOKEN} workspaceName="Northwind Studio" extensionId={EXTENSION_ID} />);
  return user;
}

async function join(user: ReturnType<typeof userEvent.setup>, name = "Gina Client") {
  await user.type(screen.getByLabelText("Your name"), name);
  await user.click(screen.getByRole("button", { name: "Join as guest" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ data: { session: null } });
  mocks.signInAnonymously.mockImplementation(() => {
    mocks.getSession.mockResolvedValue({ data: { session: SESSION } });
    return Promise.resolve({ error: null });
  });
  mocks.rpc.mockResolvedValue({
    data: [{ workspace_id: "w-1", role: "guest" }],
    error: null,
  });
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ order: mocks.order });
  mocks.order.mockResolvedValue({
    data: [{ origin: "http://127.0.0.1:4173" }, { origin: "javascript:alert(1)" }],
    error: null,
  });
  mocks.sendSessionToExtension.mockResolvedValue({ status: "ok" });
  mocks.forgetWebSession.mockResolvedValue(true);
});

describe("name step", () => {
  it("asks for a name for the workspace and nothing else", async () => {
    setup();

    expect(screen.getByRole("heading").textContent).toBe("Join Northwind Studio as a guest");
    expect(screen.getByLabelText("Your name")).toHaveProperty("maxLength", 80);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Join as guest" })).toHaveProperty(
        "disabled",
        false,
      );
    });
  });

  it("refuses a blank name without any request", async () => {
    const user = setup();

    await join(user, "   ");

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Enter a name of 1 to 80 characters.",
    );
    expect(mocks.signInAnonymously).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("joining", () => {
  it("signs in anonymously, accepts the invite with the trimmed name and hands the session over", async () => {
    const user = setup();

    await join(user, "  Gina Client ");

    expect(await screen.findByTestId("extension-connected")).toBeTruthy();
    expect(mocks.signInAnonymously).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("accept_invite", {
      p_token: TOKEN,
      p_display_name: "Gina Client",
    });
    expect(mocks.sendSessionToExtension).toHaveBeenCalledWith(EXTENSION_ID, {
      accessToken: "access",
      refreshToken: "refresh",
    });
    expect(mocks.forgetWebSession).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { name: "You joined Northwind Studio" })).toBeTruthy();
  });

  it("drops the web copy only after the extension accepted the session", async () => {
    const order: string[] = [];
    mocks.sendSessionToExtension.mockImplementation(() => {
      order.push("handoff");
      return Promise.resolve({ status: "ok" });
    });
    mocks.forgetWebSession.mockImplementation(() => {
      order.push("forget");
      return Promise.resolve(true);
    });
    const user = setup();

    await join(user);

    await screen.findByTestId("extension-connected");
    expect(order).toEqual(["handoff", "forget"]);
  });

  it("reuses an existing session instead of starting another guest", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: SESSION } });
    const user = setup();

    await join(user);

    await screen.findByTestId("extension-connected");
    expect(mocks.signInAnonymously).not.toHaveBeenCalled();
  });

  it("lists the sites with safe links and tells the guest to enable Sitenote there", async () => {
    const user = setup();

    await join(user);

    const link = await screen.findByRole("link", { name: "Open http://127.0.0.1:4173" });
    expect(link.getAttribute("href")).toBe("http://127.0.0.1:4173");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noreferrer");
    expect(screen.getByText("javascript:alert(1)")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /javascript/ })).toBeNull();
    expect(screen.getByText(/Click the Sitenote icon on that site and choose Enable/)).toBeTruthy();
  });

  it("warns when the web copy could not be cleared", async () => {
    mocks.forgetWebSession.mockResolvedValue(false);
    const user = setup();

    await join(user);

    expect(await screen.findByText(/still holds a copy of the guest session/)).toBeTruthy();
  });

  it("shows a fixed message when the guest session cannot be started", async () => {
    mocks.signInAnonymously.mockResolvedValue({ error: { message: "secret detail" } });
    const user = setup();

    await join(user);

    expect((await screen.findByRole("alert")).textContent).toBe(
      "We could not start a guest session. Try again.",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("secret detail");
  });

  it.each([
    ["22023", "This invite link is invalid or has expired."],
    ["XX000", "We could not accept the invite. Try again."],
  ])("maps the database error %s to a whitelisted message", async (code, message) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code, message: "secret detail" } });
    const user = setup();

    await join(user);

    expect((await screen.findByRole("alert")).textContent).toBe(message);
    expect(mocks.sendSessionToExtension).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Your name")).toHaveProperty("value", "Gina Client");
  });

  it("treats a thrown error like a failed request", async () => {
    mocks.rpc.mockRejectedValue(new Error("offline"));
    const user = setup();

    await join(user);

    expect((await screen.findByRole("alert")).textContent).toBe(
      "We could not accept the invite. Try again.",
    );
  });

  it("still joins when the sites cannot be listed", async () => {
    mocks.order.mockResolvedValue({ data: null, error: { message: "denied" } });
    const user = setup();

    await join(user);

    expect(await screen.findByTestId("extension-connected")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Sites to review" })).toBeNull();
  });
});

describe("handoff outcomes", () => {
  it("keeps the web session and shows install instructions when the extension is missing", async () => {
    mocks.sendSessionToExtension.mockResolvedValue({ status: "unavailable" });
    const user = setup();

    await join(user);

    expect(
      await screen.findByRole("heading", { name: "Install the Sitenote extension" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "You joined Northwind Studio" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Web Store/ })).toBeNull();
    expect(mocks.forgetWebSession).not.toHaveBeenCalled();
  });

  it("retries the handoff when the guest installed the extension", async () => {
    mocks.sendSessionToExtension.mockResolvedValueOnce({ status: "unavailable" });
    const user = setup();
    await join(user);

    await user.click(await screen.findByRole("button", { name: "I installed it — connect" }));

    expect(await screen.findByTestId("extension-connected")).toBeTruthy();
    expect(mocks.sendSessionToExtension).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.signInAnonymously).toHaveBeenCalledTimes(1);
    expect(mocks.forgetWebSession).toHaveBeenCalledOnce();
  });

  it("explains how to switch when the extension is signed in to an account", async () => {
    mocks.sendSessionToExtension.mockResolvedValue({
      status: "rejected",
      code: "already_signed_in",
    });
    const user = setup();

    await join(user);

    expect((await screen.findByRole("alert")).textContent).toContain("sign out");
    expect(screen.getByRole("button", { name: "Connect again" })).toBeTruthy();
    expect(mocks.forgetWebSession).not.toHaveBeenCalled();
  });

  it("offers another try when the extension rejects the session for another reason", async () => {
    mocks.sendSessionToExtension.mockResolvedValue({
      status: "rejected",
      code: "session_rejected",
    });
    const user = setup();

    await join(user);

    expect(await screen.findByRole("button", { name: "Try connecting again" })).toBeTruthy();
    expect(mocks.forgetWebSession).not.toHaveBeenCalled();
  });

  it("fails the handoff without sending anything when the session vanished", async () => {
    mocks.signInAnonymously.mockResolvedValue({ error: null });
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    const user = setup();

    await join(user);

    expect(await screen.findByRole("button", { name: "Try connecting again" })).toBeTruthy();
    expect(mocks.sendSessionToExtension).not.toHaveBeenCalled();
  });
});
