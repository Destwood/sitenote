import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ClickUpTask } from ".";

const TASK_URL = "https://app.clickup.com/t/86abc";

describe("ClickUpTask", () => {
  it("shows a link to the task in a new tab", () => {
    render(<ClickUpTask taskUrl={TASK_URL} canCreate pending={false} onCreate={vi.fn()} />);
    const link = screen.getByRole("link", { name: "ClickUp task" });
    expect(link.getAttribute("href")).toBe(TASK_URL);
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("does not link a task address that is not https", () => {
    const { container } = render(
      <ClickUpTask taskUrl="javascript:alert(1)" canCreate pending={false} onCreate={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("offers to create a task only when the viewer may", () => {
    const onCreate = vi.fn();
    const { rerender } = render(
      <ClickUpTask taskUrl={null} canCreate={false} pending={false} onCreate={onCreate} />,
    );
    expect(screen.queryByRole("button")).toBeNull();

    rerender(<ClickUpTask taskUrl={null} canCreate pending={false} onCreate={onCreate} />);
    fireEvent.click(screen.getByRole("button", { name: "Create ClickUp task" }));
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("disables the button while the task is being created", () => {
    render(<ClickUpTask taskUrl={null} canCreate pending onCreate={vi.fn()} />);
    const button = screen.getByRole<HTMLButtonElement>("button", {
      name: "Creating the ClickUp task",
    });
    expect(button.disabled).toBe(true);
  });
});
