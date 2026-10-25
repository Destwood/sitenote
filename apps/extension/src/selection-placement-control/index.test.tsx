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

    const select = screen.getByRole("combobox", { name: "Comment button" });
    await vi.waitFor(() => {
      expect(select).toHaveProperty("value", "above");
    });
    expect(mocks.sendMessage).toHaveBeenCalledWith({ type: "preferences.getSelectionPlacement" });
  });

  it("keeps below when the stored placement cannot be read", async () => {
    mocks.sendMessage.mockResolvedValueOnce(failure("unavailable"));
    render(<SelectionPlacementControl />);

    await vi.waitFor(() => {
      expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole("combobox", { name: "Comment button" })).toHaveProperty(
      "value",
      "below",
    );
  });

  it("saves the placement when the user picks an option", async () => {
    const user = userEvent.setup();
    mocks.sendMessage.mockResolvedValueOnce(success("below"));
    mocks.sendMessage.mockResolvedValueOnce(success(null));
    render(<SelectionPlacementControl />);

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Comment button" }),
      "Above selection",
    );

    expect(mocks.sendMessage).toHaveBeenLastCalledWith({
      type: "preferences.setSelectionPlacement",
      placement: "above",
    });
  });

  it("reverts and shows the error when the placement cannot be saved", async () => {
    const user = userEvent.setup();
    mocks.sendMessage.mockResolvedValueOnce(success("below"));
    mocks.sendMessage.mockResolvedValueOnce(failure("unknown"));
    render(<SelectionPlacementControl />);
    const select = screen.getByRole("combobox", { name: "Comment button" });

    await user.selectOptions(select, "Above selection");

    expect((await screen.findByRole("alert")).textContent).toBe(ERROR_MESSAGES.unknown);
    expect(select).toHaveProperty("value", "below");
  });
});
