# Sitenote — Design

Date: 2026-10-20 · Status: approved

## 1. Product

Sitenote brings Figma-style comments to any live website. A reviewer turns on comment mode in the browser extension, clicks an element or selects text, and leaves a comment. The comment becomes a pin on the page and a thread the whole team sees in real time. Clients join as guests through an invite link. Each thread can become a ClickUp task, and every thread has a deep link that opens the page and scrolls to the pin.

Primary users:

| User | Needs |
|---|---|
| Developer / agency team member | Collect precise feedback on staging and production sites, turn it into tasks |
| Client (guest) | Point at what is wrong and say why, without accounts or technical skills |
| Evaluator (recruiter, tech lead) | Understand and try the product in seconds from a link |

## 2. MVP scope

In scope:

- Comment mode in the extension with element picking (hover highlight, click to pin) and text selection anchoring
- Threads: comment, reply, edit and delete own comment, Open / Resolved status, @mentions with autocomplete
- Workspaces with roles owner / member / guest; invite links; guests join with a display name only
- Sites belong to a workspace; the extension is enabled per site
- Automatic context on the first comment of a thread: element screenshot, viewport size, device pixel ratio, browser and OS, last console errors (toggle)
- Deep links `/{web}/t/{threadId}`
- Web: landing, dashboard (workspaces, sites, threads list with filters, thread detail, members, invites, integrations), demo page
- ClickUp: connect with a personal token, pick a list, create a task from a thread with screenshot and link back
- Email notifications (Resend) for replies and mentions to members with an email
- Realtime updates of pins and threads for everyone on the same page

Out of scope (post-MVP):

- Two-way ClickUp status sync, other trackers (Jira, GitHub Issues, Linear)
- Chrome Web Store publishing (decided after MVP), Firefox and Safari
- Breakpoint-specific pin visibility, live cursors and presence
- Embeddable script snippet for site owners (the demo embed adapter is the starting point)
- Billing, plans, usage limits beyond abuse protection

## 3. Architecture

pnpm workspaces + Turborepo.

| Package | Responsibility |
|---|---|
| `apps/extension` | WXT, Manifest V3. Background service worker (auth, session, screenshot capture, API proxy, badge). Content script (overlay, picking, pins, threads UI in Shadow DOM). MAIN-world script (console error buffer). Popup (sign in, enable on this site, workspace switch). |
| `apps/web` | Next.js App Router. Landing `/`, demo `/demo`, auth callback, dashboard `/app/...`, deep link `/t/[id]`, invite `/invite/[token]`. |
| `packages/core` | Anchoring engine (create + resolve anchors), URL normalization, shared types, zod schemas, Supabase data access functions, mention parsing. Framework-free, fully unit tested. |
| `packages/ui` | React components shared by the extension and the demo: Pin, PinLayer, ThreadPanel, Composer with mentions, StatusToggle, Sidebar list. Receives data and callbacks through props; no chrome APIs. |
| `supabase/` | SQL migrations, RLS policies, seed for local dev, Edge Functions `clickup-*`, `notify-email`, `demo-reset`. |

Platform adapters keep `packages/ui` portable:

| Adapter | Where | Provides |
|---|---|---|
| Extension adapter | `apps/extension` | Auth via background, screenshots via `captureVisibleTab`, storage via `chrome.storage` |
| Embed adapter | `apps/web` demo | Anonymous guest session in the demo workspace, DOM-to-canvas screenshots, localStorage |

## 4. Anchoring

The anchoring engine is the core of the product and lives in `packages/core/anchoring`.

Element anchor:

```ts
type ElementAnchor = {
  kind: "element";
  selectors: { id?: string; testId?: string; css: string; nthPath: string };
  fingerprint: { tag: string; text: string; classes: string[]; width: number; height: number };
  offset: { x: number; y: number };
};
```

- `css` is the shortest unique selector built from stable attributes (id, data-*, aria-label, role, name), skipping hashed class names (CSS modules, styled-components patterns).
- `nthPath` is a full `:nth-of-type` path from `body` as a fallback.
- `offset` is the click position inside the element as a 0–1 fraction, so the pin stays on the same spot when the element resizes.
- Resolution: try selectors in order; accept a unique match whose fingerprint similarity is above a threshold; otherwise score candidates of the same tag by fingerprint; below threshold the thread is **orphaned** (shown in the sidebar list, never lost).

Text anchor (W3C Web Annotation model):

```ts
type TextAnchor = {
  kind: "text";
  quote: { exact: string; prefix: string; suffix: string };
  position: { start: number; end: number };
  container: string;
};
```

- `prefix` and `suffix` are up to 32 characters around the selection; `container` is the css selector of the nearest block ancestor.
- Resolution: search `exact` inside the container, disambiguate with prefix and suffix, fall back to document-wide search, then to position, then orphan. Highlight via the CSS Custom Highlight API with a fallback overlay.

Lifecycle: resolve on load, re-resolve on debounced `MutationObserver` changes and on SPA navigation (`navigation` events or history patching). Pins render in a fixed overlay layer positioned from `getBoundingClientRect`, updated on scroll and resize via `requestAnimationFrame`, only for pins in view (`IntersectionObserver`).

Page identity: `site = origin`, `page = origin + pathname` without trailing slash; query and hash ignored.

## 5. Data model

All tables have `id uuid`, `created_at`, `updated_at`. RLS is enabled on every table.

