import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ThreadFacts } from ".";

const FACTS = {
  pageUrl: "https://example.test/pricing",
  status: "open" as const,
  authorName: "Olena",
  createdAt: "2026-10-22T09:00:00Z",
  resolvedAt: null,
};

describe("ThreadFacts", () => {
  it("links the page address and shows the status and the author", () => {
    render(<ThreadFacts {...FACTS} />);

    const link = screen.getByRole("link", { name: "https://example.test/pricing" });
    expect(link.getAttribute("href")).toBe("https://example.test/pricing");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.getByText("Open", { selector: "dd" })).toBeTruthy();
    expect(screen.getByText("Olena,")).toBeTruthy();
  });

  it("shows a page address that is not http or https as text", () => {
    render(<ThreadFacts {...FACTS} pageUrl="javascript:alert(1)" />);

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("javascript:alert(1)")).toBeTruthy();
  });

  it("shows when the thread was resolved only when it was", () => {
    const { rerender } = render(<ThreadFacts {...FACTS} />);
    expect(screen.queryByText("Resolved", { selector: "dt" })).toBeNull();

    rerender(<ThreadFacts {...FACTS} status="resolved" resolvedAt="2026-10-22T11:00:00Z" />);

    expect(screen.getByText("Resolved", { selector: "dt" })).toBeTruthy();
    expect(screen.getByText("22 Oct 2026, 11:00 UTC")).toBeTruthy();
  });
});
