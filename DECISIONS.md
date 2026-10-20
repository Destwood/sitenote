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

- **Chosen:** pnpm workspaces (`apps/*`, `packages/*`, `e2e`) with Turborepo 2 for task orchestration. `packages/*` are private `@sitenote/*` packages whose `exports` point at `./src/index.ts`; they have no build step and are compiled by the consuming app's bundler (WXT, Next.js, Vitest). `@sitenote/ui` has no Tailwind build either: the consuming apps compile Tailwind 4 and add the package with `@source`. Dependency build scripts are gated by `strictDepBuilds: true` in `pnpm-workspace.yaml`, so an unreviewed install script fails the install; approvals go into pnpm 11 `allowBuilds`. No package needs one at the moment: `esbuild` was approved in step 1, but it is not in the lockfile (Vite 8 uses Rolldown, and neither Vitest 5, WXT 0.21 nor Next.js installs it), so the entry was removed together with the `allowBuilds` key. Root-level files (ESLint and Vitest configs, root `tsconfig.json`) are covered by Turborepo root tasks `//#lint:root` and `//#typecheck:root`, which every package `lint` and `typecheck` depends on.
- **Alternatives:** compiled packages (`tsup`/`tsc` build with `dist` exports); TypeScript project references; Nx; npm or yarn workspaces; `onlyBuiltDependencies` (older pnpm syntax).
- **Why:** source packages remove a build step and keep go-to-definition, HMR and tests pointing at real code. Turborepo is the lightest orchestrator that caches `lint`, `typecheck`, `test` and `build` per package. `allowBuilds` is the pnpm 11 mechanism and keeps installs deterministic and reviewable; an approval that matches no installed package is dead configuration and is removed.

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

| Package                         | Version | Where                                                                             |
| ------------------------------- | ------- | --------------------------------------------------------------------------------- |
| pnpm                            | 11.1.3  | root `packageManager`                                                             |
| turbo                           | 2.11.9  | root                                                                              |
| typescript                      | 6.0.3   | root                                                                              |
| @types/node                     | 24.19.2 | root                                                                              |
| eslint                          | 10.13.0 | root                                                                              |
| @eslint/js                      | 10.0.1  | root                                                                              |
| typescript-eslint               | 8.72.0  | root                                                                              |
| eslint-plugin-react-hooks       | 7.1.1   | root                                                                              |
| eslint-config-prettier          | 10.1.8  | root                                                                              |
| globals                         | 17.13.0 | root                                                                              |
| prettier                        | 3.9.10  | root                                                                              |
| vitest                          | 5.0.5   | root, `@sitenote/core`, `@sitenote/ui`                                            |
| react                           | 19.3.1  | `@sitenote/ui` (dev, peer `>=19.0.0 <20`), `@sitenote/extension`, `@sitenote/web` |
| react-dom                       | 19.3.1  | `@sitenote/ui` (dev, peer `>=19.0.0 <20`), `@sitenote/extension`, `@sitenote/web` |
| @types/react                    | 19.3.0  | `@sitenote/ui`, `@sitenote/extension`, `@sitenote/web`                            |
| @types/react-dom                | 19.3.0  | `@sitenote/ui`, `@sitenote/extension`, `@sitenote/web`                            |
| @testing-library/react          | 16.3.3  | `@sitenote/ui`                                                                    |
| @testing-library/dom            | 10.4.2  | `@sitenote/ui`                                                                    |
| happy-dom                       | 21.0.3  | `@sitenote/ui`                                                                    |
| wxt                             | 0.21.4  | `@sitenote/extension`                                                             |
| vite                            | 8.3.4   | `@sitenote/extension` (required peer of `wxt`, same version Vitest 5 resolves)    |
| tailwindcss                     | 4.3.3   | `@sitenote/extension`, `@sitenote/web`                                            |
| @tailwindcss/vite               | 4.3.3   | `@sitenote/extension`                                                             |
| postcss                         | 8.5.31  | `@sitenote/extension`, `@sitenote/web`                                            |
| postcss-rem-to-responsive-pixel | 7.0.8   | `@sitenote/extension`                                                             |
| next                            | 16.4.2  | `@sitenote/web`                                                                   |
| @tailwindcss/postcss            | 4.3.3   | `@sitenote/web`                                                                   |
| @next/eslint-plugin-next        | 16.4.2  | root                                                                              |
| supabase                        | 2.121.0 | root (CLI)                                                                        |

## D-015 WXT extension package layout, TypeScript setup and dev runner

