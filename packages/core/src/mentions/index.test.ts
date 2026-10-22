import { describe, expect, it } from "vitest";

import { findMentionQuery, insertMention, mentionedIdsInBody, splitMentions } from ".";

const OLIVE = { id: "olive", displayName: "Olive Owner" };
const MAX = { id: "max", displayName: "Max" };
const MAX_LONG = { id: "max-long", displayName: "Max Mustermann" };
const ZOFIE = { id: "zofie", displayName: "Žofie Černá" };
const LI = { id: "li", displayName: "李雷" };

describe("findMentionQuery", () => {
  it.each([
    ["@", 1, { query: "", start: 0 }],
    ["@ol", 3, { query: "ol", start: 0 }],
    ["hello @ol", 9, { query: "ol", start: 6 }],
    ["hello\n@ol", 9, { query: "ol", start: 6 }],
    ["hello\t@ol", 9, { query: "ol", start: 6 }],
    ["hello @Olive Ow", 15, { query: "Olive Ow", start: 6 }],
    ["hello @ol and more", 9, { query: "ol", start: 6 }],
    ["@Žof", 4, { query: "Žof", start: 0 }],
    ["@李", 2, { query: "李", start: 0 }],
    ["see @a and @b", 13, { query: "b", start: 11 }],
    ["see @a and @b", 6, { query: "a", start: 4 }],
  ])("finds the query in %j with the caret at %i", (text, caret, expected) => {
    expect(findMentionQuery(text, caret)).toEqual(expected);
  });

  it.each([
    ["", 0],
    ["hello", 5],
    ["a@b", 3],
    ["mail me at ann@example.com", 26],
    ["@@", 2],
    ["@a@b", 4],
    ["@a\nb", 4],
    ["@a\r\nb", 5],
    ["hello @ol", 5],
    ["hello @ol", 6],
    ["email@", 6],
  ])("finds no query in %j with the caret at %i", (text, caret) => {
    expect(findMentionQuery(text, caret)).toBeNull();
  });

  it("allows 40 characters after the at sign and no more", () => {
    const forty = "a".repeat(40);
    expect(findMentionQuery(`@${forty}`, 41)).toEqual({ query: forty, start: 0 });
    expect(findMentionQuery(`@${forty}a`, 42)).toBeNull();
    expect(findMentionQuery(`x @${forty}`, 43)).toEqual({ query: forty, start: 2 });
    expect(findMentionQuery(`x @${forty}a`, 44)).toBeNull();
  });

  it("rejects a caret outside the text", () => {
    expect(findMentionQuery("@a", -1)).toBeNull();
    expect(findMentionQuery("@a", 3)).toBeNull();
    expect(findMentionQuery("@a", 1.5)).toBeNull();
    expect(findMentionQuery("@a", Number.NaN)).toBeNull();
  });
});

describe("insertMention", () => {
  it("replaces the query with the display name and a trailing space", () => {
    expect(insertMention("hi @ol", 3, 6, "Olive Owner")).toEqual({
      text: "hi @Olive Owner ",
      caret: 16,
    });
  });

  it("keeps the text after the caret", () => {
    expect(insertMention("hi @ol there", 3, 6, "Olive Owner")).toEqual({
      text: "hi @Olive Owner  there",
      caret: 16,
    });
  });

  it("inserts at the start and with an empty query", () => {
    expect(insertMention("@", 0, 1, "Max")).toEqual({ text: "@Max ", caret: 5 });
  });

  it("handles unicode names", () => {
    expect(insertMention("@Žo", 0, 3, "Žofie Černá")).toEqual({
      text: "@Žofie Černá ",
      caret: 13,
    });
    expect(insertMention("@li", 0, 3, "李雷")).toEqual({ text: "@李雷 ", caret: 4 });
  });

  it("leaves the text untouched when the range does not start at an at sign", () => {
    expect(insertMention("hi @ol", 2, 6, "Max")).toEqual({ text: "hi @ol", caret: 6 });
    expect(insertMention("hi @ol", 3, 2, "Max")).toEqual({ text: "hi @ol", caret: 2 });
    expect(insertMention("hi @ol", 3, 9, "Max")).toEqual({ text: "hi @ol", caret: 9 });
    expect(insertMention("hi @ol", -1, 3, "Max")).toEqual({ text: "hi @ol", caret: 3 });
  });

  it("round-trips with findMentionQuery", () => {
    const query = findMentionQuery("ping @ol", 8);
    expect(query).not.toBeNull();
    const result = insertMention("ping @ol", query?.start ?? 0, 8, "Olive Owner");
    expect(mentionedIdsInBody(result.text, [OLIVE])).toEqual(["olive"]);
  });
});

