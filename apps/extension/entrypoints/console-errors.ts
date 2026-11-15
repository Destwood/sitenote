import { NETWORK_LOG_MAX } from "@sitenote/core";
import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";

import { createErrorBuffer, installErrorCapture } from "../src/console-errors";
import { createNetworkBuffer, installNetworkCapture } from "../src/network-errors";

export default defineUnlistedScript(() => {
  const network = createNetworkBuffer();
  const networkLog = createNetworkBuffer(undefined, NETWORK_LOG_MAX);
  installNetworkCapture(window, network, networkLog);
  installErrorCapture(window, createErrorBuffer(), network, networkLog);
});
