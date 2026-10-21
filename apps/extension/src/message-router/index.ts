import type { AuthService } from "../auth-service";
import { authRequestSchema, failure, type AuthResult, type AuthState } from "../messages";

export interface RouterSender {
  id?: string | undefined;
}

export interface MessageRouterDeps {
  extensionId: string;
  service: AuthService;
  onWake: () => Promise<void>;
}

export type RouterResponse = AuthResult<AuthState | null>;

export type MessageRouter = (message: unknown, sender: RouterSender) => Promise<RouterResponse>;

export function createMessageRouter(deps: MessageRouterDeps): MessageRouter {
  const { service } = deps;

  return async (message, sender) => {
    if (sender.id !== deps.extensionId) {
      return failure("forbidden_sender");
    }
    const parsed = authRequestSchema.safeParse(message);
    if (!parsed.success) {
      return failure("invalid_request");
    }
    const request = parsed.data;
    await deps.onWake().catch(() => undefined);

    switch (request.type) {
      case "auth.getState":
        return service.getState();
      case "auth.sendCode":
        return service.sendCode(request.email);
      case "auth.verifyCode":
        return service.verifyCode(request.email, request.code);
      case "auth.signInWithGoogle":
        return service.signInWithGoogle();
      case "auth.signOut":
        return service.signOut();
    }
  };
}
