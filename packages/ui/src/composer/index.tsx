import { findMentionQuery, insertMention, mentionedIdsInBody } from "@sitenote/core";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type SubmitEvent as FormSubmitEvent,
  type SyntheticEvent,
} from "react";

import { Avatar } from "../avatar";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "../control-classes";
import type { PersonView } from "../types";

export const COMMENT_MAX_LENGTH = 10_000;
export const COUNTER_THRESHOLD = 9_000;
export const COMPOSER_MAX_HEIGHT = 176;
export const COMPOSER_FALLBACK_ERROR = "Could not send. Your text is kept, try again.";
export const MENTION_SUGGESTION_LIMIT = 6;
export const MENTIONS_LIMIT = 20;

export interface ComposerSubmission {
  body: string;
  mentions: string[];
}

export function filterMentionCandidates(
  candidates: readonly PersonView[],
  query: string,
): PersonView[] {
  const needle = ` ${query.toLocaleLowerCase()}`;
  return candidates
    .filter((person) => ` ${person.displayName.toLocaleLowerCase()}`.includes(needle))
    .slice(0, MENTION_SUGGESTION_LIMIT);
}

export interface ComposerProps {
  label: string;
  submitLabel: string;
  placeholder?: string;
  initialValue?: string;
  autoFocus?: boolean;
  submitting?: boolean;
  error?: string | undefined;
  mentionCandidates?: readonly PersonView[] | undefined;
  onSubmit: (submission: ComposerSubmission) => Promise<void>;
  onCancel?: (() => void) | undefined;
}

