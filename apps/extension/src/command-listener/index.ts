import { TOGGLE_COMMENT_MODE_COMMAND } from "../manifest-config";

export interface CommandTab {
  id?: number | undefined;
}

export function createCommandListener(
  toggle: (tabId: number) => Promise<unknown>,
): (command: string, tab: CommandTab | undefined) => void {
  return (command, tab) => {
    if (command === TOGGLE_COMMENT_MODE_COMMAND && tab?.id !== undefined) {
      toggle(tab.id).catch(() => undefined);
    }
  };
}
