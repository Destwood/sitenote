import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type SubmitEvent as FormSubmitEvent,
} from "react";

import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "../control-classes";

export const COMMENT_MAX_LENGTH = 10_000;
export const COUNTER_THRESHOLD = 9_000;
export const COMPOSER_MAX_HEIGHT = 176;
export const COMPOSER_FALLBACK_ERROR = "Could not send. Your text is kept, try again.";

export interface ComposerProps {
  label: string;
  submitLabel: string;
  placeholder?: string;
  initialValue?: string;
  autoFocus?: boolean;
  submitting?: boolean;
  error?: string | undefined;
  onSubmit: (body: string) => Promise<void>;
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
  onSubmit,
  onCancel,
}: ComposerProps) {
  const [text, setText] = useState(initialValue);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const errorId = useId();
  const counterId = useId();

  const busy = submitting || pending;
  const trimmed = text.trim();
  const tooLong = text.length > COMMENT_MAX_LENGTH;
  const canSubmit = !busy && trimmed.length > 0 && !tooLong;
  const message = error !== undefined && error !== "" ? error : failure;
  const showCounter = text.length >= COUNTER_THRESHOLD;
  const describedBy = [message === null ? "" : errorId, showCounter ? counterId : ""]
    .filter((id) => id !== "")
    .join(" ");

  useLayoutEffect(() => {
    const element = textareaRef.current;
    if (element === null) {
      return;
    }
    element.style.height = "auto";
    const border = element.offsetHeight - element.clientHeight;
    element.style.height = `${String(Math.min(element.scrollHeight + border, COMPOSER_MAX_HEIGHT))}px`;
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
      await onSubmit(trimmed);
      setText("");
    } catch {
      setFailure(COMPOSER_FALLBACK_ERROR);
      textareaRef.current?.focus();
    } finally {
      setPending(false);
    }
  }

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setText(event.target.value);
    setFailure(null);
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
        rows={2}
        maxLength={COMMENT_MAX_LENGTH}
        placeholder={placeholder}
        readOnly={busy}
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        style={{ maxHeight: COMPOSER_MAX_HEIGHT }}
        className="block w-full resize-none overflow-y-auto rounded-md border border-neutral-300 bg-white px-2.5 py-2 text-sm leading-5 text-neutral-900 placeholder:text-neutral-600 read-only:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-700"
      />
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
