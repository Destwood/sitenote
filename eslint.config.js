import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const DEFAULT_EXPORT_ALLOWED = [
  "**/*.config.{ts,js,mjs}",
  "apps/web/src/app/**/{page,layout,not-found,error,loading,route,template,default,global-error}.tsx",
  "apps/web/next.config.ts",
  "apps/extension/entrypoints/**",
];

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/out/**",
      "**/.next/**",
      "**/.output/**",
      "**/.wxt/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/next-env.d.ts",
      "packages/db/src/database-types/index.ts",
      "supabase/.branches/**",
      "supabase/.temp/**",
      "supabase/functions/_shared/supabase/**",
    ],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "no-restricted-exports": [
        "error",
        {
          restrictDefaultExports: {
            direct: true,
            named: true,
            defaultFrom: true,
            namedFrom: true,
            namespaceFrom: true,
          },
        },
      ],
    },
  },
  {
    files: ["**/*.{tsx,jsx}"],
    extends: [reactHooks.configs.flat["recommended-latest"]],
  },
  {
    files: ["apps/web/**/*.{ts,tsx,js,mjs}"],
    ...nextPlugin.configs["core-web-vitals"],
    rules: {
      ...nextPlugin.configs["core-web-vitals"].rules,
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  {
    files: ["packages/widget/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["wxt"],
          patterns: ["wxt/*", "@wxt-dev/*"],
        },
      ],
      "no-restricted-globals": ["error", "chrome", "browser"],
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["e2e/fixtures/site/**/*.js"],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: DEFAULT_EXPORT_ALLOWED,
    rules: {
      "no-restricted-exports": "off",
    },
  },
  prettier,
);
