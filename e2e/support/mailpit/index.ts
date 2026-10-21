const MAILPIT_URL = "http://127.0.0.1:54324";
const DEFAULT_TIMEOUT_MS = 15000;
const POLL_INTERVAL_MS = 250;
const OTP_PATTERN = /\b(\d{6})\b/;

interface MessageSummary {
  ID: string;
}

interface MessageDetail {
  Text: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMessageSummary(value: unknown): value is MessageSummary {
  return isRecord(value) && typeof value.ID === "string";
}

function isMessageDetail(value: unknown): value is MessageDetail {
  return isRecord(value) && typeof value.Text === "string";
}

function searchUrl(address: string): string {
  return `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`;
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    throw new Error(`Mailpit answered ${String(response.status)} for ${response.url}`);
  }
  return response.json();
}

export async function clearMailbox(address: string): Promise<void> {
  const response = await fetch(searchUrl(address), { method: "DELETE" });
  if (!response.ok) {
    throw new Error(`Mailpit answered ${String(response.status)} when clearing ${address}`);
  }
}

async function latestCode(address: string): Promise<string | null> {
  const list = await readJson(await fetch(searchUrl(address)));
  if (!isRecord(list) || !Array.isArray(list.messages)) {
    throw new Error("Unexpected Mailpit search response");
  }
  const newest: unknown = list.messages[0];
  if (newest === undefined) {
    return null;
  }
  if (!isMessageSummary(newest)) {
    throw new Error("Unexpected Mailpit message summary");
  }
  const detail = await readJson(await fetch(`${MAILPIT_URL}/api/v1/message/${newest.ID}`));
  if (!isMessageDetail(detail)) {
    throw new Error("Unexpected Mailpit message");
  }
  return OTP_PATTERN.exec(detail.Text)?.[1] ?? null;
}

export async function waitForOtpCode(
  address: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const code = await latestCode(address);
    if (code !== null) {
      return code;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`No sign-in code arrived for ${address} within ${String(timeoutMs)} ms`);
}
