# Sitenote — Implementation Plan

Date: 2026-10-20 · Design: [2026-10-20-sitenote-design.md](2026-10-20-sitenote-design.md) · Decisions: [DECISIONS.md](../../DECISIONS.md)

The agent builds everything. The owner only makes decisions and does the one-time manual steps listed in section 3. Work through the phases in order; tick checkboxes in this file as tasks land.

## 1. Working rules for the agent

- Read the design doc and `DECISIONS.md` before starting a phase.
- One branch per phase: `phase-<n>-<slug>`. Open a PR into `main` at the end of the phase with a summary and test results; merge only after the owner says so.
- Conventional commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`).
- TypeScript strict, no `any`, named exports, one module per folder, no code comments.
- Tests ship with the code in the same phase. A phase is done only when lint, typecheck, unit and e2e for that phase pass locally and in CI.
- Develop against local Supabase (`supabase start`, Docker) so nothing depends on cloud keys until deploy.
- Use the latest stable versions at install time and record exact versions in `DECISIONS.md`.
- Every non-trivial choice (library, algorithm, trade-off) gets a `D-xxx` entry in `DECISIONS.md` with alternatives and the reason.
- Never commit secrets; only `.env.example` holds variable names.
- When a phase needs a manual step from section 3, stop and ask for it at that moment, with exact instructions.

## 2. Phases

### Phase 0 — Foundation

- [x] pnpm workspace + Turborepo with `apps/extension`, `apps/web`, `packages/core`, `packages/ui`
- [x] Shared TS config, ESLint, Prettier, Vitest workspace config
- [x] WXT app with React 19 + Tailwind 4 rendering a hello overlay inside a Shadow DOM on a test page
- [x] Next.js App Router app with Tailwind 4 and a placeholder landing
- [x] Supabase CLI project in `supabase/`, local stack runs, first empty migration
- [x] Playwright config that builds the extension, loads it into Chromium and opens a local fixture site
- [x] GitHub Actions: install, lint, typecheck, unit, build on PR

Done when: `pnpm dev` runs both apps, the extension overlay shows on the fixture site in a Playwright test, CI is green.

### Phase 1 — Anchoring engine (`packages/core`)

- [x] URL normalization (`site`, `page`)
- [x] Element anchor creation: stable selector builder skipping hashed classes, nth-path fallback, fingerprint, relative offset
- [x] Element anchor resolution with fingerprint scoring and orphan result
- [x] Text anchor creation: exact, prefix, suffix, position, container
- [x] Text anchor resolution chain: container, document, position, orphan
- [x] Fixture suite: unchanged page, reordered siblings, changed classes, edited text, removed element, duplicated text, SPA re-render

Done when: every fixture case resolves or orphans as expected in unit and browser-mode tests.

### Phase 2 — Database, auth, workspaces

- [x] Migrations for all tables from the design, indexes, `updated_at` triggers
- [x] RLS policies per role and storage policies for `screenshots`
- [x] RLS test suite for owner, member, guest and outsider
- [x] Seed: one workspace, two members, one guest, a site, sample threads
- [x] Web: Google sign-in, auth callback, create workspace, list workspaces
- [x] Extension: background auth via `launchWebAuthFlow` + PKCE, session in `chrome.storage.local`, refresh, sign out; popup shows the signed-in user (e-mail code in the popup, Google via `launchWebAuthFlow` + PKCE behind a flag, see D-051)

Done when: a user signs in on web and in the extension against local Supabase and RLS tests pass.

### Phase 3 — Comment mode and threads in the extension

- [x] Popup: enable on this site (optional host permission), workspace picker, site registration
- [x] Comment mode toggle (popup button and keyboard shortcut)
- [x] Element picking: hover highlight, click to anchor, Escape to exit
- [x] Text selection: floating "Comment" button on selection
- [x] `packages/ui`: Pin, PinLayer, ThreadPanel, Composer, Sidebar list with orphaned section
- [x] Create thread and first comment, reply, edit and delete own comment
- [x] Re-resolve pins on DOM mutations and SPA navigation
- [x] Realtime: pins and comments appear for other users on the same page
- [x] E2E: two browser contexts see each other's pins and replies live

Done when: the full comment loop works on the fixture site and a real public site in e2e.

### Phase 4 — Statuses, mentions, guests

- [ ] Open / Resolved with permission rules; resolved pins hidden behind a toggle
- [ ] @mentions with member autocomplete, stored in `mentions`
- [ ] In-extension notifications list and badge count
- [ ] Invites: create, copy link, revoke, expiry
- [ ] `/invite/[token]`: anonymous sign-in, display name, join as guest, hand the session to the extension via `externally_connectable`
- [ ] E2E: guest joins by link and comments; guest cannot manage members or resolve others' threads

Done when: owner, member and guest flows pass e2e.

### Phase 5 — Automatic context

- [ ] Background screenshot: scroll element into view, `captureVisibleTab`, crop by rect and device pixel ratio, upload, signed URL
- [ ] Context record: viewport, DPR, browser, OS, page title
- [ ] MAIN-world console error buffer (last 20 errors and unhandled rejections) with nonce messaging and a per-site toggle
- [ ] Thread panel shows the screenshot and context
- [ ] E2E: screenshot exists and matches the element area; console error from the fixture appears in context

Done when: every new thread carries context and failures degrade gracefully.

### Phase 6 — Web dashboard and deep links

- [ ] Dashboard layout: workspace switcher, sites, threads table with filters (site, page, status, author), search
- [ ] Thread detail page with comments, screenshot, context, status actions
- [ ] Members and invites management
- [ ] `/t/[id]`: authorized thread view, extension ping, "Open on page" to `page_url#sitenote={id}`
- [ ] Content script handles `#sitenote=` by scrolling to and opening the thread
- [ ] E2E: deep link opens the page and focuses the right pin

