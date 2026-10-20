# Decisions

One entry per decision: what was chosen, the alternatives, and why. Newest at the bottom. Exact dependency versions are recorded here when a phase installs them.

## D-001 Browser extension as the delivery format

- **Chosen:** Chromium extension (Chrome, Edge, Opera GX).
- **Alternatives:** script snippet embedded in the site (like Marker.io); both.
- **Why:** works on any site without touching its code, including production sites the reviewer does not own. The snippet approach is kept as a post-MVP option because the demo page already needs an embed adapter.

## D-002 Comments anchor to an element or a text selection

- **Chosen:** two anchor kinds, `element` and `text`.
- **Alternatives:** element only; free-floating page coordinates.
- **Why:** element pins cover layout feedback, text anchors cover copy feedback. Page coordinates break on any layout change.

## D-003 Team workspaces with guest access

- **Chosen:** workspaces with owner, member and guest roles; guests join through an invite link with a display name only.
- **Alternatives:** personal local-only notes; local first, sync later.
- **Why:** the product is about collaboration with clients who will not create accounts.

## D-004 Supabase as the backend

- **Chosen:** Supabase (Auth, Postgres + RLS, Realtime, Storage, Edge Functions).
- **Alternatives:** Next.js API + Postgres (Neon) + NextAuth; Firebase.
- **Why:** realtime, auth, file storage and row-level security out of the box; local stack via Supabase CLI makes the whole app testable offline.

## D-005 Web app with landing, dashboard and demo

- **Chosen:** Next.js app with a landing page, dashboard, deep-link pages and a demo page that runs the widget without the extension.
- **Alternatives:** dashboard only; extension only.
- **Why:** people evaluating the project will not install an extension; the demo lets them try it in seconds.

## D-006 ClickUp: one-way task creation in MVP

- **Chosen:** create a ClickUp task from a thread, with a link back to the pin.
- **Alternatives:** full two-way status sync via webhooks in MVP; no integration in MVP.
- **Why:** delivers the main value with a fraction of the complexity; two-way sync is post-MVP.

## D-007 Tailwind 4 for styling

- **Chosen:** Tailwind 4 in both extension and web; compiled CSS injected into the extension's Shadow DOM.
- **Alternatives:** SCSS Modules + clsx.
- **Why:** one design system across both apps and faster iteration.

## D-008 Distribution decided after MVP

- **Chosen:** load unpacked during development; Chrome Web Store vs GitHub Release ZIP decided after MVP.
- **Why:** store review should not block building.

## D-009 Private repository until MVP

- **Chosen:** private GitHub repository, made public with a deployed demo and a README with a GIF.
- **Why:** the public profile should show a finished product, not an empty scaffold.

## D-010 pnpm workspace, Turborepo and internal packages consumed as source

- **Chosen:** pnpm workspaces (`apps/*`, `packages/*`, `e2e`) with Turborepo 2 for task orchestration. `packages/*` are private `@sitenote/*` packages whose `exports` point at `./src/index.ts`; they have no build step and are compiled by the consuming app's bundler (WXT, Next.js, Vitest). `@sitenote/ui` has no Tailwind build either: the consuming apps compile Tailwind 4 and add the package with `@source`. Build-script approval uses pnpm 11 `allowBuilds` in `pnpm-workspace.yaml` with `strictDepBuilds: true`, so an unreviewed dependency install script fails the install; only `esbuild` is approved for now. Root-level files (ESLint and Vitest configs, root `tsconfig.json`) are covered by Turborepo root tasks `//#lint:root` and `//#typecheck:root`, which every package `lint` and `typecheck` depends on.
- **Alternatives:** compiled packages (`tsup`/`tsc` build with `dist` exports); TypeScript project references; Nx; npm or yarn workspaces; `onlyBuiltDependencies` (older pnpm syntax).
- **Why:** source packages remove a build step and keep go-to-definition, HMR and tests pointing at real code. Turborepo is the lightest orchestrator that caches `lint`, `typecheck`, `test` and `build` per package. `allowBuilds` is the pnpm 11 mechanism and keeps installs deterministic and reviewable.

## D-011 ESLint flat config, Prettier and named-exports enforcement