describe("splitMentions", () => {
  it("returns no segments for an empty body", () => {
    expect(splitMentions("", [OLIVE])).toEqual([]);
  });

  it("returns one text segment when nothing is mentioned", () => {
    expect(splitMentions("hello world", [])).toEqual([{ kind: "text", text: "hello world" }]);
    expect(splitMentions("hello @Olive Owner", [])).toEqual([
      { kind: "text", text: "hello @Olive Owner" },
    ]);
  });

  it("splits text around a mention", () => {
    expect(splitMentions("hi @Olive Owner, please look", [OLIVE])).toEqual([
      { kind: "text", text: "hi " },
      { kind: "mention", text: "@Olive Owner", userId: "olive" },
      { kind: "text", text: ", please look" },
    ]);
  });

  it("handles a mention at the start, at the end and on its own", () => {
    expect(splitMentions("@Olive Owner", [OLIVE])).toEqual([
      { kind: "mention", text: "@Olive Owner", userId: "olive" },
    ]);
    expect(splitMentions("@Olive Owner and @Max", [OLIVE, MAX])).toEqual([
      { kind: "mention", text: "@Olive Owner", userId: "olive" },
      { kind: "text", text: " and " },
      { kind: "mention", text: "@Max", userId: "max" },
    ]);
  });

  it("allows punctuation and line breaks around a name", () => {
    for (const after of [".", ",", "!", "?", ":", ";", ")", "'s", "\n", " "]) {
      expect(splitMentions(`@Max${after}x`, [MAX])[0]).toEqual({
        kind: "mention",
        text: "@Max",
        userId: "max",
      });
    }
    expect(splitMentions("(@Max)", [MAX])).toEqual([
      { kind: "text", text: "(" },
      { kind: "mention", text: "@Max", userId: "max" },
      { kind: "text", text: ")" },
    ]);
  });

  it("does not match a name that is only the start of a longer word", () => {
    expect(splitMentions("@Maxwell", [MAX])).toEqual([{ kind: "text", text: "@Maxwell" }]);
    expect(splitMentions("@Max_1 @Max2 @Maxé", [MAX])).toEqual([
      { kind: "text", text: "@Max_1 @Max2 @Maxé" },
    ]);
  });

  it("does not match an at sign glued to the end of a word", () => {
    expect(splitMentions("ann@Max", [MAX])).toEqual([{ kind: "text", text: "ann@Max" }]);
    expect(splitMentions("ann@example.com", [MAX])).toEqual([
      { kind: "text", text: "ann@example.com" },
    ]);
  });

  it("is case sensitive", () => {
    expect(splitMentions("@max", [MAX])).toEqual([{ kind: "text", text: "@max" }]);
  });

  it("prefers the longest name when one name is a prefix of another", () => {
    expect(splitMentions("@Max Mustermann hi", [MAX, MAX_LONG])).toEqual([
      { kind: "mention", text: "@Max Mustermann", userId: "max-long" },
      { kind: "text", text: " hi" },
    ]);
    expect(splitMentions("@Max Musterfrau hi", [MAX, MAX_LONG])).toEqual([
      { kind: "mention", text: "@Max", userId: "max" },
      { kind: "text", text: " Musterfrau hi" },
    ]);
    expect(splitMentions("@Max Mustermann and @Max", [MAX_LONG, MAX])).toEqual([
      { kind: "mention", text: "@Max Mustermann", userId: "max-long" },
      { kind: "text", text: " and " },
      { kind: "mention", text: "@Max", userId: "max" },
    ]);
  });

  it("matches unicode names", () => {
    expect(splitMentions("ahoj @Žofie Černá, @李雷!", [ZOFIE, LI])).toEqual([
      { kind: "text", text: "ahoj " },
      { kind: "mention", text: "@Žofie Černá", userId: "zofie" },
      { kind: "text", text: ", " },
      { kind: "mention", text: "@李雷", userId: "li" },
      { kind: "text", text: "!" },
    ]);
    expect(splitMentions("@李雷们", [LI])).toEqual([{ kind: "text", text: "@李雷们" }]);
  });

  it("treats an astral symbol before the at sign as a boundary and an astral letter as none", () => {
    expect(splitMentions("👍@Max", [MAX])[1]).toEqual({
      kind: "mention",
      text: "@Max",
      userId: "max",
    });
    expect(splitMentions("𝐀@Max", [MAX])).toEqual([{ kind: "text", text: "𝐀@Max" }]);
  });

  it("does not interpret anything else in the body as markup", () => {
    const body = "<b>@Max</b> [@Max](javascript:alert(1)) @Max";
    const segments = splitMentions(body, [MAX]);
    expect(segments.map((segment) => segment.text).join("")).toBe(body);
    expect(segments.filter((segment) => segment.kind === "mention")).toHaveLength(3);
  });

  it("reassembles the body exactly", () => {
    const body = "a @Olive Owner b\n@Max c @Max Mustermann @Olive Owner";
    const segments = splitMentions(body, [OLIVE, MAX, MAX_LONG]);
    expect(segments.map((segment) => segment.text).join("")).toBe(body);
    expect(segments.every((segment) => segment.text !== "")).toBe(true);
  });

  it("gives two people with the same name one mention each, in order", () => {
    const first = { id: "sam-1", displayName: "Sam" };
    const second = { id: "sam-2", displayName: "Sam" };
    expect(splitMentions("@Sam and @Sam and @Sam", [first, second])).toEqual([
      { kind: "mention", text: "@Sam", userId: "sam-1" },
      { kind: "text", text: " and " },
      { kind: "mention", text: "@Sam", userId: "sam-2" },
      { kind: "text", text: " and " },
      { kind: "mention", text: "@Sam", userId: "sam-1" },
    ]);
  });

  it("ignores empty names", () => {
    expect(splitMentions("@ hi", [{ id: "x", displayName: "" }])).toEqual([
      { kind: "text", text: "@ hi" },
    ]);
  });
});

