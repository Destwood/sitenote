import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  COMMENT_MAX_LENGTH,
  COMPOSER_FALLBACK_ERROR,
  COMPOSER_MAX_HEIGHT,
  Composer,
  type ComposerProps,
  type ComposerSubmission,
} from ".";

function renderComposer(props: Partial<ComposerProps> = {}) {
  const onSubmit = vi
    .fn<(submission: ComposerSubmission) => Promise<void>>()
    .mockResolvedValue(undefined);
  render(
    <Composer
      label="Comment"
      submitLabel="Send"
      placeholder="Write something"
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return { onSubmit };
}

function textbox(): HTMLTextAreaElement {
  return screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Comment" });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Composer", () => {
  it("renders a labelled textarea with the placeholder and a disabled submit button", () => {
    renderComposer();

    expect(textbox().getAttribute("placeholder")).toBe("Write something");
    expect(textbox().getAttribute("aria-keyshortcuts")).toBe("Control+Enter Meta+Enter");
    expect(screen.getByRole("button", { name: "Send" })).toHaveProperty("disabled", true);
  });

  it("submits the trimmed text with the button and clears the field", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderComposer();

    await user.type(textbox(), "  hello world  ");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ body: "hello world", mentions: [] });
    await waitFor(() => {
      expect(textbox().value).toBe("");
    });
  });

  it.each([
    ["Control", "{Control>}{Enter}{/Control}"],
    ["Meta", "{Meta>}{Enter}{/Meta}"],
  ])("submits on %s+Enter and keeps a plain Enter as a new line", async (_name, combo) => {
    const user = userEvent.setup();
    const { onSubmit } = renderComposer();

    await user.type(textbox(), "line one{Enter}line two");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(textbox().value).toBe("line one\nline two");

    await user.keyboard(combo);

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
      body: "line one\nline two",
      mentions: [],
    });
  });

  it("does not submit whitespace-only text", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderComposer();

    await user.type(textbox(), "   ");
    await user.keyboard("{Control>}{Enter}{/Control}");

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Send" })).toHaveProperty("disabled", true);
  });

  it("stops Escape from bubbling to the document when it handles it", async () => {
    const user = userEvent.setup();
    const outer = vi.fn();
    const onCancel = vi.fn();
    renderComposer({ onCancel });
    document.addEventListener("keydown", outer);

    await user.click(textbox());
    await user.keyboard("{Escape}");
    document.removeEventListener("keydown", outer);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  it("shows a Cancel button and calls onCancel from it and from Escape", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderComposer({ onCancel });

    await user.click(textbox());
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("lets Escape bubble when there is no onCancel", async () => {
    const user = userEvent.setup();
    const outer = vi.fn();
    renderComposer();
    document.addEventListener("keydown", outer);

    await user.click(textbox());
    await user.keyboard("{Escape}");
    document.removeEventListener("keydown", outer);

    expect(outer).toHaveBeenCalledTimes(1);
  });

  it("ignores Enter while an IME composition is active", () => {
    const { onSubmit } = renderComposer();

    fireEvent.change(textbox(), { target: { value: "konnichiwa" } });
    fireEvent.keyDown(textbox(), { key: "Enter", ctrlKey: true, isComposing: true });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("is read-only and cannot be submitted while the parent says it is submitting", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderComposer({ submitting: true, initialValue: "draft" });

    await user.type(textbox(), "more");
    await user.keyboard("{Control>}{Enter}{/Control}");

    expect(textbox().readOnly).toBe(true);
    expect(textbox().value).toBe("draft");
    expect(textbox().getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("button", { name: "Send" })).toHaveProperty("disabled", true);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("blocks a second submit while the first is still pending", async () => {
    const user = userEvent.setup();
    let resolve: () => void = () => undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    renderComposer({ onSubmit });

    await user.type(textbox(), "once");
    await user.keyboard("{Control>}{Enter}{Enter}{/Control}");

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(textbox().readOnly).toBe(true);

    resolve();
    await waitFor(() => {
      expect(textbox().value).toBe("");
    });
    expect(textbox().readOnly).toBe(false);
  });

  it("keeps the text and shows a fallback error when onSubmit rejects, then recovers", async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn<(submission: ComposerSubmission) => Promise<void>>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(undefined);
    renderComposer({ onSubmit });

    await user.type(textbox(), "keep me");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect((await screen.findByRole("alert")).textContent).toBe(COMPOSER_FALLBACK_ERROR);
    expect(textbox().value).toBe("keep me");
    expect(textbox().getAttribute("aria-invalid")).toBe("true");
    expect(textbox().getAttribute("aria-describedby")).toBe(
      screen.getByRole("alert").getAttribute("id"),
    );
    expect(document.activeElement).toBe(textbox());

    await user.type(textbox(), "!");
    expect(screen.queryByRole("alert")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => {
      expect(textbox().value).toBe("");
    });
    expect(onSubmit).toHaveBeenLastCalledWith({ body: "keep me!", mentions: [] });
  });

  it("shows the error passed by the parent instead of the fallback", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error("x"));
    renderComposer({ onSubmit, error: "You are offline" });

    await user.type(textbox(), "hi");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    expect(screen.getByRole("alert").textContent).toBe("You are offline");
  });

  it("focuses the field and puts the cursor at the end when autoFocus is set", () => {
    renderComposer({ autoFocus: true, initialValue: "abc" });

    expect(document.activeElement).toBe(textbox());
    expect(textbox().selectionStart).toBe(3);
  });

  it("does not take focus without autoFocus", () => {
    renderComposer();

    expect(document.activeElement).not.toBe(textbox());
  });

  it("caps the field at the maximum length and shows a counter near the limit", () => {
    renderComposer();

    expect(textbox().maxLength).toBe(COMMENT_MAX_LENGTH);
    expect(screen.queryByText(/\/ 10000/)).toBeNull();

    fireEvent.change(textbox(), { target: { value: "a".repeat(9_500) } });

    expect(screen.getByText("9500 / 10000")).toBeTruthy();
    expect(textbox().getAttribute("aria-describedby")).toBe(
      screen.getByText("9500 / 10000").getAttribute("id"),
    );
    expect(screen.getByRole("button", { name: "Send" })).toHaveProperty("disabled", false);
  });

  it("refuses text above the limit that was pasted around the attribute", () => {
    const { onSubmit } = renderComposer();

    fireEvent.change(textbox(), { target: { value: "a".repeat(COMMENT_MAX_LENGTH + 1) } });
    fireEvent.keyDown(textbox(), { key: "Enter", ctrlKey: true });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Send" })).toHaveProperty("disabled", true);
    expect(textbox().getAttribute("aria-invalid")).toBe("true");
  });

  it("grows with its content up to the maximum height", () => {
    let scrollHeight = 60;
    vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get").mockImplementation(
      () => scrollHeight,
    );
    renderComposer();

    fireEvent.change(textbox(), { target: { value: "one\ntwo" } });
    expect(textbox().style.height).toBe("60px");

    scrollHeight = 900;
    fireEvent.change(textbox(), { target: { value: "x\n".repeat(40) } });
    expect(textbox().style.height).toBe(`${String(COMPOSER_MAX_HEIGHT)}px`);
  });
});

