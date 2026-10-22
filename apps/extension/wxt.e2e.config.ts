import { defineConfig } from "wxt";

import { createManifest } from "./src/manifest-config";
import baseConfig, { createViteConfig } from "./wxt.config";

export default defineConfig({
  ...baseConfig,
  manifest: () => createManifest({ e2e: true, webUrl: process.env.WXT_WEB_URL }),
  vite: () => createViteConfig(true),
  outDirTemplate: "{{browser}}-mv{{manifestVersion}}-e2e",
});
