import tailwindcss from "@tailwindcss/vite";
import remToPx from "postcss-rem-to-responsive-pixel";
import { defineConfig } from "wxt";

import { createManifest } from "./src/manifest-config";

export function createViteConfig(e2e: boolean) {
  return {
    plugins: [tailwindcss()],
    css: {
      postcss: {
        plugins: [remToPx({ rootValue: 16, propList: ["*"], transformUnit: "px" })],
      },
    },
    define: { __SITENOTE_E2E__: JSON.stringify(e2e) },
  };
}

export default defineConfig({
  imports: false,
  webExt: {
    disabled: true,
  },
  dev: {
    server: {
      port: 3100,
      strictPort: true,
    },
  },
  manifest: () => createManifest({ e2e: false, webUrl: process.env.WXT_WEB_URL }),
  vite: () => createViteConfig(false),
});