- **Chosen:** `apps/extension` (`@sitenote/extension`) is a WXT 0.21 project with the default layout: `entrypoints/` at the package root, `wxt.config.ts`, output in `.output/` (`.output/chrome-mv3` for the Chrome build). Auto-imports are disabled (`imports: false`), so every WXT API is imported explicitly from `wxt/utils/*` and the code does not rely on generated globals. `tsconfig.json` extends `["./.wxt/tsconfig.json", "@sitenote/tsconfig/react.json"]`, in that order so the shared strict options win over WXT's, and its `include` lists `.wxt/wxt.d.ts`, `entrypoints` and `wxt.config.ts`. `.wxt/` is generated and gitignored, so the package has `"postinstall": "wxt prepare"`: `pnpm install` on a clean clone or in CI generates it before any `typecheck`. The manifest is built from `wxt.config.ts` (`name: "Sitenote"`, a one-line description) and takes `version` from `package.json`. No background script and no popup exist yet because phase 0 needs neither; WXT adds its dev-only background itself. There is no `test` script because the package has no unit tests; the extension is covered by Playwright end-to-end tests later. Dev runner: `webExt.disabled: true`, so `pnpm dev` builds and rebuilds into `.output/chrome-mv3` but never launches a browser. Load unpacked: open `chrome://extensions` (or `opera://extensions` in Opera GX), enable developer mode, choose "Load unpacked" and select `apps/extension/.output/chrome-mv3`. While `pnpm dev` runs, the dev build in that folder reloads on change; after a production `pnpm --filter @sitenote/extension build`, reload the extension manually.
- **Alternatives:** WXT auto-imports; a single `extends: "./.wxt/tsconfig.json"` with the shared options copied in; `prepare` instead of `postinstall`; letting WXT open Chrome or Firefox through `web-ext`; `@wxt-dev/module-react` and `@vitejs/plugin-react`.
- **Why:** explicit imports keep ESLint and `tsc` independent of generated globals. Extending both configs avoids duplicating the strict flags; WXT's own file only adds the `@`/`~` path aliases and `lib`/`module` defaults, and the shared config overrides the rest. `postinstall` is WXT's documented hook, pnpm runs it for workspace projects, and `wxt prepare` needs no browser. The owner uses Opera GX, which `web-ext` cannot launch. `@wxt-dev/module-react` only adds the React Vite plugin for fast refresh and auto-imports; Vite 8 already compiles JSX with the automatic runtime (see D-012) and a content script does not use fast refresh.

## D-016 Content script mounts the UI in a Shadow DOM root

- **Chosen:** `entrypoints/content/index.tsx` calls `createShadowRootUi` with `name: SITENOTE_ROOT_TAG` (from `@sitenote/core`), `position: "inline"` and `anchor: "body"`, and the content script sets `cssInjectionMode: "ui"` and `runAt: "document_idle"`. `onMount` creates a React 19 `createRoot` on the UI container and renders `HelloOverlay` from `@sitenote/ui`; `onRemove` unmounts that root. The CSS is imported from `entrypoints/content/style.css`, built into `content-scripts/content.css` and fetched by WXT into the shadow root; `content.css` is listed in `web_accessible_resources` for the same match patterns. The shadow root is `open` (the WXT default), so Playwright can pierce it.
- **Alternatives:** `position: "overlay"` or `"modal"`; `cssInjectionMode: "manifest"` or `"manual"`; an `iframe` UI; `createIntegratedUi`; a closed shadow root.
- **Why:** `HelloOverlay` positions itself with `fixed`, so the host element must not add layout: `inline` leaves the host as an empty inline element, `overlay` adds a zero-size relatively positioned block, and `modal` adds a full-viewport fixed layer that would swallow page clicks. `"manifest"` injection would put the Tailwind CSS, including preflight, into the host page. WXT's docs warn that the container may be `body`; in the installed `@webext-core/isolated-element` 3.0.0 it is a `div`, so `createRoot` is safe. Page styles cannot reach the overlay and its styles cannot reach the page; WXT resets inherited properties with `:host { all: initial !important }`.

## D-017 Tailwind 4 inside the shadow root

