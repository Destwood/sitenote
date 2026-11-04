import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Badge } from ".";

describe("Badge", () => {
  it("renders its label", () => {
    render(<Badge tone="blue">Open</Badge>);

    expect(screen.getByText("Open")).toBeTruthy();
  });
});
