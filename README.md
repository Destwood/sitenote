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

## Docs

- [Design](docs/plans/2026-10-20-sitenote-design.md)
- [Implementation plan](docs/plans/2026-10-20-sitenote-implementation.md)
- [Decisions](DECISIONS.md)
