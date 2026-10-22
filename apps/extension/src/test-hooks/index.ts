export const FAIL_NEXT_UPLOAD_MESSAGE = "__test.failNextUpload";

export interface TestHooks {
  consumeUploadFailure: () => boolean;
  handle: (message: unknown) => boolean;
}

function typeOf(message: unknown): unknown {
  return typeof message === "object" && message !== null && "type" in message
    ? message.type
    : undefined;
}

export function createTestHooks(): TestHooks {
  let failNextUpload = false;
  return {
    consumeUploadFailure: () => {
      const pending = failNextUpload;
      failNextUpload = false;
      return pending;
    },
    handle: (message) => {
      if (typeOf(message) !== FAIL_NEXT_UPLOAD_MESSAGE) {
        return false;
      }
      failNextUpload = true;
      return true;
    },
  };
}
