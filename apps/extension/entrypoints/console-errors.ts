import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";

import { createErrorBuffer, installErrorCapture } from "../src/console-errors";
import { createNetworkBuffer, installNetworkCapture } from "../src/network-errors";

export default defineUnlistedScript(() => {
  const network = createNetworkBuffer();
  installNetworkCapture(window, network);
  installErrorCapture(window, createErrorBuffer(), network);
});
