import { describe, expect, it } from "vitest";

import { renderNotificationEmail } from ".";

const base = {
  authorName: "Olena Owner",
  commentBody: "Please check <b>this</b>",
  pageUrl: "https://example.com/pricing",
  threadLink: "https://app.sitenote.test/t/abc",
};

describe("renderNotificationEmail", () => {
  it("names the reply in the subject and the intro", () => {
    const email = renderNotificationEmail({ ...base, kind: "reply" });
    expect(email.subject).toBe("New reply in Sitenote");
    expect(email.text.startsWith("Olena Owner replied")).toBe(true);
  });

  it("names the mention in the subject and the intro", () => {
    const email = renderNotificationEmail({ ...base, kind: "mention" });
    expect(email.subject).toBe("You were mentioned in Sitenote");
    expect(email.text.startsWith("Olena Owner mentioned you")).toBe(true);
  });

  it("escapes the comment and the author in the html part only", () => {
    const email = renderNotificationEmail({
      ...base,
      authorName: "<script>x</script>",
      kind: "reply",
    });
    expect(email.html).toContain("&lt;b&gt;this&lt;/b&gt;");
    expect(email.html).not.toContain("<script>");
    expect(email.text).toContain("Please check <b>this</b>");
  });

  it("links the page and the thread only with http or https urls", () => {
    const email = renderNotificationEmail({
      ...base,
      pageUrl: "javascript:alert(1)",
      kind: "reply",
    });
    expect(email.html).not.toContain('href="javascript:');
    expect(email.html).toContain('href="https://app.sitenote.test/t/abc"');
  });

  it("uses a neutral author when the name is blank and cuts long comments", () => {
    const email = renderNotificationEmail({
      ...base,
      authorName: "  ",
      commentBody: "x".repeat(900),
      kind: "reply",
    });
    expect(email.text.startsWith("Someone replied")).toBe(true);
    expect(Array.from(email.text.split("\n")[2] ?? "")).toHaveLength(500);
  });
});
