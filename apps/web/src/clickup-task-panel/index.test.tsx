import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  createClickUpTask: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("../supabase-browser", () => ({ getSupabaseBrowserClient: () => ({}) }));
vi.mock("../clickup-api", () => ({ createClickUpTask: mocks.createClickUpTask }));

import { ClickUpTaskPanel, SCREENSHOT_MISSING_TEXT } from ".";

const THREAD_ID = "20000000-0000-4000-8000-000000000001";
const TASK_URL = "https://app.clickup.com/t/86abc";

beforeEach(() => {
  mocks.createClickUpTask.mockResolvedValue({
    ok: true,
    data: { taskId: "86abc", taskUrl: TASK_URL, created: true, screenshotAttached: true },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ClickUpTaskPanel", () => {
  it("links to an existing task in a new tab without offering to create another", () => {
    render(<ClickUpTaskPanel threadId={THREAD_ID} taskUrl={TASK_URL} canCreate />);
    const link = screen.getByRole("link", { name: "Open in ClickUp" });
    expect(link.getAttribute("href")).toBe(TASK_URL);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders nothing for a guest or when ClickUp is not configured", () => {
    const { container } = render(
      <ClickUpTaskPanel threadId={THREAD_ID} taskUrl={null} canCreate={false} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("creates the task, shows the link and refreshes the page", async () => {
    render(<ClickUpTaskPanel threadId={THREAD_ID} taskUrl={null} canCreate />);
    fireEvent.click(screen.getByRole("button", { name: "Create ClickUp task" }));

    expect(await screen.findByRole("link", { name: "Open in ClickUp" })).toBeTruthy();
    expect(mocks.createClickUpTask).toHaveBeenCalledWith({}, THREAD_ID);
    expect(mocks.refresh).toHaveBeenCalled();
    expect(screen.queryByText(SCREENSHOT_MISSING_TEXT)).toBeNull();
  });

  it("says when the task was created without its screenshot", async () => {
    mocks.createClickUpTask.mockResolvedValueOnce({
      ok: true,
      data: { taskId: "86abc", taskUrl: TASK_URL, created: true, screenshotAttached: false },
    });
    render(<ClickUpTaskPanel threadId={THREAD_ID} taskUrl={null} canCreate />);
    fireEvent.click(screen.getByRole("button", { name: "Create ClickUp task" }));

    expect(await screen.findByText(SCREENSHOT_MISSING_TEXT)).toBeTruthy();
  });

  it("shows the error and retries on the same button", async () => {
    mocks.createClickUpTask.mockResolvedValueOnce({
      ok: false,
      message: "ClickUp did not answer in time",
    });
    render(<ClickUpTaskPanel threadId={THREAD_ID} taskUrl={null} canCreate />);
    fireEvent.click(screen.getByRole("button", { name: "Create ClickUp task" }));

    expect((await screen.findByRole("alert")).textContent).toBe("ClickUp did not answer in time");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Open in ClickUp" })).toBeTruthy();
    });
    expect(mocks.createClickUpTask).toHaveBeenCalledTimes(2);
  });
});
