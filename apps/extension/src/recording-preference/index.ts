import type { RecordingPlacement } from "../messages";
import type { StorageAreaLike } from "../session-storage";

const KEY = "sitenote.recordingCommentPlacement";

export interface RecordingPreference {
  load: () => Promise<RecordingPlacement>;
  save: (placement: RecordingPlacement) => Promise<void>;
}

export function createRecordingPreference(area: StorageAreaLike): RecordingPreference {
  return {
    load: async () => ((await area.get(KEY))[KEY] === "end" ? "end" : "start"),
    save: async (placement) => {
      await (placement === "end" ? area.set({ [KEY]: "end" }) : area.remove(KEY));
    },
  };
}