- **Chosen:** `style.css` is `@import "tailwindcss";` plus `@source "../../../../packages/ui/src";` and an `@source not` for `*.test.tsx` there. Tailwind 4.3.3 runs through `@tailwindcss/vite`. Three Shadow DOM pitfalls, each checked in the built CSS and in Chromium:
  - Theme variables: Tailwind 4 emits them on `:root, :host`, so they apply in the shadow tree without changes; WXT also rewrites `:root` to `:host` in the injected CSS.
  - `@property`: rules inside a shadow stylesheet are ignored, which leaves `--tw-shadow`, `--tw-ring-*`, `--tw-inset-*` and similar unregistered and makes `box-shadow` compute to `none`. WXT 0.21 already moves every `@property` and `@font-face` block out of the shadow CSS into a `<style wxt-shadow-root-document-styles>` element in the document head, removed again on unmount. Registered custom properties apply across shadow trees, so the initial values and `inherits: false` stay correct. Measured in Chromium: with that element the overlay has the full `shadow-lg`; with it removed `box-shadow` computes to `none`.
  - `rem`: the host page controls the `html` font size, which WXT's `all: initial` reset does not touch. `postcss-rem-to-responsive-pixel` (`rootValue: 16`, `propList: ["*"]`, `transformUnit: "px"`) runs in Vite's PostCSS stage after Tailwind generates the CSS, so theme variables become pixels (`--spacing: 4px`, `--text-sm: 14px`, `--radius-lg: 8px`) and every utility derives from them. Measured on a page with `html { font-size: 10px }` and on a default page: identical 14px text, 16px offsets and `12px 16px` padding.
