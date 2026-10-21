import { defineConfig } from "wxt";

import { createManifest } from "./src/manifest-config";
import baseConfig from "./wxt.config";

export default defineConfig({
  ...baseConfig,
  manifest: createManifest({ e2e: true }),
  outDirTemplate: "{{browser}}-mv{{manifestVersion}}-e2e",
});
