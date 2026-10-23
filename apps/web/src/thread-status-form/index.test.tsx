import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../thread-actions", () => ({
  setThreadStatus: vi.fn(),
}));

import { ThreadStatusForm } from ".";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const THREAD_ID = "20000000-0000-4000-8000-000000000001";

describe("ThreadStatusForm", () => {
  it("offers to resolve an open thread and sends the resolved status", () => {
    const { container } = render(
      <ThreadStatusForm workspaceId={WORKSPACE_ID} threadId={THREAD_ID} status="open" />,
    );

    expect(screen.getByRole("button", { name: "Resolve thread" })).toBeTruthy();
    expect(container.querySelector('input[name="status"]')?.getAttribute("value")).toBe("resolved");
    expect(container.querySelector('input[name="threadId"]')?.getAttribute("value")).toBe(
      THREAD_ID,
    );
  });

  it("offers to reopen a resolved thread and sends the open status", () => {
    const { container } = render(
      <ThreadStatusForm workspaceId={WORKSPACE_ID} threadId={THREAD_ID} status="resolved" />,
    );

    expect(screen.getByRole("button", { name: "Reopen thread" })).toBeTruthy();
    expect(container.querySelector('input[name="status"]')?.getAttribute("value")).toBe("open");
  });
});
