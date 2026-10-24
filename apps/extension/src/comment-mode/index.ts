import { commentModeToggleSchema, type CommentModeState } from "../messages";
import { type MessageResult } from "@sitenote/widget";

export interface ToggleSender {
  id?: string | undefined;
  tab?: unknown;
}

export interface ToggleListenerDeps {
  extensionId: string;
  toggle: () => MessageResult<CommentModeState>;
}

export type ToggleListener = (
  message: unknown,
  sender: ToggleSender,
  sendResponse: (response: MessageResult<CommentModeState>) => void,
) => void;

export function createToggleListener(deps: ToggleListenerDeps): ToggleListener {
  return (message, sender, sendResponse) => {
    if (sender.id !== deps.extensionId || sender.tab !== undefined) {
      return;
    }
    if (commentModeToggleSchema.safeParse(message).success) {
      sendResponse(deps.toggle());
    }
  };
}
