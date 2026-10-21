import tailwindcss from "@tailwindcss/vite";
import remToPx from "postcss-rem-to-responsive-pixel";
import { defineConfig } from "wxt";

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
  manifest: {
    name: "Sitenote",
    description: "Figma-style comments on any live website.",
  },
  vite: () => ({
    plugins: [tailwindcss()],
    css: {
      postcss: {
        plugins: [remToPx({ rootValue: 16, propList: ["*"], transformUnit: "px" })],
      },
    },
  }),
});
