import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  COMMENT_MAX_LENGTH,
  COMPOSER_FALLBACK_ERROR,
  COMPOSER_MAX_HEIGHT,
  Composer,
  type ComposerProps,
} from ".";

function renderComposer(props: Partial<ComposerProps> = {}) {
  const onSubmit = vi.fn<(body: string) => Promise<void>>().mockResolvedValue(undefined);
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

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("hello world");
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

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("line one\nline two");
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
      .fn<(body: string) => Promise<void>>()
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
    expect(onSubmit).toHaveBeenLastCalledWith("keep me!");
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
