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

## Develop against a cloud Supabase project

Use a cloud project instead of the local stack when Docker is not available. The free tier allows custom email templates only with custom SMTP, so its sign-in e-mail contains a link, not a code. The web app accepts that link, and the connect page hands the session to the extension.

```
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
supabase config push          # without the email template sections on the free tier
cp .env.cloud.example .env.cloud   # fill in SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY
pnpm db:env:cloud             # writes the same .env.local files as pnpm db:env
```

Start the web app with `pnpm --filter @sitenote/web dev`, sign in with the link from your e-mail, open "Connect the extension" in the header, then build the extension with `pnpm --filter @sitenote/extension build`. The popup's "Sign in on the website" button opens the same page. `.env.cloud` holds secrets and stays out of git.

## Web sign-in

The web app signs in with a 6-digit e-mail code. Locally the e-mail lands in Mailpit at http://127.0.0.1:54324. Any address works; the seeded users above have a workspace. The "Continue with Google" button appears only when `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true` and the Google provider is configured in Supabase.

```
pnpm db:start && pnpm db:env   # once per boot of the stack
pnpm e2e                       # builds the extension and the web app, then runs Playwright
```

## Invites and guests

Owners open "Invites" on a workspace row of `/app`, create a member or guest link (1, 7 or 30 days), copy it and revoke it. A guest opens the link, types a name and joins without an account; the page then hands the guest session to the Sitenote extension (`externally_connectable`, see D-084) and the guest enables a registered site from the popup. The extension manifest accepts the web app origin from `WXT_WEB_URL` (`NEXT_PUBLIC_WEB_URL` on the web side, both written by `pnpm db:env`); `NEXT_PUBLIC_EXTENSION_ID` defaults to the stable id.

## Extension sign-in

The popup signs in with the same 6-digit e-mail code, independently of the web app (each surface owns its own session). Build it after `pnpm db:env`, because WXT inlines `apps/extension/.env.local` at build time, then load `apps/extension/.output/chrome-mv3` unpacked. The extension id is stable (`anefihllkbkenhjbjggfndgemgkfaeoa`, from the manifest `key`), so `https://anefihllkbkenhjbjggfndgemgkfaeoa.chromiumapp.org/**` is already in the Supabase redirect allow-list. The Google button appears only with `WXT_AUTH_GOOGLE_ENABLED=true` and a configured provider.

```
pnpm db:start && pnpm db:env
pnpm --filter @sitenote/extension build
```

## Enabling Sitenote on a site

After signing in, open the popup on the page you want to review, pick a workspace and press "Enable on this site". Chrome asks for access to that origin only (the extension has no host access at install time), the origin is registered in the workspace (owners and members can register new origins, guests can enable origins that are already registered) and the content script is injected and registered for later visits. "Comment mode" in the popup, or `Alt+Shift+C`, toggles comment mode on the page; "Disable on this site" removes the registration and the permission.

The end-to-end suite loads a second build that also holds host permissions for `127.0.0.1` and `localhost`, because Playwright cannot answer Chrome's permission prompt (see D-068). It is built by `pnpm e2e`; to build it alone run `pnpm --filter @sitenote/extension build:e2e` (output `.output/chrome-mv3-e2e`). `pnpm check:manifest` verifies that the production manifest has no host permissions.

## Commenting on a page

On an enabled site, open comment mode from the popup or with `Alt+Shift+C`: the cursor becomes a crosshair, hovering outlines the element under the pointer, and a click on it drops a pin and opens the new thread form (the page does not see that click). Select any text, in or out of comment mode, and press the "Comment" button that appears above the selection to comment on the text, which is highlighted with the CSS Custom Highlight API. `Esc` cancels the pending thread, then leaves comment mode. The "Comments" button in the corner opens the list of threads of the page; threads whose element or text can no longer be found are listed under "Orphaned" instead of being lost. Replies, edits and deletions of your own comments, and Resolve and Reopen (owners and members for any thread, guests for their own), update for everyone on the page in real time. Pins follow scrolling and resizing, are placed again when the page changes, and the threads switch when a single page app changes its URL.

The end-to-end suite covers this on the fixture site and on `https://example.com` (it needs network access): `pnpm e2e` after `pnpm db:start && pnpm db:env`.

## Context of a comment

Every new thread stores the page context: a screenshot of the commented element or text (16 px of padding, WebP), the viewport and device pixel ratio, browser and system, the page title and URL, and the last 20 console errors, unhandled rejections and `console.error` calls of the page. The thread panel shows them under the comments. The popup's site panel has a "Capture console errors" switch per site. Chrome allows the screenshot only for a tab on which Sitenote was started from the toolbar popup or with `Alt+Shift+C` (`activeTab`, see D-097); without it the comment is saved without a screenshot and a notice says so.

## Docs

- [Design](docs/plans/2026-10-20-sitenote-design.md)
- [Implementation plan](docs/plans/2026-10-20-sitenote-implementation.md)
- [Decisions](DECISIONS.md)
