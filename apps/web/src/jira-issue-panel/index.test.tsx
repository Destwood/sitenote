import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  linkJiraIssue: vi.fn(),
  searchJiraIssues: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("../supabase-browser", () => ({ getSupabaseBrowserClient: () => ({}) }));
vi.mock("../jira-api", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  linkJiraIssue: mocks.linkJiraIssue,
  searchJiraIssues: mocks.searchJiraIssues,
}));

import { INVALID_ISSUE_KEY_TEXT, JiraIssuePanel, LINK_MISSING_TEXT } from ".";

const THREAD_ID = "20000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const ISSUE_URL = "https://acme.atlassian.net/browse/PROJ-123";
const ISSUE = {
  key: "PROJ-123",
  summary: "Fix login",
  status: "To Do",
  projectKey: "PROJ",
  projectName: "Project",
  url: ISSUE_URL,
};

function searchBox() {
  return screen.getByRole<HTMLInputElement>("combobox", { name: "Search Jira issues" });
}

beforeEach(() => {
  mocks.linkJiraIssue.mockResolvedValue({
    ok: true,
    data: { issueKey: "PROJ-123", issueUrl: ISSUE_URL, linked: true, linkAdded: true },
  });
  mocks.searchJiraIssues.mockResolvedValue({ ok: true, issues: [ISSUE], projects: [] });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("JiraIssuePanel", () => {
  it("links to a linked issue in a new tab without offering to link another", () => {
    render(
      <JiraIssuePanel
        threadId={THREAD_ID}
        workspaceId={WORKSPACE_ID}
        issueKey="PROJ-123"
        issueUrl={ISSUE_URL}
        canLink
      />,
    );
    const link = screen.getByRole("link", { name: "PROJ-123" });
    expect(link.getAttribute("href")).toBe(ISSUE_URL);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("does not link an issue address that is not http or https", () => {
    render(
      <JiraIssuePanel
        threadId={THREAD_ID}
        workspaceId={WORKSPACE_ID}
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
      <JiraIssuePanel
        threadId={THREAD_ID}
        workspaceId={WORKSPACE_ID}
        issueKey={null}
        issueUrl={null}
        canLink={false}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("offers a search for an unlinked thread when Jira is configured", () => {
    render(
      <JiraIssuePanel
        threadId={THREAD_ID}
        workspaceId={WORKSPACE_ID}
        issueKey={null}
        issueUrl={null}
        canLink
      />,
    );
    expect(searchBox().getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByLabelText("Jira project")).toBeTruthy();
  });

  it("searches as the user types, then links the chosen issue and refreshes the page", async () => {
    render(
      <JiraIssuePanel
        threadId={THREAD_ID}
        workspaceId={WORKSPACE_ID}
        issueKey={null}
        issueUrl={null}
        canLink
      />,
    );
    fireEvent.change(searchBox(), { target: { value: "fix" } });

    fireEvent.click(await screen.findByRole("option", { name: /PROJ-123/ }));

    expect(await screen.findByRole("link", { name: "PROJ-123" })).toBeTruthy();
    expect(mocks.searchJiraIssues).toHaveBeenCalledWith({}, WORKSPACE_ID, "fix", undefined, true);
    expect(mocks.linkJiraIssue).toHaveBeenCalledWith({}, THREAD_ID, "PROJ-123");
    expect(mocks.refresh).toHaveBeenCalled();
    expect(screen.queryByText(LINK_MISSING_TEXT)).toBeNull();
  });

  it("links a typed issue key on Enter when no result is highlighted", async () => {
    mocks.searchJiraIssues.mockResolvedValue({ ok: true, issues: [], projects: [] });
    render(
      <JiraIssuePanel
        threadId={THREAD_ID}
        workspaceId={WORKSPACE_ID}
        issueKey={null}
        issueUrl={null}
        canLink
      />,
    );
    fireEvent.change(searchBox(), { target: { value: " proj-123 " } });
    fireEvent.keyDown(searchBox(), { key: "Enter" });

    expect(await screen.findByRole("link", { name: "PROJ-123" })).toBeTruthy();
    expect(mocks.linkJiraIssue).toHaveBeenCalledWith({}, THREAD_ID, "PROJ-123");
  });

  it("rejects text that is not an issue key on Enter without calling Jira", async () => {
    render(
      <JiraIssuePanel
        threadId={THREAD_ID}
        workspaceId={WORKSPACE_ID}
        issueKey={null}
        issueUrl={null}
        canLink
      />,
    );
    fireEvent.change(searchBox(), { target: { value: "PROJ" } });
    fireEvent.keyDown(searchBox(), { key: "Enter" });

    expect((await screen.findByRole("alert")).textContent).toBe(INVALID_ISSUE_KEY_TEXT);
    expect(mocks.linkJiraIssue).not.toHaveBeenCalled();
  });

  it("says when the issue was linked but the link was not added", async () => {
    mocks.linkJiraIssue.mockResolvedValueOnce({
      ok: true,
      data: { issueKey: "PROJ-123", issueUrl: ISSUE_URL, linked: true, linkAdded: false },
    });
    render(
      <JiraIssuePanel
        threadId={THREAD_ID}
        workspaceId={WORKSPACE_ID}
        issueKey={null}
        issueUrl={null}
        canLink
      />,
    );
    fireEvent.change(searchBox(), { target: { value: "PROJ-123" } });
    fireEvent.keyDown(searchBox(), { key: "Enter" });

    expect(await screen.findByText(LINK_MISSING_TEXT)).toBeTruthy();
    expect(screen.getByRole("link", { name: "PROJ-123" })).toBeTruthy();
  });

  it("shows the reason when Jira cannot find the issue and keeps the search text", async () => {
    mocks.linkJiraIssue.mockResolvedValueOnce({
      ok: false,
      message: "The Jira issue was not found",
      code: "not_found",
    });
    render(
      <JiraIssuePanel
        threadId={THREAD_ID}
        workspaceId={WORKSPACE_ID}
        issueKey={null}
        issueUrl={null}
        canLink
      />,
    );
    fireEvent.change(searchBox(), { target: { value: "PROJ-999" } });
    fireEvent.keyDown(searchBox(), { key: "Enter" });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("The Jira issue was not found");
    expect(alert.getAttribute("data-error-code")).toBe("not_found");
    expect(searchBox().value).toBe("PROJ-999");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("shows that the issue is being linked and locks the search while it waits", async () => {
    mocks.linkJiraIssue.mockImplementationOnce(() => new Promise(() => undefined));
    render(
      <JiraIssuePanel
        threadId={THREAD_ID}
        workspaceId={WORKSPACE_ID}
        issueKey={null}
        issueUrl={null}
        canLink
      />,
    );
    fireEvent.change(searchBox(), { target: { value: "PROJ-123" } });
    fireEvent.keyDown(searchBox(), { key: "Enter" });

    await waitFor(() => {
      expect(searchBox().disabled).toBe(true);
    });
    expect(screen.getByText("Linking the Jira issue")).toBeTruthy();
  });
});