Done when: everything created in the extension is manageable from the dashboard and links round-trip.

### Phase 7 — ClickUp and email

- [ ] Integrations page: save ClickUp token (Vault), choose team, space, list
- [ ] Edge Function `clickup-create-task`: task with description, context, deep link and screenshot attachment
- [ ] Thread chip with the task link; retry on failure
- [ ] Database webhook + Edge Function `notify-email` via Resend for replies and mentions
- [ ] Tests with mocked ClickUp and Resend HTTP; one manual smoke test against real services

Done when: a thread becomes a ClickUp task and a mention produces an email in the smoke test.

### Phase 8 — Landing, demo, launch

- [ ] Embed adapter for `packages/ui` with DOM-to-canvas screenshots
- [ ] `/demo`: sample page with seeded threads, anonymous guest session, rate limits, `demo-reset` scheduled function
- [ ] Landing: hero with a product video or GIF, features, demo CTA, install instructions, GitHub link
- [ ] Production Supabase project: migrations, secrets, auth providers
- [ ] Deploy web to Vercel; extension build pointed at production
- [ ] README: GIF, live demo link, architecture diagram, local setup, test commands
- [ ] Final QA pass: Lighthouse on landing, e2e against production web, keyboard and screen reader checks on the UI
- [ ] Owner decides distribution (Chrome Web Store or GitHub Release) and when to make the repo public

Done when: the demo link works for a visitor without the extension and the extension works on real sites against production.

## 3. One-time manual steps for the owner

| When | Step | Why |
|---|---|---|
| Phase 2 | Create a Google OAuth client and add the Supabase callback URL; paste client id and secret into local Supabase config | Google sign-in |
| Phase 7 | Generate a ClickUp personal token | Integration smoke test |
| Phase 7 | Create a Resend account and API key, verify a sender domain or use the test sender | Email |
| Phase 8 | Create a production Supabase project and put keys into `.env` and Vercel | Production backend |
| Phase 8 | Import the GitHub repo into Vercel | Web deploy |
| After MVP | Chrome Web Store developer account (one-time fee) if publishing there | Distribution |

## 4. Post-MVP backlog

- Two-way ClickUp status sync via webhooks
- Jira, GitHub Issues, Linear integrations
- Embeddable script snippet for site owners, reusing the embed adapter
- Breakpoint-specific pin visibility
- Live cursors and presence
- Firefox build
