import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  loadClickUpHierarchy: vi.fn(),
  saveClickUpSettings: vi.fn(),
  disconnectClickUp: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("../supabase-browser", () => ({ getSupabaseBrowserClient: () => ({}) }));
vi.mock("../clickup-api", () => ({
  loadClickUpHierarchy: mocks.loadClickUpHierarchy,
  saveClickUpSettings: mocks.saveClickUpSettings,
  disconnectClickUp: mocks.disconnectClickUp,
}));

import { ClickUpIntegrationForm } from ".";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const TOKEN = "pk_1_typed_token";

beforeEach(() => {
  mocks.loadClickUpHierarchy.mockImplementation(
    (_client: unknown, input: { teamId?: string; spaceId?: string }) => {
      if (input.spaceId !== undefined) {
        return Promise.resolve({
          ok: true,
          data: { teams: [], lists: [{ id: "789", name: "Bugs" }] },
        });
      }
      if (input.teamId !== undefined) {
        return Promise.resolve({
          ok: true,
          data: { teams: [], spaces: [{ id: "2", name: "Web" }] },
        });
      }
      return Promise.resolve({ ok: true, data: { teams: [{ id: "1", name: "Studio" }] } });
    },
  );
  mocks.saveClickUpSettings.mockResolvedValue({ ok: true, data: null });
  mocks.disconnectClickUp.mockResolvedValue({ ok: true, data: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

function typeToken(value: string) {
  fireEvent.change(screen.getByLabelText(/personal token/i), { target: { value } });
}

describe("ClickUpIntegrationForm when not connected", () => {
  it("masks the token field and never shows a stored value", () => {
    render(<ClickUpIntegrationForm workspaceId={WORKSPACE_ID} connection={null} />);
    const field = screen.getByLabelText(/personal token/i);
    expect(field.getAttribute("type")).toBe("password");
    expect((field as HTMLInputElement).value).toBe("");
  });

  it("loads the teams with the typed token and offers them in a picker", async () => {
    render(<ClickUpIntegrationForm workspaceId={WORKSPACE_ID} connection={null} />);
    typeToken(TOKEN);
    fireEvent.click(screen.getByRole("button", { name: "Load teams" }));

    expect(await screen.findByRole("combobox", { name: "Team" })).toBeTruthy();
    expect(mocks.loadClickUpHierarchy).toHaveBeenCalledWith(
      {},
      { workspaceId: WORKSPACE_ID, token: TOKEN },
    );
  });

  it("shows the reason when ClickUp rejects the token", async () => {
    mocks.loadClickUpHierarchy.mockResolvedValueOnce({
      ok: false,
      message: "ClickUp rejected this token",
    });
    render(<ClickUpIntegrationForm workspaceId={WORKSPACE_ID} connection={null} />);
    typeToken("pk_bad");
    fireEvent.click(screen.getByRole("button", { name: "Load teams" }));

    expect((await screen.findByRole("alert")).textContent).toBe("ClickUp rejected this token");
    expect(screen.queryByRole("combobox", { name: "Team" })).toBeNull();
  });

  it("saves the chosen list with its names and then refreshes the page", async () => {
    render(<ClickUpIntegrationForm workspaceId={WORKSPACE_ID} connection={null} />);
    typeToken(TOKEN);
    fireEvent.click(screen.getByRole("button", { name: "Load teams" }));

    fireEvent.change(await screen.findByRole("combobox", { name: "Team" }), {
      target: { value: "1" },
    });
    fireEvent.change(await screen.findByRole("combobox", { name: "Space" }), {
      target: { value: "2" },
    });
    fireEvent.change(await screen.findByRole("combobox", { name: "List" }), {
      target: { value: "789" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save ClickUp list" }));

    await waitFor(() => {
      expect(mocks.refresh).toHaveBeenCalled();
    });
    expect(mocks.saveClickUpSettings).toHaveBeenCalledWith(
      {},
      {
        workspaceId: WORKSPACE_ID,
        token: TOKEN,
        teamId: "1",
        teamName: "Studio",
        spaceId: "2",
        spaceName: "Web",
        listId: "789",
        listName: "Bugs",
      },
    );
  });

  it("keeps the save button off until a list is chosen", async () => {
    render(<ClickUpIntegrationForm workspaceId={WORKSPACE_ID} connection={null} />);
    typeToken(TOKEN);
    fireEvent.click(screen.getByRole("button", { name: "Load teams" }));
    fireEvent.change(await screen.findByRole("combobox", { name: "Team" }), {
      target: { value: "1" },
    });

    const save = screen.getByRole<HTMLButtonElement>("button", { name: "Save ClickUp list" });
    expect(save.disabled).toBe(true);
  });
});

describe("ClickUpIntegrationForm when connected", () => {
  const connection = { teamName: "Studio", spaceName: "Web", listName: "Bugs" };

  it("names the connected list and never reveals the token", () => {
    render(<ClickUpIntegrationForm workspaceId={WORKSPACE_ID} connection={connection} />);
    expect(screen.getByText("Tasks go to Bugs in Web (Studio).")).toBeTruthy();
    const field = screen.getByLabelText<HTMLInputElement>(/replace the personal token/i);
    expect(field.value).toBe("");
    expect(field.getAttribute("type")).toBe("password");
  });

  it("disconnects only after the owner confirms", async () => {
    const confirm = vi.fn(() => false);
    window.confirm = confirm;
    render(<ClickUpIntegrationForm workspaceId={WORKSPACE_ID} connection={connection} />);

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(mocks.disconnectClickUp).not.toHaveBeenCalled();

    confirm.mockImplementation(() => true);
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() => {
      expect(mocks.refresh).toHaveBeenCalled();
    });
    expect(mocks.disconnectClickUp).toHaveBeenCalledWith({}, WORKSPACE_ID);
  });
});
