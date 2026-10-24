import type { WidgetBackend } from "../backend";
import { ERROR_MESSAGES } from "../result";

export interface PreferenceClient {
  load: (siteId: string) => Promise<boolean>;
  save: (siteId: string, show: boolean) => Promise<void>;
}

export function createPreferenceClient(
  backend: Pick<WidgetBackend, "getPreference" | "setPreference">,
): PreferenceClient {
  return {
    load: async (siteId) => {
      const result = await backend.getPreference(siteId);
      return result.ok && result.data.showResolved;
    },
    save: async (siteId, show) => {
      const result = await backend.setPreference(siteId, show);
      if (!result.ok) {
        throw new Error(ERROR_MESSAGES[result.error.code]);
      }
    },
  };
}