- **Alternatives:** declaring the `--tw-*` initial values on `:host` (rejected: unregistered custom properties inherit, so a parent with `shadow-*` would leak `--tw-shadow` into a nested `ring-*` child; the only safe form is `*, ::before, ::after, ::backdrop`, which is Tailwind's own `@supports`-gated fallback and does not apply in Chromium); registering `@property` from our own code (duplicates WXT); leaving `rem` alone and trusting the host's font size; overriding the whole theme in `px` by hand; a hand-written PostCSS plugin instead of the package; `@import "tailwindcss" source(none)`.
- **Why:** reusing WXT's document-level registration is the smallest correct fix and is covered by the runtime measurement. The cost is that while the overlay is mounted the host page also gets `@property` registrations for names starting with `--tw-`; a host page that uses Tailwind 4 declares identical ones, and nothing else uses these names. `px` makes the overlay's size independent of arbitrary host `html` font sizes, which matters on the customer sites this tool targets; the trade-off is that the overlay ignores the user's browser default font size. Automatic source detection stays on so future extension components are picked up; it also generates one stray utility (`inline`, from the string `"inline"` in `index.tsx`), which is harmless.

## D-018 Phase 0 content script match patterns

- **Chosen:** `matches: ["http://localhost/*", "http://127.0.0.1/*"]`, no `<all_urls>`, no `permissions`, no `host_permissions`. A match pattern host without a port matches every port (Chrome match patterns documentation: the port is optional and acts as a wildcard unless given explicitly). Verified in Chromium with a server on a random port, on both `127.0.0.1` and `localhost`, while `127.0.0.2` did not match.
- **Alternatives:** `<all_urls>` or `https://*/*` now; `optional_host_permissions` with programmatic injection now.
- **Why:** phase 0 only needs the fixture site and the demo on a local dev server. This is temporary: phase 3 moves to optional host permissions requested per site, so the extension does not ask for access to every site at install time.

## D-019 Next.js web app: bundler, workspace packages and TypeScript

- **Chosen:** `apps/web` (`@sitenote/web`) is Next.js 16.4.2 with the App Router and `src/app/`, on Next's default bundler (Turbopack for both `next dev` and `next build`). `next.config.ts` sets `reactStrictMode: true` and `transpilePackages: ["@sitenote/core", "@sitenote/ui"]`, which is what makes the source-only workspace packages (D-010) compile; verified by importing both from a throwaway page in `next dev` and `next build` (`HelloOverlay` rendered with the `SITENOTE_ROOT_TAG` constant, and its Tailwind classes were present in the built CSS). `tsconfig.json` extends `@sitenote/tsconfig/react.json` and adds `allowJs: false`, `incremental`, `jsx: react-jsx` and the `next` plugin; `include` has `next-env.d.ts`, `next.config.ts`, `postcss.config.mjs`, `src`, `.next/types` and `.next/dev/types`. This is the shape Next 16 expects: `next build` did not rewrite the file. `next-env.d.ts` and `.next` are gitignored, so `typecheck` is `next typegen && tsc --noEmit -p tsconfig.json`: `next typegen` generates `next-env.d.ts` and the route types without building. `dev` and `start` pin port 3000. `apps/web/turbo.json` makes the web `build` depend on the web `typecheck` (`$TURBO_EXTENDS$` keeps the root `build` settings): both write to `.next` and `next-env.d.ts`, and running them in parallel could delete the generated types while `tsc` reads them. The page is a static placeholder landing; `@sitenote/core` and `@sitenote/ui` are already dependencies so later phases import them without touching the config.
- **Alternatives:** `next dev --webpack` and `next build --webpack`; compiled workspace packages; `experimental.externalDir`; an `@/*` path alias; `next lint` with `eslint-config-next`.
- **Why:** Turbopack is the default in Next 16 and handled the source packages without options, so there is nothing bundler-specific to maintain. `transpilePackages` is the supported way to consume TypeScript source from a monorepo package. A committed tsconfig that already matches Next's expectations avoids a dirty working tree after every build. `typegen` before `tsc` is Next's way to typecheck without a build. No path alias is configured because nothing needs one yet.

## D-020 Web styling: Tailwind 4 through PostCSS, system fonts

- **Chosen:** Tailwind 4.3.3 through `@tailwindcss/postcss` in `postcss.config.mjs` (Next's documented path). `src/app/globals.css` is `@import "tailwindcss";` plus the same `@source` and `@source not` pair as the extension for `packages/ui/src`, excluding `*.test.tsx`. There is no rem-to-px conversion: the web app owns its document and its `html` font size. The layout uses Tailwind's default `font-sans` system stack and no `next/font`.
- **Alternatives:** `@tailwindcss/vite` (Next is not Vite); `next/font/google`; `next/font/local` with a committed font file.
- **Why:** `next/font/google` downloads the font at build time, which makes CI builds depend on the network and on Google; the system stack keeps `next build` offline-safe and has no layout shift. A bundled font can be added later with `next/font/local` if the design needs one.

## D-021 `@next/eslint-plugin-next` with ESLint 10 flat config

- **Chosen:** `@next/eslint-plugin-next` 16.4.2 is a root devDependency and the root `eslint.config.js` applies its `core-web-vitals` flat config to `apps/web/**/*.{ts,tsx,js,mjs}` only, with `@next/next/no-html-link-for-pages` switched off.
- **Alternatives:** `eslint-config-next`; no Next rules; a per-package ESLint config in `apps/web`.
- **Why:** the plugin declares no peer on ESLint, loads under ESLint 10.13.0 and reports violations (checked with a throwaway file: `<img>` is flagged by `@next/next/no-img-element`). `no-html-link-for-pages` looks for a `pages/` directory, prints a warning on every run when there is none, and does not apply to the App Router. `eslint-config-next` would bring its own parser, React and import plugins that duplicate the root setup (D-011).

## D-022 WXT dev server on port 3100

- **Chosen:** `wxt.config.ts` sets `dev.server.port: 3100` with `strictPort: true`.
- **Alternatives:** WXT's default (first free port from 3000); moving the Next.js dev server to another port.
- **Why:** with both apps under `pnpm dev`, WXT's default picked 3000 because Next listens on the wildcard address while WXT binds `localhost`; on this machine `localhost` then resolved to WXT over IPv6 (`::1`) and returned 404 while `127.0.0.1` reached Next. A fixed port for WXT removes the race, and `strictPort` makes any future clash fail loudly instead of silently moving.

## D-023 Supabase CLI as a root devDependency and local config

- **Chosen:** `supabase` 2.121.0 as a root devDependency, run through `pnpm exec supabase`. Root scripts: `db:start` (`supabase start`), `db:stop`, `db:reset` (`supabase db reset`) and `db:status`. This release has no install script: the binaries come from platform `@supabase/cli-*` optional dependencies, so nothing is added to `allowBuilds` and installs work with `strictDepBuilds`. `supabase init` created `supabase/config.toml`; changes from the generated file: `project_id = "sitenote"` (the default was the directory name `Sitenote`), `[auth] site_url = "http://localhost:3000"`, `additional_redirect_urls = ["http://localhost:3000/**"]` and `enable_anonymous_sign_ins = true`, because guests join through Supabase anonymous auth (design section 6). Google OAuth is not configured; that is a manual step in phase 2. Every other setting, including analytics and the edge runtime, stays at the generated default. The first migration is `supabase/migrations/20261020181430_init.sql` from `supabase migration new init`, kept as the empty file the CLI creates (timestamps are UTC `YYYYMMDDHHMMSS`; later migrations use `supabase migration new <name>`).
- **Alternatives:** a globally installed Supabase CLI or Scoop; `npx supabase`; a no-op SQL statement in the first migration; `site_url` on `127.0.0.1`.
- **Why:** a pinned devDependency gives every contributor and CI the same CLI version with no global install. `localhost` matches the URL the Next.js dev server prints and the owner opens, and cookie and redirect origins must agree. Anonymous sign-ins are off by default and the guest flow cannot work without them. An empty file is what the CLI itself generates. The local stack needs Docker, which was not running when this was set up, so `supabase start`, applying the empty migration and the analytics service on Windows are not verified yet.
