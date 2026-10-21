import { browser } from "wxt/browser";
import type { ZodMiniType } from "zod/mini";

import {
  AUTH_RESPONSE_SCHEMAS,
  authStateChangedSchema,
  failure,
  type AuthDataByType,
  type AuthRequest,
  type AuthRequestType,
  type AuthResult,
  type AuthState,
} from "../messages";

function schemaFor<Type extends AuthRequestType>(
  type: Type,
): ZodMiniType<AuthResult<AuthDataByType[Type]>> {
  return AUTH_RESPONSE_SCHEMAS[type];
}

export async function sendMessage<Request extends AuthRequest>(
  request: Request,
): Promise<AuthResult<AuthDataByType[Request["type"]]>> {
  try {
    const raw: unknown = await browser.runtime.sendMessage(request);
    const parsed = schemaFor<Request["type"]>(request.type).safeParse(raw);
    return parsed.success ? parsed.data : failure("unavailable");
  } catch {
    return failure("unavailable");
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
