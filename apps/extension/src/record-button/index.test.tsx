import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ERROR_MESSAGES, failure, success } from "@sitenote/widget";
import { RecordButton } from ".";

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn<(request: { type: string }) => Promise<unknown>>(),
  getMediaStreamId: vi.fn<(options: { targetTabId: number }) => Promise<string>>(),
}));

vi.mock("../message-client", () => ({
  sendMessage: mocks.sendMessage,
}));

vi.mock("wxt/browser", () => ({
  browser: { tabCapture: { getMediaStreamId: mocks.getMediaStreamId } },
}));

const TAB_ID = 7;
const RECORD = /^Record$/;
const STOP = /^Stop recording$/;

function route(status: { state: "idle" | "recording" | "pending" } | "unavailable") {
  mocks.sendMessage.mockImplementation((request: { type: string }) => {
    if (request.type === "recording.status") {
      return Promise.resolve(
        status === "unavailable" ? failure("unavailable") : success({ state: status.state }),
      );
    }
    return Promise.resolve(success(null));
  });
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) {
    mock.mockReset();
  }
});

describe("RecordButton", () => {
  it("offers Record when the tab is idle or has a pending recording", async () => {
    route({ state: "pending" });

    render(<RecordButton tabId={TAB_ID} close={vi.fn()} />);

    expect(await screen.findByRole("button", { name: RECORD })).toBeTruthy();
    expect(mocks.sendMessage).toHaveBeenCalledWith({ type: "recording.status", tabId: TAB_ID });
  });

  it("captures the tab, starts the recording and closes the popup", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    route({ state: "idle" });
    mocks.getMediaStreamId.mockResolvedValue("stream-1");

    render(<RecordButton tabId={TAB_ID} close={close} />);
    await user.click(await screen.findByRole("button", { name: RECORD }));

    await waitFor(() => {
      expect(close).toHaveBeenCalledTimes(1);
    });
    expect(mocks.getMediaStreamId).toHaveBeenCalledWith({ targetTabId: TAB_ID });
    expect(mocks.sendMessage).toHaveBeenCalledWith({
      type: "recording.start",
      tabId: TAB_ID,
      streamId: "stream-1",
    });
    expect(screen.getByRole("status").textContent).toBe(
      "Recording started. Use Stop recording on the page.",
    );
  });

  it("says another recording is in progress when the tab is already captured", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    route({ state: "idle" });
    mocks.getMediaStreamId.mockRejectedValue(
      new Error("Cannot capture a tab with an active stream."),
    );

    render(<RecordButton tabId={TAB_ID} close={close} />);
    await user.click(await screen.findByRole("button", { name: RECORD }));

    expect((await screen.findByRole("alert")).textContent).toBe(ERROR_MESSAGES.recording_busy);
    expect(mocks.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "recording.start" }),
    );
    expect(close).not.toHaveBeenCalled();
  });

  it("says the recording could not start when the tab capture fails", async () => {
    const user = userEvent.setup();
    route({ state: "idle" });
    mocks.getMediaStreamId.mockRejectedValue(new Error("Permission denied"));

    render(<RecordButton tabId={TAB_ID} close={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: RECORD }));

    expect((await screen.findByRole("alert")).textContent).toBe(ERROR_MESSAGES.recording_failed);
  });

  it("shows the error from the background and keeps the popup open", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    route({ state: "idle" });
    mocks.getMediaStreamId.mockResolvedValue("stream-1");
    mocks.sendMessage.mockImplementation((request: { type: string }) =>
      Promise.resolve(
        request.type === "recording.status"
          ? success({ state: "idle" })
          : failure("recording_busy"),
      ),
    );

    render(<RecordButton tabId={TAB_ID} close={close} />);
    await user.click(await screen.findByRole("button", { name: RECORD }));

    expect((await screen.findByRole("alert")).textContent).toBe(ERROR_MESSAGES.recording_busy);
    expect(close).not.toHaveBeenCalled();
  });

  it("stops a running recording and refreshes its state", async () => {
    const user = userEvent.setup();
    route({ state: "recording" });

    render(<RecordButton tabId={TAB_ID} close={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: STOP }));

    expect(mocks.sendMessage).toHaveBeenCalledWith({ type: "recording.stop", tabId: TAB_ID });
    expect(mocks.getMediaStreamId).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(
        mocks.sendMessage.mock.calls.filter(([request]) => request.type === "recording.status"),
      ).toHaveLength(2);
    });
  });

  it("renders nothing when the recording status cannot be read", async () => {
    route("unavailable");

    const { container } = render(<RecordButton tabId={TAB_ID} close={vi.fn()} />);

    await waitFor(() => {
      expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    });
    expect(container.innerHTML).toBe("");
    expect(screen.queryByRole("button")).toBeNull();
  });
});
