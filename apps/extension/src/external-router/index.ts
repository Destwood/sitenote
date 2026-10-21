import * as z from "zod/mini";

import { senderOriginOf, type RouterSender } from "../message-router";
import { failure, success, type MessageResult } from "../messages";
import type { SessionHandoff } from "../session-handoff";

const MAX_TOKEN_LENGTH = 8192;

const tokenSchema = z.string().check(z.minLength(1), z.maxLength(MAX_TOKEN_LENGTH));

export const externalRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("external.ping") }),
  z.object({
    type: z.literal("external.session"),
    accessToken: tokenSchema,
    refreshToken: tokenSchema,
  }),
]);

export type ExternalRequest = z.infer<typeof externalRequestSchema>;

export interface ExternalRouterDeps {
  webOrigin: string;
  handoff: SessionHandoff;
}

export type ExternalRouter = (
  message: unknown,
  sender: RouterSender,
) => Promise<MessageResult<null>>;

export function createExternalRouter(deps: ExternalRouterDeps): ExternalRouter {
  return async (message, sender) => {
    if (senderOriginOf(sender) !== deps.webOrigin) {
      return failure("forbidden_sender");
    }
    const parsed = externalRequestSchema.safeParse(message);
    if (!parsed.success) {
      return failure("invalid_request");
    }
    const request = parsed.data;
    switch (request.type) {
      case "external.ping":
        return success(null);
      case "external.session":
        return deps.handoff.accept({
          accessToken: request.accessToken,
          refreshToken: request.refreshToken,
        });
    }
  };
}