const PEOPLE = [
  { id: "u-olena", displayName: "Olena Owner", avatarUrl: null },
  { id: "u-max", displayName: "Max Member", avatarUrl: null },
  { id: "u-olga", displayName: "Olga Marsh", avatarUrl: null },
  { id: "u-sam-1", displayName: "Sam Stone", avatarUrl: null },
  { id: "u-sam-2", displayName: "Sam Stone", avatarUrl: null },
  { id: "u-pat", displayName: "Pat Brown", avatarUrl: null },
  { id: "u-quinn", displayName: "Quinn Marsh", avatarUrl: null },
  { id: "u-riley", displayName: "Riley Marsh", avatarUrl: null },
];

function optionNames(): (string | null)[] {
  return screen
    .queryAllByRole("option")
    .map((option) => option.querySelector("span.truncate")?.textContent ?? null);
}

describe("Composer mention autocomplete", () => {
  it("offers no suggestions without candidates", async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.type(textbox(), "@Ol");

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(textbox().getAttribute("aria-autocomplete")).toBeNull();
  });

  it("opens a listbox for an @ query and filters by the prefix of any word, ignoring case", async () => {
    const user = userEvent.setup();
    renderComposer({ mentionCandidates: PEOPLE });

    await user.type(textbox(), "hi @mar");

    expect(screen.getByRole("listbox", { name: "Mention suggestions" })).toBeTruthy();
    expect(optionNames()).toEqual(["Olga Marsh", "Quinn Marsh", "Riley Marsh"]);
    expect(textbox().getAttribute("aria-autocomplete")).toBe("list");
    expect(textbox().getAttribute("aria-controls")).toBe(
      screen.getByRole("listbox").getAttribute("id"),
    );
  });

  it("matches a multi-word query that starts at a later word", async () => {
    const user = userEvent.setup();
    renderComposer({ mentionCandidates: PEOPLE });

    await user.type(textbox(), "@Owner");
    expect(optionNames()).toEqual(["Olena Owner"]);

    await user.clear(textbox());
    await user.type(textbox(), "@Max Me");
    expect(optionNames()).toEqual(["Max Member"]);
  });

  it("shows at most six suggestions for a bare @", async () => {
    const user = userEvent.setup();
    renderComposer({ mentionCandidates: PEOPLE });

    await user.type(textbox(), "@");

    expect(optionNames()).toHaveLength(6);
  });

  it("does not open for an @ inside a word or an unmatched query", async () => {
    const user = userEvent.setup();
    renderComposer({ mentionCandidates: PEOPLE });

    await user.type(textbox(), "mail me at ann@ol");
    expect(screen.queryByRole("listbox")).toBeNull();

    await user.type(textbox(), " @zzz");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("marks the first option active and moves with the arrow keys, wrapping around", async () => {
    const user = userEvent.setup();
    renderComposer({ mentionCandidates: PEOPLE });

    await user.type(textbox(), "@mar");
    const [first, second, third] = screen.getAllByRole("option");
    expect(first?.getAttribute("aria-selected")).toBe("true");
    expect(textbox().getAttribute("aria-activedescendant")).toBe(first?.getAttribute("id"));

    await user.keyboard("{ArrowDown}");
    expect(second?.getAttribute("aria-selected")).toBe("true");
    expect(textbox().getAttribute("aria-activedescendant")).toBe(second?.getAttribute("id"));

    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(first?.getAttribute("aria-selected")).toBe("true");

    await user.keyboard("{ArrowUp}");
    expect(third?.getAttribute("aria-selected")).toBe("true");
  });

  it("inserts the active person with Enter, keeps the cursor after the name and submits their id", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderComposer({ mentionCandidates: PEOPLE });

    await user.type(textbox(), "cc @max");
    await user.keyboard("{Enter}");

    expect(textbox().value).toBe("cc @Max Member ");
    expect(textbox().selectionStart).toBe("cc @Max Member ".length);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(textbox(), "please check");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
      body: "cc @Max Member please check",
      mentions: ["u-max"],
    });
  });

  it("picks with Tab", async () => {
    const user = userEvent.setup();
    renderComposer({ mentionCandidates: PEOPLE });

    await user.type(textbox(), "@ol{ArrowDown}");
    await user.keyboard("{Tab}");

    expect(textbox().value).toBe("@Olga Marsh ");
  });

  it("picks with the mouse and keeps focus in the field", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderComposer({ mentionCandidates: PEOPLE });

    await user.type(textbox(), "@mar");
    await user.click(screen.getByRole("option", { name: /Quinn Marsh/ }));

    expect(textbox().value).toBe("@Quinn Marsh ");
    expect(document.activeElement).toBe(textbox());

    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
      body: "@Quinn Marsh",
      mentions: ["u-quinn"],
    });
  });

  it("hovering an option makes it the active one", async () => {
    const user = userEvent.setup();
    renderComposer({ mentionCandidates: PEOPLE });

    await user.type(textbox(), "@mar");
    await user.hover(screen.getByRole("option", { name: /Riley Marsh/ }));

    expect(screen.getByRole("option", { name: /Riley Marsh/ }).getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  it("closes the list with Escape without cancelling the composer or reaching the parent", async () => {
    const user = userEvent.setup();
    const escapes: string[] = [];
    const outer = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        escapes.push(event.key);
      }
    };
    const onCancel = vi.fn();
    renderComposer({ mentionCandidates: PEOPLE, onCancel });
    document.addEventListener("keydown", outer);

    await user.type(textbox(), "@mar");
    await user.keyboard("{Escape}");
    document.removeEventListener("keydown", outer);

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onCancel).not.toHaveBeenCalled();
    expect(escapes).toEqual([]);
    expect(textbox().value).toBe("@mar");

    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("reopens for a new @ after Escape", async () => {
    const user = userEvent.setup();
    renderComposer({ mentionCandidates: PEOPLE });

    await user.type(textbox(), "@mar{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();

    await user.type(textbox(), " and @pat");
    expect(optionNames()).toEqual(["Pat Brown"]);
  });

  it("drops the id of a person whose name was edited before sending", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderComposer({ mentionCandidates: PEOPLE });

    await user.type(textbox(), "@max");
    await user.keyboard("{Enter}");
    await user.type(textbox(), "and @pat");
    await user.keyboard("{Enter}");
    fireEvent.change(textbox(), { target: { value: "@Max Membe and @Pat Brown go" } });
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
      body: "@Max Membe and @Pat Brown go",
      mentions: ["u-pat"],
    });
  });

  it("resolves two people with the same name in the order they were picked", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderComposer({ mentionCandidates: PEOPLE });

    await user.type(textbox(), "@sam");
    await user.keyboard("{Enter}");
    await user.type(textbox(), "and @sam{ArrowDown}");
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
      body: "@Sam Stone and @Sam Stone",
      mentions: ["u-sam-1", "u-sam-2"],
    });
  });

  it("stops suggesting once twenty people are mentioned", async () => {
    const user = userEvent.setup();
    const crowd = Array.from({ length: 21 }, (_, index) => ({
      id: `u-${String(index)}`,
      displayName: `P${String(index).padStart(2, "0")}`,
      avatarUrl: null,
    }));
    renderComposer({ mentionCandidates: crowd });

    for (let index = 0; index < 20; index += 1) {
      await user.type(textbox(), `@P${String(index).padStart(2, "0")}`);
      await user.keyboard("{Enter}");
    }
    await user.type(textbox(), "@P20");

    expect(screen.queryByRole("listbox")).toBeNull();
  }, 30_000);

  it("does not treat Ctrl+Enter as a pick", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderComposer({ mentionCandidates: PEOPLE });

    await user.type(textbox(), "@max");
    await user.keyboard("{Control>}{Enter}{/Control}");

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ body: "@max", mentions: [] });
  });

  it("forgets the picked people after a successful send", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderComposer({ mentionCandidates: PEOPLE });

    await user.type(textbox(), "@max");
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => {
      expect(textbox().value).toBe("");
    });
    await user.type(textbox(), "@Max Member");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(onSubmit).toHaveBeenLastCalledWith({ body: "@Max Member", mentions: [] });
  });
});
