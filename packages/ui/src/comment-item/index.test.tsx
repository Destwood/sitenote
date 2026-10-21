import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ANN, makeComment } from "../test-fixtures";
import type { CommentView } from "../types";
import { DELETED_PLACEHOLDER, DELETE_FAILED_MESSAGE, CommentItem } from ".";

function renderItem(
  comment: CommentView,
  handlers: {
    onEdit?: (body: string) => Promise<void>;
    onDelete?: () => Promise<void>;
  } = {},
) {
  const onEdit = handlers.onEdit ?? vi.fn().mockResolvedValue(undefined);
  const onDelete = handlers.onDelete ?? vi.fn().mockResolvedValue(undefined);
  render(
    <ul>
      <CommentItem comment={comment} now={Date.now()} onEdit={onEdit} onDelete={onDelete} />
    </ul>,
  );
  return { onEdit, onDelete };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CommentItem", () => {
  it("shows the author, a machine-readable relative time and the body", () => {
    const comment = makeComment({ body: "Hello\nthere" });
    renderItem(comment);

    const time = screen.getByText("5 minutes ago");

    expect(screen.getByText("Ann Author")).toBeTruthy();
    expect(time.tagName).toBe("TIME");
    expect(time.getAttribute("datetime")).toBe(comment.createdAt);
    expect(time.getAttribute("title")).toBeTruthy();
    expect(screen.getByText(/Hello/).className).toContain("whitespace-pre-wrap");
  });

  it("renders a body with markup and links as plain text", () => {
    renderItem(
      makeComment({ body: '<img src=x onerror="alert(1)"> https://evil.test <b>bold</b>' }),
    );

    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("a")).toBeNull();
    expect(document.querySelector("b")).toBeNull();
    expect(screen.getByText(/https:\/\/evil\.test/)).toBeTruthy();
  });

  it("marks an edited comment", () => {
    renderItem(makeComment({ editedAt: new Date().toISOString() }));

    expect(screen.getByText("edited")).toBeTruthy();
  });

  it("shows a placeholder for a deleted comment without its body or actions", () => {
    renderItem(
      makeComment({
        deleted: true,
        canEdit: true,
        body: "secret",
        editedAt: "2026-01-01T00:00:00Z",
      }),
    );

    expect(screen.getByText(DELETED_PLACEHOLDER)).toBeTruthy();
    expect(screen.queryByText("secret")).toBeNull();
    expect(screen.queryByText("edited")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers no actions on comments the viewer cannot edit", () => {
    renderItem(makeComment({ canEdit: false }));

    expect(screen.queryByRole("button")).toBeNull();
  });

  describe("editing", () => {
    it("opens a composer with the current text focused and saves the new text", async () => {
      const user = userEvent.setup();
      const { onEdit } = renderItem(makeComment({ canEdit: true, body: "old" }));

      await user.click(screen.getByRole("button", { name: "Edit" }));
      const field = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Edit comment" });

      expect(document.activeElement).toBe(field);
      expect(field.value).toBe("old");
      expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();

      await user.type(field, " new");
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(onEdit).toHaveBeenCalledExactlyOnceWith("old new");
      await waitFor(() => {
        expect(screen.queryByRole("textbox")).toBeNull();
      });
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit" }));
    });

    it("saves with Ctrl+Enter", async () => {
      const user = userEvent.setup();
      const { onEdit } = renderItem(makeComment({ canEdit: true, body: "old" }));

      await user.click(screen.getByRole("button", { name: "Edit" }));
      await user.keyboard("!{Control>}{Enter}{/Control}");

      expect(onEdit).toHaveBeenCalledExactlyOnceWith("old!");
    });

    it("cancels with the button or Escape and returns focus to Edit", async () => {
      const user = userEvent.setup();
      const { onEdit } = renderItem(makeComment({ canEdit: true }));

      await user.click(screen.getByRole("button", { name: "Edit" }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit" }));

      await user.click(screen.getByRole("button", { name: "Edit" }));
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit" }));
      expect(onEdit).not.toHaveBeenCalled();
    });

    it("stays in edit mode with the text when saving fails", async () => {
      const user = userEvent.setup();
      const onEdit = vi.fn().mockRejectedValue(new Error("x"));
      renderItem(makeComment({ canEdit: true, body: "old" }), { onEdit });

      await user.click(screen.getByRole("button", { name: "Edit" }));
      await user.type(screen.getByRole("textbox"), "!");
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(await screen.findByRole("alert")).toBeTruthy();
      expect(screen.getByRole<HTMLTextAreaElement>("textbox").value).toBe("old!");
    });
  });

  describe("deleting", () => {
    it("asks for confirmation inside the panel without window.confirm", async () => {
      const user = userEvent.setup();
      const confirm = vi.fn();
      vi.stubGlobal("confirm", confirm);
      const { onDelete } = renderItem(makeComment({ canEdit: true }));

      await user.click(screen.getByRole("button", { name: "Delete" }));
      const group = screen.getByRole("group", { name: "Confirm deletion" });

      expect(within(group).getByText(/Delete this comment\?/)).toBeTruthy();
      expect(document.activeElement).toBe(within(group).getByRole("button", { name: "Keep" }));
      expect(confirm).not.toHaveBeenCalled();
      expect(onDelete).not.toHaveBeenCalled();
    });

    it("keeps the comment and returns focus to Delete when the user backs out", async () => {
      const user = userEvent.setup();
      const { onDelete } = renderItem(makeComment({ canEdit: true }));

      await user.click(screen.getByRole("button", { name: "Delete" }));
      await user.click(screen.getByRole("button", { name: "Keep" }));

      expect(screen.queryByRole("group")).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Delete" }));
      expect(onDelete).not.toHaveBeenCalled();
    });

    it("deletes after confirmation and moves focus to the comment", async () => {
      const user = userEvent.setup();
      const { onDelete } = renderItem(makeComment({ canEdit: true }));

      await user.click(screen.getByRole("button", { name: "Delete" }));
      const group = screen.getByRole("group");
      await user.click(within(group).getByRole("button", { name: "Delete" }));

      expect(onDelete).toHaveBeenCalledTimes(1);
      await waitFor(() => {
        expect(screen.queryByRole("group")).toBeNull();
      });
      expect(document.activeElement).toBe(screen.getByRole("listitem"));
    });

    it("shows an error and stays in the confirmation when deleting fails", async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn().mockRejectedValue(new Error("x"));
      renderItem(makeComment({ canEdit: true }), { onDelete });

      await user.click(screen.getByRole("button", { name: "Delete" }));
      await user.click(within(screen.getByRole("group")).getByRole("button", { name: "Delete" }));

      expect((await screen.findByRole("alert")).textContent).toBe(DELETE_FAILED_MESSAGE);
      expect(screen.getByRole("group")).toBeTruthy();
      expect(
        within(screen.getByRole("group")).getByRole("button", { name: "Delete" }),
      ).toHaveProperty("disabled", false);
    });

    it("disables the confirmation buttons while the request is pending", async () => {
      const user = userEvent.setup();
      let finish: () => void = () => undefined;
      const onDelete = vi.fn(
        () =>
          new Promise<void>((done) => {
            finish = done;
          }),
      );
      renderItem(makeComment({ canEdit: true, author: ANN }), { onDelete });

      await user.click(screen.getByRole("button", { name: "Delete" }));
      const group = screen.getByRole("group");
      await user.click(within(group).getByRole("button", { name: "Delete" }));

      expect(within(group).getByRole("button", { name: "Delete" })).toHaveProperty(
        "disabled",
        true,
      );
      expect(within(group).getByRole("button", { name: "Keep" })).toHaveProperty("disabled", true);

      finish();
      await waitFor(() => {
        expect(screen.queryByRole("group")).toBeNull();
      });
    });
  });
});
