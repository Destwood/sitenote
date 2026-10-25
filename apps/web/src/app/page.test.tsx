import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
}));

vi.mock("../supabase-server", () => ({
  createSupabaseServerClient: () => Promise.resolve({}),
  getAuthenticatedUser: mocks.getAuthenticatedUser,
}));

import HomePage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /", () => {
  it.each([
    ["no session", null],
    ["a guest session", { id: "u-1", email: null, isAnonymous: true }],
  ])("offers sign-in to %s", async (_label, user) => {
    mocks.getAuthenticatedUser.mockResolvedValue(user);

    render(await HomePage());

    const header = within(screen.getByRole("banner"));
    expect(header.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in");
    expect(header.queryByRole("link", { name: "Dashboard" })).toBeNull();
  });

  it("links a member to the dashboard in the header and the footer", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue({
      id: "u-2",
      email: "ada@example.com",
      isAnonymous: false,
    });

    render(await HomePage());

    const header = within(screen.getByRole("banner"));
    expect(header.getByRole("link", { name: "Dashboard" }).getAttribute("href")).toBe("/app");
    expect(header.queryByRole("link", { name: "Sign in" })).toBeNull();
    const footer = within(screen.getByRole("navigation", { name: "Footer" }));
    expect(footer.getByRole("link", { name: "Dashboard" }).getAttribute("href")).toBe("/app");
  });

  it("still renders the landing with sign-in when reading the session fails", async () => {
    mocks.getAuthenticatedUser.mockRejectedValue(new Error("auth unavailable"));

    render(await HomePage());

    const header = within(screen.getByRole("banner"));
    expect(header.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in");
    expect(
      screen.getByRole("heading", { level: 1, name: "Figma-style comments on any live website." }),
    ).toBeTruthy();
  });
});
