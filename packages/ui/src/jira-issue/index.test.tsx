import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { JiraIssue } from ".";

const ISSUE_URL = "https://org.atlassian.net/browse/PROJ-12";

describe("JiraIssue", () => {
  it("shows a link to the issue in a new tab", () => {
    render(
      <JiraIssue
        issueKey="PROJ-12"
        issueUrl={ISSUE_URL}
        canLink
        pending={false}
        onLink={vi.fn()}
      />,
    );
    const link = screen.getByRole("link", { name: "Jira PROJ-12" });
    expect(link.getAttribute("href")).toBe(ISSUE_URL);
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("does not link an issue address that is not https", () => {
    const { container } = render(
      <JiraIssue
        issueKey="PROJ-12"
        issueUrl="javascript:alert(1)"
        canLink
        pending={false}
        onLink={vi.fn()}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("offers to link an issue only when the viewer may", () => {
    const onLink = vi.fn();
    const { container, rerender } = render(
      <JiraIssue issueKey={null} issueUrl={null} canLink={false} pending={false} onLink={onLink} />,
    );
    expect(container.innerHTML).toBe("");

    rerender(<JiraIssue issueKey={null} issueUrl={null} canLink pending={false} onLink={onLink} />);
    expect(screen.getByRole("textbox", { name: "Jira issue key" })).toBeTruthy();
  });

  it("sends the normalized issue key", () => {
    const onLink = vi.fn();
    render(<JiraIssue issueKey={null} issueUrl={null} canLink pending={false} onLink={onLink} />);
    const button = screen.getByRole<HTMLButtonElement>("button", { name: "Link Jira issue" });
    expect(button.disabled).toBe(true);

    fireEvent.change(screen.getByRole("textbox", { name: "Jira issue key" }), {
      target: { value: "  proj-12 " },
    });
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(onLink).toHaveBeenCalledWith("PROJ-12");
  });

  it("keeps the button disabled for a malformed key", () => {
    render(<JiraIssue issueKey={null} issueUrl={null} canLink pending={false} onLink={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Jira issue key" }), {
      target: { value: "PROJ12" },
    });
    const button = screen.getByRole<HTMLButtonElement>("button", { name: "Link Jira issue" });
    expect(button.disabled).toBe(true);
  });

  it("disables the button while the issue is being linked", () => {
    render(<JiraIssue issueKey={null} issueUrl={null} canLink pending onLink={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Jira issue key" }), {
      target: { value: "PROJ-1" },
    });
    const button = screen.getByRole<HTMLButtonElement>("button", {
      name: "Linking the Jira issue",
    });
    expect(button.disabled).toBe(true);
  });
});
