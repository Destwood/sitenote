import { SplitButton } from "@sitenote/ui";
import { useEffect, useRef, useState } from "react";
import { browser } from "wxt/browser";

import { ERROR_CLASS } from "../form-controls";
import { Icon } from "../icon";
import { sendMessage } from "../message-client";
import type { RecordingPlacement } from "../messages";
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
  "inline-flex h-11 shrink-0 items-center gap-2 rounded-lg border border-neutral-200 bg-white text-sm font-semibold text-neutral-900 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:cursor-not-allowed disabled:opacity-60";

const PLACEMENTS = [
  { value: "start", label: "At start" },
  { value: "end", label: "At end" },
] as const;

interface RecordButtonProps {
  tabId: number;
  close?: () => void;
  onRecordAtStart?: (tabId: number) => Promise<MessageResult<null>>;
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

function prepareRecording(tabId: number): Promise<MessageResult<null>> {
  return sendMessage({ type: "recording.prepare", tabId });
}

export function RecordButton({
  tabId,
  close = closePopup,
  onRecordAtStart = prepareRecording,
}: RecordButtonProps) {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [placement, setPlacement] = useState<RecordingPlacement>("start");
  const chosenPlacement = useRef(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  async function refresh() {
    setView(await fetchView(tabId));
  }

  useEffect(() => {
    void fetchView(tabId).then(setView);
  }, [tabId]);

  useEffect(() => {
    let active = true;
    void sendMessage({ type: "preferences.getRecordingPlacement" }).then((result) => {
      if (active && !chosenPlacement.current) {
        if (result.ok) {
          setPlacement(result.data);
        } else {
          setFailed(ERROR_MESSAGES[result.error.code]);
        }
      }
    });
    return () => {
      active = false;
    };
  }, []);

  async function selectPlacement(next: RecordingPlacement) {
    chosenPlacement.current = true;
    setPlacement(next);
    setFailed(null);
    const result = await sendMessage({
      type: "preferences.setRecordingPlacement",
      placement: next,
    });
    if (!result.ok) {
      setFailed(ERROR_MESSAGES[result.error.code]);
    }
  }

  function fail(code: ErrorCode) {
    setFailed(ERROR_MESSAGES[code]);
    setBusy(false);
  }

  async function start() {
    setBusy(true);
    setFailed(null);
    setNotice(null);
    if (placement === "start") {
      const result = await onRecordAtStart(tabId);
      if (!result.ok) {
        fail(result.error.code);
        return;
      }
      setBusy(false);
      close();
      return;
    }
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
      {view.recording ? (
        <button
          type="button"
          onClick={() => void stop()}
          disabled={busy}
          className={`${RECORD_BUTTON_CLASS} px-3`}
        >
          <Icon name="record" size={15} className="text-red-600" />
          Stop recording
        </button>
      ) : (
        <SplitButton
          value={placement}
          options={PLACEMENTS}
          onAction={() => void start()}
          onSelect={(next) => void selectPlacement(next)}
          chooseLabel="Attach comment"
          menuLabel="Attach comment"
          menuTitle="Attach comment"
          disabled={busy}
          className="shrink-0 [&_[role=menu]]:inset-auto [&_[role=menu]]:right-0 [&_[role=menu]]:bottom-full [&_[role=menu]]:mb-1"
          buttonClassName={`${RECORD_BUTTON_CLASS} px-2`}
        >
          <Icon name="record" size={15} className="text-red-600" />
          Record
        </SplitButton>
      )}
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
