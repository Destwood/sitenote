import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { failure, success } from "@sitenote/widget";
import { AllowedSitesPanel } from ".";

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  listOriginAccess: vi.fn(),
}));

vi.mock("../message-client", () => ({ sendMessage: mocks.sendMessage }));
vi.mock("../tab-access", () => ({ listOriginAccess: mocks.listOriginAccess }));

beforeEach(() => {
  mocks.sendMessage.mockReset();
  mocks.listOriginAccess.mockReset();
});

describe("AllowedSitesPanel", () => {
  it("stays collapsed until the toggle is pressed", async () => {
    const user = userEvent.setup();
    mocks.listOriginAccess.mockResolvedValue(["https://example.test"]);
    render(<AllowedSitesPanel onChanged={vi.fn()} />);

    const toggle = screen.getByRole("button", { name: "Allowed sites" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("list", { name: "Allowed sites" })).toBeNull();
    expect(mocks.listOriginAccess).not.toHaveBeenCalled();

    await user.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect((await screen.findByRole("list", { name: "Allowed sites" })).textContent).toContain(
      "https://example.test",
    );
  });

  it("says when there are no allowed sites", async () => {
    const user = userEvent.setup();
    mocks.listOriginAccess.mockResolvedValue([]);
    render(<AllowedSitesPanel onChanged={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Allowed sites" }));

    expect((await screen.findByText("No allowed sites yet.")).textContent).toBe(
      "No allowed sites yet.",
    );
  });

  it("removes a site, reloads the list and reports the change", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    let origins = ["https://alpha.test", "https://beta.test"];
    mocks.listOriginAccess.mockImplementation(() => Promise.resolve([...origins]));
    mocks.sendMessage.mockImplementation(() => {
      origins = ["https://beta.test"];
      return Promise.resolve(success(null));
    });
    render(<AllowedSitesPanel onChanged={onChanged} />);
    await user.click(screen.getByRole("button", { name: "Allowed sites" }));

    await user.click(await screen.findByRole("button", { name: "Remove https://alpha.test" }));

    await vi.waitFor(() => {
      expect(screen.queryByText("https://alpha.test")).toBeNull();
    });
    expect(mocks.sendMessage).toHaveBeenCalledWith({
      type: "sites.disable",
      origin: "https://alpha.test",
    });
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("shows the fixed message and keeps the list when removing fails", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    mocks.listOriginAccess.mockResolvedValue(["https://alpha.test"]);
    mocks.sendMessage.mockResolvedValue(failure("unknown"));
    render(<AllowedSitesPanel onChanged={onChanged} />);
    await user.click(screen.getByRole("button", { name: "Allowed sites" }));

    await user.click(await screen.findByRole("button", { name: "Remove https://alpha.test" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Something went wrong. Try again.");
    expect(screen.getByText("https://alpha.test")).toBeTruthy();
    expect(onChanged).not.toHaveBeenCalled();
  });
});
