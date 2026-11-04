import { useEffect, useState } from "react";
import { browser } from "wxt/browser";

import { ERROR_CLASS } from "../form-controls";
import { Icon } from "../icon";
import { sendMessage } from "../message-client";
import {
  ERROR_MESSAGES,
  failure,
  success,
  type ErrorCode,
  type MessageResult,
} from "@sitenote/widget";

const RECORDING_STARTED_MESSAGE = "Recording started. Use Stop recording on the page.";
const BUSY_STREAM_ERROR = "active stream";
const RECORD_BUTTON_CLASS =
  "inline-flex h-11 shrink-0 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-900 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:cursor-not-allowed disabled:opacity-60";

interface RecordButtonProps {
  tabId: number;
  close?: () => void;
}

type View = { kind: "loading" } | { kind: "unavailable" } | { kind: "ready"; recording: boolean };

function closePopup(): void {
  window.close();
}

async function requestStreamId(tabId: number): Promise<MessageResult<string>> {
  try {
    return success(await browser.tabCapture.getMediaStreamId({ targetTabId: tabId }));
  } catch (error) {
    return failure(
      String(error).includes(BUSY_STREAM_ERROR) ? "recording_busy" : "recording_failed",
    );
  }
}

async function fetchView(tabId: number): Promise<View> {
  const result = await sendMessage({ type: "recording.status", tabId });
  return result.ok
    ? { kind: "ready", recording: result.data.state === "recording" }
    : { kind: "unavailable" };
}

export function RecordButton({ tabId, close = closePopup }: RecordButtonProps) {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  async function refresh() {
    setView(await fetchView(tabId));
  }

  useEffect(() => {
    void fetchView(tabId).then(setView);
  }, [tabId]);

  function fail(code: ErrorCode) {
    setFailed(ERROR_MESSAGES[code]);
    setBusy(false);
  }

  async function start() {
    setBusy(true);
    setFailed(null);
    setNotice(null);
    const stream = await requestStreamId(tabId);
    if (!stream.ok) {
      fail(stream.error.code);
      return;
    }
    const result = await sendMessage({ type: "recording.start", tabId, streamId: stream.data });
    if (!result.ok) {
      fail(result.error.code);
      return;
    }
    setNotice(RECORDING_STARTED_MESSAGE);
    await refresh();
    setBusy(false);
    close();
  }

  async function stop() {
    setBusy(true);
    setFailed(null);
    setNotice(null);
    const result = await sendMessage({ type: "recording.stop", tabId });
    if (!result.ok) {
      fail(result.error.code);
      return;
    }
    await refresh();
    setBusy(false);
  }

  if (view.kind !== "ready") {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void (view.recording ? stop() : start())}
        disabled={busy}
        className={RECORD_BUTTON_CLASS}
      >
        <Icon name="record" size={15} className="text-red-600" />
        {view.recording ? "Stop recording" : "Record"}
      </button>
      {notice === null ? null : (
        <p role="status" className="w-full text-sm text-neutral-700">
          {notice}
        </p>
      )}
      {failed === null ? null : (
        <p role="alert" className={`${ERROR_CLASS} w-full`}>
          {failed}
        </p>
      )}
    </>
  );
}
