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
