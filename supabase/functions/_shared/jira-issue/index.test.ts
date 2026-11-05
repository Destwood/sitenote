import { describe, expect, it } from "vitest";

import {
  buildLinkComment,
  decideIssueLink,
  issueUrl,
  normalizeIssueKey,
  normalizeJiraSiteUrl,
} from "./index.ts";

describe("normalizeJiraSiteUrl", () => {
  it("keeps the origin of a valid atlassian site and drops the trailing slash", () => {
    expect(normalizeJiraSiteUrl("https://org.atlassian.net")).toBe("https://org.atlassian.net");
    expect(normalizeJiraSiteUrl("  https://Org-1.Atlassian.NET/  ")).toBe(
      "https://org-1.atlassian.net",
    );
  });

  it.each([
    "http://org.atlassian.net",
    "https://evil.com",
    "https://org.atlassian.net.evil.com",
    "https://org.atlassian.net:8443",
    "https://user@org.atlassian.net",
    "https://user:secret@org.atlassian.net",
    "https://org.atlassian.net/browse/PROJ-1",
    "https://org.atlassian.net?x=1",
    "https://org.atlassian.net#top",
    "https://.atlassian.net",
    "https://-org.atlassian.net",
    "https://org.atlassian.net.",
    "not a url",
    "",
  ])("rejects %s", (input) => {
    expect(normalizeJiraSiteUrl(input)).toBeNull();
  });
});

describe("normalizeIssueKey", () => {
  it("trims and uppercases a key before validating it", () => {
    expect(normalizeIssueKey("  proj-123 ")).toBe("PROJ-123");
    expect(normalizeIssueKey("AB_C2-9")).toBe("AB_C2-9");
  });

  it.each(["P-1", "1PROJ-1", "PROJ-", "PROJ-1a", "PROJ 1", "../PROJ-1", "PROJ-1;"])(
    "rejects %j",
    (input) => {
      expect(normalizeIssueKey(input)).toBeNull();
    },
  );

  it("rejects keys longer than 64 characters", () => {
    const key = `AB-${"1".repeat(62)}`;
    expect(key).toHaveLength(65);
    expect(normalizeIssueKey(key)).toBeNull();
    expect(normalizeIssueKey(`AB-${"1".repeat(61)}`)).toHaveLength(64);
  });
});

describe("issueUrl", () => {
  it("builds the browse link of an issue", () => {
    expect(issueUrl("https://org.atlassian.net", "PROJ-1")).toBe(
      "https://org.atlassian.net/browse/PROJ-1",
    );
  });
});

describe("buildLinkComment", () => {
  it("wraps the deep link in a paragraph with a matching link mark", () => {
    expect(buildLinkComment("https://app.sitenote.test/t/1")).toEqual({
      version: 1,
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Linked from Sitenote: " },
            {
              type: "text",
              text: "https://app.sitenote.test/t/1",
              marks: [{ type: "link", attrs: { href: "https://app.sitenote.test/t/1" } }],
            },
          ],
        },
      ],
    });
  });
});

describe("decideIssueLink", () => {
  it("reuses a thread that already has a key and a url", () => {
    expect(
      decideIssueLink({
        jiraIssueKey: "PROJ-1",
        jiraIssueUrl: "https://org.atlassian.net/browse/PROJ-1",
      }),
    ).toEqual({
      kind: "existing",
      issueKey: "PROJ-1",
      issueUrl: "https://org.atlassian.net/browse/PROJ-1",
    });
  });

  it("links when the thread has no issue or only half of one", () => {
    expect(decideIssueLink({ jiraIssueKey: null, jiraIssueUrl: null })).toEqual({ kind: "link" });
    expect(decideIssueLink({ jiraIssueKey: "PROJ-1", jiraIssueUrl: null })).toEqual({
      kind: "link",
    });
    expect(decideIssueLink({ jiraIssueKey: null, jiraIssueUrl: "https://x" })).toEqual({
      kind: "link",
    });
  });
});
