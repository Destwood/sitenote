import { ERROR_MESSAGES } from "@sitenote/widget";
import type { PageSessionDeps } from "../page-session";
import type { ResolvedPreference } from "../resolved-preference";

export function createPreferenceClient(send: PageSessionDeps["send"]): ResolvedPreference {
  return {
    load: async (siteId) => {
      const result = await send({ type: "preferences.get", siteId });
      return result.ok && result.data.showResolved;
    },
    save: async (siteId, show) => {
      const result = await send({ type: "preferences.set", siteId, showResolved: show });
      if (!result.ok) {
        throw new Error(ERROR_MESSAGES[result.error.code]);
      }
    },
  };
}