- **Chosen:** one root `eslint.config.js` with `typescript-eslint` `strictTypeChecked` and `stylisticTypeChecked`, `projectService: true`, `@typescript-eslint/no-explicit-any: error`, `eslint-plugin-react-hooks` (`recommended-latest`) for `*.tsx`, and `eslint-config-prettier` last. Named exports are enforced with the built-in `no-restricted-exports` (`restrictDefaultExports` all enabled), switched off only for `**/*.config.{ts,js,mjs}`, Next.js route files under `apps/web/src/app/**`, `apps/web/next.config.ts` and `apps/extension/entrypoints/**`. Plain `.js`/`.mjs` files use `disableTypeChecked`. ESLint 10 resolves the config from the linted file's directory upward, so running `eslint .` inside a package picks up the root config and no per-package config file is needed. Prettier uses `printWidth: 100`, double quotes, semicolons, trailing commas everywhere and LF endings. `README.md` and `docs/` are listed in `.prettierignore` because Prettier would rewrite their existing tables and wrapping; `DECISIONS.md` is formatted.
- **Alternatives:** `import/no-default-export` from `eslint-plugin-import` or `eslint-plugin-import-x`; Biome; per-package ESLint configs; `eslint-plugin-prettier`.
- **Why:** `no-restricted-exports` ships with ESLint and has the exact option set needed, so there is no extra plugin to keep in sync with ESLint 10. Prettier runs as a separate formatter instead of an ESLint rule to keep lint fast and diffs unambiguous. One root config avoids drift between packages.

## D-012 Vitest projects and happy-dom for component tests

- **Chosen:** Vitest 5 with the `test.projects` API. The root `vitest.config.ts` lists `apps/*/vitest.config.ts` and `packages/*/vitest.config.ts`; each package has its own config and a `test` script `vitest run`, which is what Turborepo runs. `@sitenote/core` runs in the `node` environment with `passWithNoTests: true`. `@sitenote/ui` runs in `happy-dom` with Testing Library, a setup file that calls `cleanup()` after each test, and no `@vitejs/plugin-react` because Vite 8 transforms JSX itself with the automatic JSX runtime.
- **Alternatives:** `jsdom`; Vitest browser mode for component tests; the deprecated `vitest.workspace` file; `globals: true`.
- **Why:** the current `jsdom` 30 requires Node `^24.15.0` while the pinned toolchain (`.nvmrc` 24, local 24.12.0) is older, and `happy-dom` is faster and has no engine constraint. Real-browser behaviour is covered by Playwright end-to-end tests later. Explicit `cleanup()` keeps test globals off.

## D-013 TypeScript 6.0 instead of 7.0

- **Chosen:** `typescript` 6.0.3 and `@types/node` 24.19.2.
- **Alternatives:** `typescript` 7.0.2 (latest on npm); `@types/node` 26.6.5 (latest on npm).
- **Why:** `typescript-eslint` 8.72.0, the latest release, supports TypeScript `>=4.8.4 <6.1.0`, so type-checked linting does not work with TypeScript 7. `@types/node` follows the Node 24 runtime from `.nvmrc` and the `engines` field instead of the newest major. Revisit when `typescript-eslint` supports TypeScript 7.

## D-014 Phase 0 dependency versions

All versions are pinned exactly.

| Package                   | Version | Where                                     |
| ------------------------- | ------- | ----------------------------------------- |
| pnpm                      | 11.1.3  | root `packageManager`                     |
| turbo                     | 2.11.9  | root                                      |
| typescript                | 6.0.3   | root                                      |
| @types/node               | 24.19.2 | root                                      |
| eslint                    | 10.13.0 | root                                      |
| @eslint/js                | 10.0.1  | root                                      |
| typescript-eslint         | 8.72.0  | root                                      |
| eslint-plugin-react-hooks | 7.1.1   | root                                      |
| eslint-config-prettier    | 10.1.8  | root                                      |
| globals                   | 17.13.0 | root                                      |
| prettier                  | 3.9.10  | root                                      |
| vitest                    | 5.0.5   | root, `@sitenote/core`, `@sitenote/ui`    |
| react                     | 19.3.1  | `@sitenote/ui` (dev, peer `>=19.0.0 <20`) |
| react-dom                 | 19.3.1  | `@sitenote/ui` (dev, peer `>=19.0.0 <20`) |
| @types/react              | 19.3.0  | `@sitenote/ui`                            |
| @types/react-dom          | 19.3.0  | `@sitenote/ui`                            |
| @testing-library/react    | 16.3.3  | `@sitenote/ui`                            |
| @testing-library/dom      | 10.4.2  | `@sitenote/ui`                            |
| happy-dom                 | 21.0.3  | `@sitenote/ui`                            |
