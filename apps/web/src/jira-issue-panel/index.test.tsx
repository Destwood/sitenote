import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  linkJiraIssue: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("../supabase-browser", () => ({ getSupabaseBrowserClient: () => ({}) }));
vi.mock("../jira-api", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  linkJiraIssue: mocks.linkJiraIssue,
}));

import { COMMENT_MISSING_TEXT, INVALID_ISSUE_KEY_TEXT, JiraIssuePanel } from ".";

const THREAD_ID = "20000000-0000-4000-8000-000000000001";
const ISSUE_URL = "https://acme.atlassian.net/browse/PROJ-123";

beforeEach(() => {
  mocks.linkJiraIssue.mockResolvedValue({
    ok: true,
    data: { issueKey: "PROJ-123", issueUrl: ISSUE_URL, linked: true, commentAdded: true },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("JiraIssuePanel", () => {
  it("links to a linked issue in a new tab without offering to link another", () => {
    render(
      <JiraIssuePanel threadId={THREAD_ID} issueKey="PROJ-123" issueUrl={ISSUE_URL} canLink />,
    );
    const link = screen.getByRole("link", { name: "PROJ-123" });
    expect(link.getAttribute("href")).toBe(ISSUE_URL);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByLabelText("Jira issue key")).toBeNull();
  });

  it("does not link an issue address that is not http or https", () => {
    render(
      <JiraIssuePanel
        threadId={THREAD_ID}
        issueKey="PROJ-123"
        issueUrl="javascript:alert(1)"
        canLink={false}
      />,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("PROJ-123")).toBeTruthy();
  });

  it("renders nothing for a guest or when Jira is not configured", () => {
    const { container } = render(
      <JiraIssuePanel threadId={THREAD_ID} issueKey={null} issueUrl={null} canLink={false} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("offers a key field for an unlinked thread when Jira is configured", () => {
    render(<JiraIssuePanel threadId={THREAD_ID} issueKey={null} issueUrl={null} canLink />);
    expect(screen.getByLabelText("Jira issue key").getAttribute("placeholder")).toBe("PROJ-123");
    expect(screen.getByRole("button", { name: "Link issue" })).toBeTruthy();
  });

  it("normalizes the typed key, links the issue and then refreshes the page", async () => {
    render(<JiraIssuePanel threadId={THREAD_ID} issueKey={null} issueUrl={null} canLink />);
    fireEvent.change(screen.getByLabelText("Jira issue key"), { target: { value: " proj-123 " } });
    fireEvent.click(screen.getByRole("button", { name: "Link issue" }));

    expect(await screen.findByRole("link", { name: "PROJ-123" })).toBeTruthy();
    expect(mocks.linkJiraIssue).toHaveBeenCalledWith({}, THREAD_ID, "PROJ-123");
    expect(mocks.refresh).toHaveBeenCalled();
    expect(screen.queryByText(COMMENT_MISSING_TEXT)).toBeNull();
  });

  it("rejects a malformed key without calling Jira", async () => {
    render(<JiraIssuePanel threadId={THREAD_ID} issueKey={null} issueUrl={null} canLink />);
    fireEvent.change(screen.getByLabelText("Jira issue key"), { target: { value: "PROJ" } });
    fireEvent.click(screen.getByRole("button", { name: "Link issue" }));

    expect((await screen.findByRole("alert")).textContent).toBe(INVALID_ISSUE_KEY_TEXT);
    expect(mocks.linkJiraIssue).not.toHaveBeenCalled();
  });

  it("says when the issue was linked but the comment was not added", async () => {
    mocks.linkJiraIssue.mockResolvedValueOnce({
      ok: true,
      data: { issueKey: "PROJ-123", issueUrl: ISSUE_URL, linked: true, commentAdded: false },
    });
    render(<JiraIssuePanel threadId={THREAD_ID} issueKey={null} issueUrl={null} canLink />);
    fireEvent.change(screen.getByLabelText("Jira issue key"), { target: { value: "PROJ-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Link issue" }));

    expect(await screen.findByText(COMMENT_MISSING_TEXT)).toBeTruthy();
    expect(screen.getByRole("link", { name: "PROJ-123" })).toBeTruthy();
  });

  it("shows the reason when Jira cannot find the issue and keeps the field", async () => {
    mocks.linkJiraIssue.mockResolvedValueOnce({
      ok: false,
      message: "The Jira issue was not found",
      code: "not_found",
    });
    render(<JiraIssuePanel threadId={THREAD_ID} issueKey={null} issueUrl={null} canLink />);
    fireEvent.change(screen.getByLabelText("Jira issue key"), { target: { value: "PROJ-999" } });
    fireEvent.click(screen.getByRole("button", { name: "Link issue" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("The Jira issue was not found");
    expect(alert.getAttribute("data-error-code")).toBe("not_found");
    expect(screen.getByLabelText<HTMLInputElement>("Jira issue key").value).toBe("PROJ-999");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("disables the button while the issue is being linked", async () => {
    mocks.linkJiraIssue.mockImplementationOnce(() => new Promise(() => undefined));
    render(<JiraIssuePanel threadId={THREAD_ID} issueKey={null} issueUrl={null} canLink />);
    fireEvent.change(screen.getByLabelText("Jira issue key"), { target: { value: "PROJ-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Link issue" }));

    await waitFor(() => {
      expect(
        screen.getByRole<HTMLButtonElement>("button", { name: "Linking the Jira issue" }).disabled,
      ).toBe(true);
    });
  });
});
