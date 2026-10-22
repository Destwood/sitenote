export const BADGE_CAP = 99;
export const BADGE_COLOR = "#1d4ed8";

export interface ActionLike {
  setBadgeText(details: { text: string }): Promise<void>;
  setBadgeBackgroundColor(details: { color: string }): Promise<void>;
}

export interface Badge {
  show: (count: number) => Promise<void>;
}

export function formatBadgeText(count: number): string {
  if (!Number.isFinite(count) || count < 1) {
    return "";
  }
  const whole = Math.floor(count);
  return whole > BADGE_CAP ? `${String(BADGE_CAP)}+` : String(whole);
}

export function createBadge(action: ActionLike): Badge {
  let colored = false;
  return {
    show: async (count) => {
      if (!colored) {
        await action.setBadgeBackgroundColor({ color: BADGE_COLOR });
        colored = true;
      }
      await action.setBadgeText({ text: formatBadgeText(count) });
    },
  };
}