describe("mentionedIdsInBody", () => {
  it("returns the ids whose name still occurs, in order and without duplicates", () => {
    expect(mentionedIdsInBody("@Max hi @Olive Owner and @Max", [OLIVE, MAX])).toEqual([
      "max",
      "olive",
    ]);
  });

  it("drops a mention whose text was deleted or edited", () => {
    expect(mentionedIdsInBody("hi there", [OLIVE, MAX])).toEqual([]);
    expect(mentionedIdsInBody("hi @Olive Own", [OLIVE])).toEqual([]);
    expect(mentionedIdsInBody("hi Olive Owner", [OLIVE])).toEqual([]);
    expect(mentionedIdsInBody("hi @Olive Ownerx", [OLIVE])).toEqual([]);
  });

  it("does not count the shorter name when the longer one was typed", () => {
    expect(mentionedIdsInBody("@Max Mustermann", [MAX, MAX_LONG])).toEqual(["max-long"]);
    expect(mentionedIdsInBody("@Max Musterfrau", [MAX, MAX_LONG])).toEqual(["max"]);
  });

  it("returns nothing for no candidates or an empty body", () => {
    expect(mentionedIdsInBody("@Max", [])).toEqual([]);
    expect(mentionedIdsInBody("", [MAX])).toEqual([]);
  });
});
