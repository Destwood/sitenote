import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const CLIENT = { marker: "demo-client" };

const mocks = vi.hoisted(() => ({
  readVisitorName: vi.fn(),
  startVisit: vi.fn(),
  enterSite: vi.fn(),
  mountWidget: vi.fn(),
  handle: { unmount: vi.fn(), setCommentMode: vi.fn(), openThread: vi.fn() },
}));

vi.mock("../demo-client", () => ({ getDemoSupabaseClient: () => CLIENT }));
vi.mock("../demo-backend", () => ({ createDemoBackend: () => ({}) }));
vi.mock("../demo-screenshot", () => ({ createDemoScreenshots: () => ({}) }));
vi.mock("../demo-session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../demo-session")>()),
  readVisitorName: mocks.readVisitorName,
  startVisit: mocks.startVisit,
  enterSite: mocks.enterSite,
}));
vi.mock("@sitenote/widget", () => ({ mountWidget: mocks.mountWidget }));

import { DemoExperience } from ".";

const BANNER = "Live demo — anyone can comment. Everything resets daily.";
const NAME_ERROR = "Enter a name of 1 to 40 characters.";
const SESSION_ERROR = "We could not start the demo. Try again.";

function renderDemo() {
  return render(
    <DemoExperience>
      <p>Sample page</p>
    </DemoExperience>,
  );
}

function startButton() {
  return screen.getByRole("button", { name: "Start commenting" });
}

function dialog() {
  return screen.getByRole("dialog", { name: "Choose the name your comments show" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readVisitorName.mockResolvedValue(null);
  mocks.startVisit.mockResolvedValue(undefined);
  mocks.enterSite.mockResolvedValue(undefined);
  mocks.mountWidget.mockReturnValue(mocks.handle);
});

describe("DemoExperience", () => {
  it("shows the banner and the sample page, and asks for a name before the widget starts", async () => {
    renderDemo();
    expect(screen.getByText(BANNER)).toBeTruthy();
    expect(screen.getByText("Sample page")).toBeTruthy();
    await waitFor(() => {
      expect(startButton().hasAttribute("disabled")).toBe(false);
    });
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(startButton());

    expect(dialog()).toBeTruthy();
    expect(mocks.mountWidget).not.toHaveBeenCalled();
  });

  it("starts the visit with the trimmed name and turns comment mode on", async () => {
    renderDemo();
    await waitFor(() => {
      expect(startButton().hasAttribute("disabled")).toBe(false);
    });
    await userEvent.click(startButton());
    await userEvent.type(screen.getByLabelText("Your name"), "  Demo Dana ");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Start commenting" }));

    await waitFor(() => {
      expect(mocks.mountWidget).toHaveBeenCalledOnce();
    });
    expect(mocks.startVisit).toHaveBeenCalledWith(CLIENT, "Demo Dana");
    expect(mocks.enterSite).toHaveBeenCalledWith(CLIENT, window.location.origin);
    expect(mocks.handle.setCommentMode).toHaveBeenCalledWith(true);
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("refuses a blank name and does not start a visit", async () => {
    renderDemo();
    await waitFor(() => {
      expect(startButton().hasAttribute("disabled")).toBe(false);
    });
    await userEvent.click(startButton());
    await userEvent.type(screen.getByLabelText("Your name"), "   ");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Start commenting" }));

    expect(screen.getByRole("alert").textContent).toBe(NAME_ERROR);
    expect(mocks.startVisit).not.toHaveBeenCalled();
    expect(mocks.mountWidget).not.toHaveBeenCalled();
  });

  it("keeps the dialog open and explains the failure when the visit cannot start", async () => {
    mocks.startVisit.mockRejectedValue(new Error("denied"));
    renderDemo();
    await waitFor(() => {
      expect(startButton().hasAttribute("disabled")).toBe(false);
    });
    await userEvent.click(startButton());
    await userEvent.type(screen.getByLabelText("Your name"), "Dana");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Start commenting" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(SESSION_ERROR);
    });
    expect(dialog()).toBeTruthy();
    expect(mocks.mountWidget).not.toHaveBeenCalled();
  });

  it("resumes a saved visit without asking for the name again", async () => {
    mocks.readVisitorName.mockResolvedValue("Dana");
    renderDemo();

    await waitFor(() => {
      expect(mocks.mountWidget).toHaveBeenCalledOnce();
    });
    expect(mocks.startVisit).toHaveBeenCalledWith(CLIENT, "Dana");
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(startButton());

    expect(mocks.handle.setCommentMode).toHaveBeenCalledWith(true);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("treats an unreadable saved session as a new visitor", async () => {
    mocks.readVisitorName.mockRejectedValue(new Error("unavailable"));
    renderDemo();
    await waitFor(() => {
      expect(startButton().hasAttribute("disabled")).toBe(false);
    });
    await userEvent.click(startButton());
    expect(dialog()).toBeTruthy();
    expect(mocks.mountWidget).not.toHaveBeenCalled();
  });

  it("closes the name step with Escape", async () => {
    renderDemo();
    await waitFor(() => {
      expect(startButton().hasAttribute("disabled")).toBe(false);
    });
    await userEvent.click(startButton());
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("unmounts the widget when the page is left", async () => {
    mocks.readVisitorName.mockResolvedValue("Dana");
    const { unmount } = renderDemo();
    await waitFor(() => {
      expect(mocks.mountWidget).toHaveBeenCalledOnce();
    });
    unmount();
    expect(mocks.handle.unmount).toHaveBeenCalledOnce();
  });
});
