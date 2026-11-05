import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  saveJiraSettings: vi.fn(),
  disconnectJira: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("../supabase-browser", () => ({ getSupabaseBrowserClient: () => ({}) }));
vi.mock("../jira-api", () => ({
  saveJiraSettings: mocks.saveJiraSettings,
  disconnectJira: mocks.disconnectJira,
}));

import { JiraIntegrationForm } from ".";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const TOKEN = "typed-api-token";
const SITE_URL = "https://acme.atlassian.net";
const EMAIL = "dev@example.com";

beforeEach(() => {
  mocks.saveJiraSettings.mockResolvedValue({ ok: true, data: null });
  mocks.disconnectJira.mockResolvedValue({ ok: true, data: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

function typeInto(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("JiraIntegrationForm when not connected", () => {
  it("masks the token field and never shows a stored value", () => {
    render(<JiraIntegrationForm workspaceId={WORKSPACE_ID} connection={null} />);
    const field = screen.getByLabelText<HTMLInputElement>("API token");
    expect(field.getAttribute("type")).toBe("password");
    expect(field.value).toBe("");
  });

  it("saves the site, the email and the token and then refreshes the page", async () => {
    render(<JiraIntegrationForm workspaceId={WORKSPACE_ID} connection={null} />);
    typeInto(/site url/i, SITE_URL);
    typeInto(/email/i, EMAIL);
    typeInto(/api token/i, TOKEN);
    fireEvent.click(screen.getByRole("button", { name: "Save Jira connection" }));

    await waitFor(() => {
      expect(mocks.refresh).toHaveBeenCalled();
    });
    expect(mocks.saveJiraSettings).toHaveBeenCalledWith(
      {},
      { workspaceId: WORKSPACE_ID, siteUrl: SITE_URL, email: EMAIL, token: TOKEN },
    );
  });

  it("sends no token when the field is left empty", async () => {
    render(<JiraIntegrationForm workspaceId={WORKSPACE_ID} connection={null} />);
    typeInto(/site url/i, SITE_URL);
    typeInto(/email/i, EMAIL);
    fireEvent.click(screen.getByRole("button", { name: "Save Jira connection" }));

    await waitFor(() => {
      expect(mocks.refresh).toHaveBeenCalled();
    });
    expect(mocks.saveJiraSettings.mock.calls[0]?.[1]).toEqual({
      workspaceId: WORKSPACE_ID,
      siteUrl: SITE_URL,
      email: EMAIL,
      token: undefined,
    });
  });

  it("shows the reason when Jira rejects the credentials", async () => {
    mocks.saveJiraSettings.mockResolvedValueOnce({
      ok: false,
      message: "Jira rejected these credentials",
      code: "validation",
    });
    render(<JiraIntegrationForm workspaceId={WORKSPACE_ID} connection={null} />);
    typeInto(/site url/i, SITE_URL);
    typeInto(/email/i, EMAIL);
    typeInto(/api token/i, "bad-token");
    fireEvent.click(screen.getByRole("button", { name: "Save Jira connection" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Jira rejected these credentials");
    expect(alert.getAttribute("data-error-code")).toBe("validation");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

describe("JiraIntegrationForm when connected", () => {
  const connection = { siteUrl: SITE_URL, email: EMAIL };

  it("names the connected site and account and never reveals the token", () => {
    render(<JiraIntegrationForm workspaceId={WORKSPACE_ID} connection={connection} />);
    expect(screen.getByText(`Linking issues on ${SITE_URL} as ${EMAIL}.`)).toBeTruthy();
    const field = screen.getByLabelText<HTMLInputElement>(/replace the api token/i);
    expect(field.value).toBe("");
    expect(field.getAttribute("type")).toBe("password");
  });

  it("disconnects only after the owner confirms", async () => {
    const confirm = vi.fn(() => false);
    window.confirm = confirm;
    render(<JiraIntegrationForm workspaceId={WORKSPACE_ID} connection={connection} />);

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(mocks.disconnectJira).not.toHaveBeenCalled();

    confirm.mockImplementation(() => true);
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() => {
      expect(mocks.refresh).toHaveBeenCalled();
    });
    expect(mocks.disconnectJira).toHaveBeenCalledWith({}, WORKSPACE_ID);
  });
});
