import type { SelectionPlacement } from "@sitenote/ui";

import type { StorageAreaLike } from "../session-storage";

const KEY = "sitenote.selectionPlacement";
const ABOVE = "above";

export interface SelectionPlacementPreference {
  load: () => Promise<SelectionPlacement>;
  save: (placement: SelectionPlacement) => Promise<void>;
}

export function createSelectionPlacementPreference(
  area: StorageAreaLike,
): SelectionPlacementPreference {
  return {
    load: async () => {
      try {
        return (await area.get(KEY))[KEY] === ABOVE ? "above" : "below";
      } catch {
        return "below";
      }
    },
    save: async (placement) => {
      await (placement === ABOVE ? area.set({ [KEY]: ABOVE }) : area.remove(KEY));
    },
  };
}