| Table | Key columns |
|---|---|
| `profiles` | `user_id` (auth.users), `display_name`, `avatar_url`, `email` nullable |
| `workspaces` | `name`, `owner_id` |
| `members` | `workspace_id`, `user_id`, `role` (owner, member, guest) |
| `invites` | `workspace_id`, `token`, `role`, `expires_at`, `created_by`, `revoked_at` |
| `sites` | `workspace_id`, `origin` (unique per workspace) |
| `threads` | `site_id`, `page_url`, `anchor` jsonb, `status` (open, resolved), `context` jsonb, `screenshot_path`, `created_by`, `resolved_by`, `clickup_task_id`, `clickup_task_url` |
| `comments` | `thread_id`, `author_id`, `body`, `mentions uuid[]`, `edited_at`, `deleted_at` |
| `notifications` | `user_id`, `thread_id`, `comment_id`, `kind` (reply, mention), `read_at` |
| `integrations` | `workspace_id`, `provider` (clickup), `settings` jsonb (list id), secret stored in Supabase Vault and read only by Edge Functions |

RLS rules:

- A user reads a workspace and everything under it only if they are a member.
- Members and guests create threads and comments; authors edit and delete their own comments; owners and members change status; guests can resolve only their own threads.
- Owners manage members, invites, sites and integrations.
- Storage bucket `screenshots` is private; access through signed URLs, path prefixed by workspace id and covered by policies.

## 6. Auth

- Members sign in with Google through Supabase Auth. In the extension, the background worker runs `chrome.identity.launchWebAuthFlow` with the Supabase OAuth URL (PKCE) and exchanges the code for a session. The session is stored in `chrome.storage.local`; the background worker owns refresh.
- Guests open `/invite/{token}`, sign in anonymously (Supabase anonymous auth), enter a display name and become `guest` members. The web page hands the session to the extension through `externally_connectable` messaging; if the extension is missing, the page shows install instructions.
- The content script never stores tokens; it asks the background worker for data or for a short-lived access token for the Realtime channel.

## 7. Key flows

Create a thread:

1. User enables Sitenote on the site (popup requests optional host permission for the origin).
2. Comment mode: hover highlights elements; click creates an element anchor, text selection plus the floating button creates a text anchor.
3. Composer opens next to the pin; on submit, the content script sends the anchor and context to the background worker.
4. Background captures the visible tab, crops to the element rect using device pixel ratio, uploads to Storage, inserts the thread and first comment.
5. Realtime broadcasts the insert; every client on that page renders the pin.

Deep link:

1. `/t/{id}` loads the thread server-side for an authorized user.
2. If the extension answers a ping, the page offers "Open on page", which navigates to `page_url#sitenote={id}`.
3. The content script sees the hash, resolves the anchor, scrolls into view and opens the thread. Without the extension the page shows the thread, the screenshot and install instructions.

ClickUp task:

1. Owner connects ClickUp with a personal token and picks team, space and list in the dashboard.
2. "Create ClickUp task" in a thread calls the `clickup-create-task` Edge Function: task name from the first comment, description with page URL, context and deep link, screenshot as an attachment.
3. Task id and URL are saved on the thread and shown as a chip.

Email notification:

1. A database webhook on `comments` insert calls `notify-email`.
2. Recipients: thread participants and mentioned users, minus the author and users without an email.
3. One email per recipient with the comment, the page and the deep link.

Demo:

1. `/demo` renders a sample landing page with the embed adapter mounted.
2. The visitor gets an anonymous guest session in the shared demo workspace with seeded threads.
3. `demo-reset` (scheduled) restores the demo workspace daily; inserts are rate limited per session.

## 8. Error handling

- Network and Supabase errors surface as inline toasts in the Shadow DOM UI with retry; unsent comments stay in the composer.
- Orphaned anchors are listed in the sidebar with the stored screenshot instead of disappearing.
- Pages that block extension injection (chrome://, Web Store, PDF viewer) show a clear "not available here" state in the popup.
- Strict CSP pages: UI is rendered inside the extension's content script world with CSS injected into the shadow root, no inline scripts on the page.
- Screenshot failures do not block the comment; the thread is saved with `screenshot_path = null`.
- Edge Functions validate input with zod and return typed errors; ClickUp and Resend failures are shown on the thread and can be retried.

## 9. Security

- Treat page DOM, comment bodies and URLs as untrusted: render text only, no HTML injection, sanitize links.
- RLS is the source of truth for authorization; tests cover every policy.
- Secrets (service role key, ClickUp token, Resend key) live only in Edge Function secrets or Supabase Vault, never in the extension bundle.
- MAIN-world script communicates with the content script through `window.postMessage` with a per-page nonce and only sends serialized error records.
- Optional host permissions per site instead of blanket `<all_urls>` at install.

## 10. Testing

| Level | Tool | Covers |
|---|---|---|
| Unit | Vitest | URL normalization, mention parsing, anchor creation and resolution against HTML fixtures (layout-dependent cases in Vitest browser mode) |
| Database | Supabase CLI + pgTAP or Vitest against local Supabase | RLS policies for each role |
| Component | Vitest + Testing Library | Composer, mentions autocomplete, thread panel states |
| End-to-end | Playwright with the built extension loaded in Chromium and a local fixture site | Pick element, select text, reply, resolve, realtime across two contexts, deep link, guest invite, demo page |
| CI | GitHub Actions | lint, typecheck, unit, build on every PR; e2e with local Supabase |
