# Sitenote

Figma-style comments on any live website.

Click an element or select text, drop a pin, and discuss it in a thread with your team. Every comment carries a screenshot, viewport, browser and console errors, links straight back to the exact spot on the page, and turns into a ClickUp task in one click.

> Status: in development. See [the implementation plan](docs/plans/2026-10-20-sitenote-implementation.md).

## Features (MVP)

- Pin comments to a DOM element or to a text selection
- Threads with replies, @mentions and Open / Resolved status
- Team workspaces and guest access for clients via invite link, no sign-up
- Automatic context: element screenshot, viewport and breakpoint, browser, recent console errors
- Deep links to a single comment that open the page and scroll to the pin
- Web dashboard with every comment across sites and pages
- ClickUp: create a task from a comment with a link back to the pin
- Email notifications for replies and mentions
- Live demo page that works without installing the extension

## Stack

| Layer | Tech |
|---|---|
| Extension | WXT (Manifest V3), React 19, TypeScript, Tailwind 4, Shadow DOM |
| Web | Next.js (App Router), React 19, TypeScript, Tailwind 4 |
| Backend | Supabase: Auth, Postgres with RLS, Realtime, Storage, Edge Functions |
| Integrations | ClickUp API, Resend |
| Tooling | pnpm workspaces, Turborepo, Vitest, Playwright, GitHub Actions |

## Structure

```
apps/
  extension/   browser extension
  web/         landing, dashboard, deep links, demo
packages/
  core/        anchoring engine, shared types, data access
  ui/          pins, threads, composer shared by extension and demo
supabase/      migrations, RLS policies, edge functions
docs/plans/    design and implementation plan
```

## Local database

```
pnpm db:start     # local Supabase (Docker); applies migrations and supabase/seed.sql
pnpm db:env       # writes .env.local for web, extension and tests (gitignored)
pnpm test:rls     # row level security tests against the running stack
pnpm db:reset     # re-apply migrations and seed
pnpm db:types     # regenerate packages/db/src/database-types after a migration
pnpm db:lint      # supabase db lint
pnpm db:stop
```

Seeded local users (`owner@`, `member@`, `guest@`, `outsider@sitenote.test`) sign in with the password `sitenote-dev-password`.

## Web sign-in

The web app signs in with a 6-digit e-mail code. Locally the e-mail lands in Mailpit at http://127.0.0.1:54324. Any address works; the seeded users above have a workspace. The "Continue with Google" button appears only when `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true` and the Google provider is configured in Supabase.

```
pnpm db:start && pnpm db:env   # once per boot of the stack
pnpm e2e                       # builds the extension and the web app, then runs Playwright
```

## Extension sign-in

The popup signs in with the same 6-digit e-mail code, independently of the web app (each surface owns its own session). Build it after `pnpm db:env`, because WXT inlines `apps/extension/.env.local` at build time, then load `apps/extension/.output/chrome-mv3` unpacked. The extension id is stable (`anefihllkbkenhjbjggfndgemgkfaeoa`, from the manifest `key`), so `https://anefihllkbkenhjbjggfndgemgkfaeoa.chromiumapp.org/**` is already in the Supabase redirect allow-list. The Google button appears only with `WXT_AUTH_GOOGLE_ENABLED=true` and a configured provider.

```
pnpm db:start && pnpm db:env
pnpm --filter @sitenote/extension build
```

## Enabling Sitenote on a site

After signing in, open the popup on the page you want to review, pick a workspace and press "Enable on this site". Chrome asks for access to that origin only (the extension has no host access at install time), the origin is registered in the workspace (owners and members can register new origins, guests can enable origins that are already registered) and the content script is injected and registered for later visits. "Comment mode" in the popup, or `Alt+Shift+C`, toggles comment mode on the page; "Disable on this site" removes the registration and the permission.

The end-to-end suite loads a second build that also holds host permissions for `127.0.0.1` and `localhost`, because Playwright cannot answer Chrome's permission prompt (see D-068). It is built by `pnpm e2e`; to build it alone run `pnpm --filter @sitenote/extension build:e2e` (output `.output/chrome-mv3-e2e`). `pnpm check:manifest` verifies that the production manifest has no host permissions.

## Docs

- [Design](docs/plans/2026-10-20-sitenote-design.md)
- [Implementation plan](docs/plans/2026-10-20-sitenote-implementation.md)
- [Decisions](DECISIONS.md)
