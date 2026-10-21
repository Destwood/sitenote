import { browser } from "wxt/browser";
import type { ZodMiniType } from "zod/mini";

import {
  RESPONSE_SCHEMAS,
  authStateChangedSchema,
  commentModeResponseSchema,
  failure,
  type AuthState,
  type CommentModeState,
  type DataByRequestType,
  type ExtensionRequest,
  type ExtensionRequestType,
  type MessageResult,
} from "../messages";

function schemaFor<Type extends ExtensionRequestType>(
  type: Type,
): ZodMiniType<MessageResult<DataByRequestType[Type]>> {
  return RESPONSE_SCHEMAS[type];
}

export async function sendMessage<Request extends ExtensionRequest>(
  request: Request,
): Promise<MessageResult<DataByRequestType[Request["type"]]>> {
  try {
    const raw: unknown = await browser.runtime.sendMessage(request);
    const parsed = schemaFor<Request["type"]>(request.type).safeParse(raw);
    return parsed.success ? parsed.data : failure("unavailable");
  } catch {
    return failure("unavailable");
  }
}

export async function toggleCommentMode(tabId: number): Promise<MessageResult<CommentModeState>> {
  try {
    const raw: unknown = await browser.tabs.sendMessage(tabId, { type: "commentMode.toggle" });
    const parsed = commentModeResponseSchema.safeParse(raw);
    return parsed.success ? parsed.data : failure("page_unavailable");
  } catch {
    return failure("page_unavailable");
  }
}

export function onAuthStateChanged(listener: (state: AuthState) => void): () => void {
  const handler = (message: unknown, sender: { id?: string | undefined }): undefined => {
    if (sender.id !== browser.runtime.id) {
      return;
    }
    const parsed = authStateChangedSchema.safeParse(message);
    if (parsed.success) {
      listener(parsed.data.state);
    }
  };
  browser.runtime.onMessage.addListener(handler);
  return () => {
    browser.runtime.onMessage.removeListener(handler);
  };
}
