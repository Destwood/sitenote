import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageHeader } from ".";

describe("PageHeader", () => {
  it("renders the title as the page heading with its description", () => {
    render(<PageHeader title="Sites" description="Every origin with comments." />);

    expect(screen.getByRole("heading", { level: 1, name: "Sites" })).toBeTruthy();
    expect(screen.getByText("Every origin with comments.")).toBeTruthy();
  });

  it("renders the leading content and the actions", () => {
    render(
      <PageHeader
        title="Invites"
        leading={<a href="/app">Back to workspaces</a>}
        actions={<button type="button">Create invite</button>}
      />,
    );

    expect(screen.getByRole("link", { name: "Back to workspaces" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create invite" })).toBeTruthy();
  });
});
