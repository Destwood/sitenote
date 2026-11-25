import { act, render, screen, waitFor } from "@testing-library/react";
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

function route(
  status: { state: "idle" | "recording" | "pending" } | "unavailable",
  placement = "end",
) {
  mocks.sendMessage.mockImplementation((request: { type: string }) => {
    if (request.type === "preferences.getRecordingPlacement") {
      return Promise.resolve(success(placement));
    }
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
  it("defaults to At start, prepares the recording without capture and closes on success", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    route({ state: "idle" }, "start");
    render(<RecordButton tabId={TAB_ID} close={close} />);
    await user.click(await screen.findByRole("button", { name: "Attach comment" }));
    expect(
      screen.getByRole("menuitemradio", { name: "At start" }).getAttribute("aria-checked"),
    ).toBe("true");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: RECORD }));
    expect(mocks.sendMessage).toHaveBeenCalledWith({ type: "recording.prepare", tabId: TAB_ID });
    expect(mocks.getMediaStreamId).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it("only saves the preference when choosing At end and restores that selection", async () => {
    const user = userEvent.setup();
    route({ state: "idle" }, "start");
    render(<RecordButton tabId={TAB_ID} close={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Attach comment" }));
    expect(
      screen.getByRole("menuitemradio", { name: "At start" }).getAttribute("aria-checked"),
    ).toBe("true");
    await user.click(screen.getByRole("menuitemradio", { name: "At end" }));
    expect(mocks.sendMessage).toHaveBeenCalledWith({
      type: "preferences.setRecordingPlacement",
      placement: "end",
    });
    expect(mocks.sendMessage.mock.calls.map(([request]) => request.type)).toEqual([
      "recording.status",
      "preferences.getRecordingPlacement",
      "preferences.setRecordingPlacement",
    ]);
    expect(mocks.getMediaStreamId).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Attach comment" }));
    expect(screen.getByRole("menuitemradio", { name: "At end" }).getAttribute("aria-checked")).toBe(
      "true",
    );
  });

  it("does not replace a user's choice with a late stored preference", async () => {
    const user = userEvent.setup();
    let resolvePreference: (value: unknown) => void = () => undefined;
    const loaded = new Promise((resolve) => {
      resolvePreference = resolve;
    });
    mocks.sendMessage.mockImplementation((request) =>
      request.type === "preferences.getRecordingPlacement"
        ? loaded
        : Promise.resolve(success(request.type === "recording.status" ? { state: "idle" } : null)),
    );
    render(<RecordButton tabId={TAB_ID} close={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Attach comment" }));
    await user.click(screen.getByRole("menuitemradio", { name: "At end" }));
    await act(async () => {
      resolvePreference(success("start"));
      await loaded;
    });
    await user.click(screen.getByRole("button", { name: "Attach comment" }));
    expect(screen.getByRole("menuitemradio", { name: "At end" }).getAttribute("aria-checked")).toBe(
      "true",
    );
  });

  it("keeps the selected placement and shows a notice when saving fails", async () => {
    const user = userEvent.setup();
    mocks.sendMessage.mockImplementation((request) =>
      Promise.resolve(
        request.type === "preferences.setRecordingPlacement"
          ? failure("unknown")
          : request.type === "preferences.getRecordingPlacement"
            ? success("start")
            : success({ state: "idle" }),
      ),
    );
    render(<RecordButton tabId={TAB_ID} close={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Attach comment" }));
    await user.click(screen.getByRole("menuitemradio", { name: "At end" }));
    expect((await screen.findByRole("alert")).textContent).toBe(ERROR_MESSAGES.unknown);
    await user.click(screen.getByRole("button", { name: "Attach comment" }));
    expect(screen.getByRole("menuitemradio", { name: "At end" }).getAttribute("aria-checked")).toBe(
      "true",
    );
  });

  it("shows preference load failures while keeping the default start choice", async () => {
    const user = userEvent.setup();
    mocks.sendMessage.mockImplementation((request) =>
      Promise.resolve(
        request.type === "preferences.getRecordingPlacement"
          ? failure("unknown")
          : success({ state: "idle" }),
      ),
    );
    render(<RecordButton tabId={TAB_ID} close={vi.fn()} />);
    expect((await screen.findByRole("alert")).textContent).toBe(ERROR_MESSAGES.unknown);
    await user.click(screen.getByRole("button", { name: "Attach comment" }));
    expect(
      screen.getByRole("menuitemradio", { name: "At start" }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("shows prepare failures, keeps the popup open and allows retry", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    mocks.sendMessage.mockImplementation((request) =>
      Promise.resolve(
        request.type === "recording.prepare"
          ? failure("recording_failed")
          : request.type === "preferences.getRecordingPlacement"
            ? success("start")
            : success({ state: "idle" }),
      ),
    );
    render(<RecordButton tabId={TAB_ID} close={close} />);
    await user.click(await screen.findByRole("button", { name: RECORD }));
    expect((await screen.findByRole("alert")).textContent).toBe(ERROR_MESSAGES.recording_failed);
    await user.click(screen.getByRole("button", { name: RECORD }));
    expect(
      mocks.sendMessage.mock.calls.filter(([request]) => request.type === "recording.prepare"),
    ).toHaveLength(2);
    expect(close).not.toHaveBeenCalled();
    expect(mocks.getMediaStreamId).not.toHaveBeenCalled();
  });

  it("disables both idle actions during preparation to prevent duplicate recording", async () => {
    const user = userEvent.setup();
    route({ state: "idle" }, "start");
    const onRecordAtStart = vi.fn(
      () => new Promise<ReturnType<typeof success<null>>>(() => undefined),
    );
    render(<RecordButton tabId={TAB_ID} close={vi.fn()} onRecordAtStart={onRecordAtStart} />);
    const record = await screen.findByRole("button", { name: RECORD });
    await user.dblClick(record);
    expect(onRecordAtStart).toHaveBeenCalledExactlyOnceWith(TAB_ID);
    expect(record.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Attach comment" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

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
          : request.type === "preferences.getRecordingPlacement"
            ? success("end")
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

    expect(screen.queryByRole("button", { name: "Attach comment" })).toBeNull();
    expect(mocks.sendMessage).toHaveBeenCalledWith({ type: "recording.stop", tabId: TAB_ID });
    expect(mocks.getMediaStreamId).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(
        mocks.sendMessage.mock.calls.filter(([request]) => request.type === "recording.status"),
      ).toHaveLength(2);
    });
  });

  it("shows stop errors and keeps the popup open", async () => {
    const close = vi.fn();
    mocks.sendMessage.mockImplementation((request) =>
      Promise.resolve(
        request.type === "recording.stop"
          ? failure("recording_failed")
          : request.type === "preferences.getRecordingPlacement"
            ? success("end")
            : success({ state: "recording" }),
      ),
    );
    render(<RecordButton tabId={TAB_ID} close={close} />);
    await userEvent.click(await screen.findByRole("button", { name: STOP }));
    expect((await screen.findByRole("alert")).textContent).toBe(ERROR_MESSAGES.recording_failed);
    expect(close).not.toHaveBeenCalled();
  });

  it("renders nothing when the recording status cannot be read", async () => {
    route("unavailable");

    const { container } = render(<RecordButton tabId={TAB_ID} close={vi.fn()} />);

    await waitFor(() => {
      expect(mocks.sendMessage).toHaveBeenCalledTimes(2);
    });
    expect(container.innerHTML).toBe("");
    expect(screen.queryByRole("button")).toBeNull();
  });
});
