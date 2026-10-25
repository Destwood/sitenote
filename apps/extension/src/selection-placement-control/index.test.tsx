import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ERROR_MESSAGES, failure, success } from "@sitenote/widget";
import { SelectionPlacementControl } from ".";

const mocks = vi.hoisted(() => ({ sendMessage: vi.fn() }));

vi.mock("../message-client", () => ({ sendMessage: mocks.sendMessage }));

beforeEach(() => {
  mocks.sendMessage.mockReset();
});

describe("SelectionPlacementControl", () => {
  it("shows the stored placement", async () => {
    mocks.sendMessage.mockResolvedValueOnce(success("above"));
    render(<SelectionPlacementControl />);

    const checkbox = screen.getByRole("checkbox", { name: "Button above" });
    await vi.waitFor(() => {
      expect(checkbox).toHaveProperty("checked", true);
    });
    expect(mocks.sendMessage).toHaveBeenCalledWith({ type: "preferences.getSelectionPlacement" });
  });

  it("keeps the button below when the stored placement cannot be read", async () => {
    mocks.sendMessage.mockResolvedValueOnce(failure("unavailable"));
    render(<SelectionPlacementControl />);

    await vi.waitFor(() => {
      expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole("checkbox", { name: "Button above" })).toHaveProperty("checked", false);
  });

  it("saves the placement when the user checks the box", async () => {
    const user = userEvent.setup();
    mocks.sendMessage.mockResolvedValueOnce(success("below"));
    mocks.sendMessage.mockResolvedValueOnce(success(null));
    render(<SelectionPlacementControl />);

    await user.click(screen.getByRole("checkbox", { name: "Button above" }));

    expect(mocks.sendMessage).toHaveBeenLastCalledWith({
      type: "preferences.setSelectionPlacement",
      placement: "above",
    });
  });

  it("saves below when the user unchecks the box", async () => {
    const user = userEvent.setup();
    mocks.sendMessage.mockResolvedValueOnce(success("above"));
    mocks.sendMessage.mockResolvedValueOnce(success(null));
    render(<SelectionPlacementControl />);
    const checkbox = screen.getByRole("checkbox", { name: "Button above" });
    await vi.waitFor(() => {
      expect(checkbox).toHaveProperty("checked", true);
    });

    await user.click(checkbox);

    expect(mocks.sendMessage).toHaveBeenLastCalledWith({
      type: "preferences.setSelectionPlacement",
      placement: "below",
    });
    expect(checkbox).toHaveProperty("checked", false);
  });

  it("reverts and shows the error when the placement cannot be saved", async () => {
    const user = userEvent.setup();
    mocks.sendMessage.mockResolvedValueOnce(success("below"));
    mocks.sendMessage.mockResolvedValueOnce(failure("unknown"));
    render(<SelectionPlacementControl />);
    const checkbox = screen.getByRole("checkbox", { name: "Button above" });

    await user.click(checkbox);

    expect((await screen.findByRole("alert")).textContent).toBe(ERROR_MESSAGES.unknown);
    expect(checkbox).toHaveProperty("checked", false);
  });
});