export function Composer({
  label,
  submitLabel,
  placeholder,
  initialValue = "",
  autoFocus = false,
  submitting = false,
  error,
  mentionCandidates,
  onSubmit,
  onCancel,
}: ComposerProps) {
  const [text, setText] = useState(initialValue);
  const [caret, setCaret] = useState(initialValue.length);
  const [chosen, setChosen] = useState<PersonView[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissedStart, setDismissedStart] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const nextCaret = useRef<number | null>(null);
  const errorId = useId();
  const counterId = useId();
  const listId = useId();

  const busy = submitting || pending;
  const trimmed = text.trim();
  const tooLong = text.length > COMMENT_MAX_LENGTH;
  const canSubmit = !busy && trimmed.length > 0 && !tooLong;
  const message = error !== undefined && error !== "" ? error : failure;
  const showCounter = text.length >= COUNTER_THRESHOLD;
  const describedBy = [message === null ? "" : errorId, showCounter ? counterId : ""]
    .filter((id) => id !== "")
    .join(" ");

  const candidates = mentionCandidates ?? [];
  const mentionQuery = candidates.length === 0 ? null : findMentionQuery(text, caret);
  const atMentionLimit = mentionedIdsInBody(text, chosen).length >= MENTIONS_LIMIT;
  const suggestions =
    mentionQuery === null || mentionQuery.start === dismissedStart || atMentionLimit
      ? []
      : filterMentionCandidates(candidates, mentionQuery.query);
  const listOpen = suggestions.length > 0;
  const active = Math.min(activeIndex, Math.max(suggestions.length - 1, 0));
  const optionId = (index: number) => `${listId}-${String(index)}`;

  useLayoutEffect(() => {
    const element = textareaRef.current;
    if (element === null) {
      return;
    }
    element.style.height = "auto";
    const border = element.offsetHeight - element.clientHeight;
    element.style.height = `${String(Math.min(element.scrollHeight + border, COMPOSER_MAX_HEIGHT))}px`;
  }, [text]);

  useLayoutEffect(() => {
    const element = textareaRef.current;
    if (nextCaret.current !== null && element !== null) {
      element.setSelectionRange(nextCaret.current, nextCaret.current);
      nextCaret.current = null;
    }
  }, [text]);

  useEffect(() => {
    const element = textareaRef.current;
    if (autoFocus && element !== null) {
      element.focus();
      element.setSelectionRange(element.value.length, element.value.length);
    }
  }, [autoFocus]);

  async function submit() {
    if (!canSubmit) {
      return;
    }
    setPending(true);
    setFailure(null);
    try {
      await onSubmit({ body: trimmed, mentions: mentionedIdsInBody(trimmed, chosen) });
      setText("");
      setCaret(0);
      setChosen([]);
    } catch {
      setFailure(COMPOSER_FALLBACK_ERROR);
      textareaRef.current?.focus();
    } finally {
      setPending(false);
    }
  }

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const nextQuery = findMentionQuery(event.target.value, event.target.selectionStart);
    if (nextQuery?.start !== dismissedStart) {
      setDismissedStart(null);
    }
    setText(event.target.value);
    setCaret(event.target.selectionStart);
    setActiveIndex(0);
    setFailure(null);
  }

  function handleSelect(event: SyntheticEvent<HTMLTextAreaElement>) {
    const position = event.currentTarget.selectionStart;
    if (position !== caret) {
      setCaret(position);
      setActiveIndex(0);
    }
  }

  function pick(person: PersonView) {
    if (mentionQuery === null) {
      return;
    }
    const inserted = insertMention(text, mentionQuery.start, caret, person.displayName);
    nextCaret.current = inserted.caret;
    setText(inserted.text);
    setCaret(inserted.caret);
    setChosen((previous) =>
      previous.some((candidate) => candidate.id === person.id) ? previous : [...previous, person],
    );
    setActiveIndex(0);
    setFailure(null);
    textareaRef.current?.focus();
  }

  function handleSuggestionKey(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
    const target = suggestions[active];
    if (target === undefined || mentionQuery === null) {
      return false;
    }
    switch (event.key) {
      case "ArrowDown":
        setActiveIndex((active + 1) % suggestions.length);
        break;
      case "ArrowUp":
        setActiveIndex((active - 1 + suggestions.length) % suggestions.length);
        break;
      case "Enter":
      case "Tab":
        pick(target);
        break;
      case "Escape":
        event.stopPropagation();
        setDismissedStart(mentionQuery.start);
        break;
      default:
        return false;
    }
    event.preventDefault();
    return true;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void submit();
      return;
    }
    if (listOpen && handleSuggestionKey(event)) {
      return;
    }
    if (event.key === "Escape" && onCancel !== undefined) {
      event.stopPropagation();
      if (!busy) {
        onCancel();
      }
    }
  }

  function handleSubmit(event: FormSubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <textarea
        ref={textareaRef}
        aria-label={label}
        aria-describedby={describedBy === "" ? undefined : describedBy}
        aria-invalid={message !== null || tooLong}
        aria-busy={busy}
        aria-keyshortcuts="Control+Enter Meta+Enter"
        aria-autocomplete={candidates.length === 0 ? undefined : "list"}
        aria-controls={listOpen ? listId : undefined}
        aria-activedescendant={listOpen ? optionId(active) : undefined}
        rows={2}
        maxLength={COMMENT_MAX_LENGTH}
        placeholder={placeholder}
        readOnly={busy}
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onSelect={handleSelect}
        style={{ maxHeight: COMPOSER_MAX_HEIGHT }}
        className="block w-full resize-none overflow-y-auto rounded-md border border-neutral-300 bg-white px-2.5 py-2 text-sm leading-5 text-neutral-900 placeholder:text-neutral-600 read-only:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-700"
      />
      {listOpen ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Mention suggestions"
          className="max-h-44 overflow-y-auto rounded-md border border-neutral-200 bg-white py-1 shadow-md"
        >
          {suggestions.map((person, index) => (
            <li
              key={person.id}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onMouseMove={() => {
                if (index !== active) {
                  setActiveIndex(index);
                }
              }}
              onClick={() => {
                pick(person);
              }}
              className={`flex cursor-pointer items-center gap-2 px-2.5 py-1.5 ${index === active ? "bg-blue-50 text-blue-900" : "text-neutral-900"}`}
            >
              <Avatar person={person} />
              <span className="min-w-0 truncate">{person.displayName}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {message === null ? null : (
        <p
          id={errorId}
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-800"
        >
          {message}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 text-xs text-neutral-600">
          {showCounter ? (
            <span id={counterId} className={tooLong ? "font-semibold text-red-800" : undefined}>
              {text.length} / {COMMENT_MAX_LENGTH}
            </span>
          ) : (
            "Ctrl/Cmd+Enter to send"
          )}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {onCancel === undefined ? null : (
            <button type="button" onClick={onCancel} disabled={busy} className={SECONDARY_BUTTON}>
              Cancel
            </button>
          )}
          <button type="submit" disabled={!canSubmit} className={PRIMARY_BUTTON}>
            {submitLabel}
          </button>
        </span>
      </div>
    </form>
  );
}
