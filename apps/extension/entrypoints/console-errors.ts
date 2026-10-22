import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";

import { createErrorBuffer, installErrorCapture } from "../src/console-errors";

export default defineUnlistedScript(() => {
  installErrorCapture(window, createErrorBuffer());
});
