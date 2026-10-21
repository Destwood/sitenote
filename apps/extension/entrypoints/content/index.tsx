import { defineContentScript } from "wxt/utils/define-content-script";

import { startContentScript } from "../../src/content-main";
import styles from "./style.css?inline";

export default defineContentScript({
  registration: "runtime",
  cssInjectionMode: "manual",
  noScriptStartedPostMessage: true,
  main: (ctx) => startContentScript(ctx, styles),
});
