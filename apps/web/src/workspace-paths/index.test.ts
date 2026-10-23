import { describe, expect, it } from "vitest";

import { isWorkspaceSection, workspacePath, workspaceSwitchPath } from ".";

const FROM = "10000000-0000-4000-8000-000000000001";
const TO = "10000000-0000-4000-8000-000000000002";

describe("workspacePath", () => {
  it("points at the threads section by default", () => {
    expect(workspacePath(FROM)).toBe(`/app/w/${FROM}/threads`);
    expect(workspacePath(FROM, "invites")).toBe(`/app/w/${FROM}/invites`);
  });
});

describe("isWorkspaceSection", () => {
  it("accepts only the known sections", () => {
    expect(isWorkspaceSection("sites")).toBe(true);
    expect(isWorkspaceSection("settings")).toBe(false);
    expect(isWorkspaceSection(undefined)).toBe(false);
  });
});

describe("workspaceSwitchPath", () => {
  it("keeps the current section when switching workspace", () => {
    expect(workspaceSwitchPath(`/app/w/${FROM}/sites`, TO)).toBe(`/app/w/${TO}/sites`);
  });

  it("drops a thread id and opens the threads list of the other workspace", () => {
    expect(workspaceSwitchPath(`/app/w/${FROM}/threads/abc`, TO)).toBe(`/app/w/${TO}/threads`);
  });

  it("opens the threads list from the workspace root", () => {
    expect(workspaceSwitchPath(`/app/w/${FROM}`, TO)).toBe(`/app/w/${TO}/threads`);
  });
});
