# Production deploy

One-time setup of the production Supabase project, the Vercel project and the extension build. Steps marked **owner** need an account or a secret that only the owner has; the rest is scripted or done by the agent once the credentials exist.

## 1. Supabase project (owner)

1. Create a project in an EU region and keep the database password.
2. Authentication, URL configuration:
   - Site URL: the production web URL.
   - Redirect URLs: `<web url>/**` and `https://<extension id>.chromiumapp.org/**` (the id is `NEXT_PUBLIC_EXTENSION_ID`).
3. Authentication, Sign In / Providers: Email on, **Anonymous sign-ins on** (guests and the demo need them). Google is optional (step 5).
4. Authentication, SMTP: set Resend as custom SMTP. The built-in mailer allows only a handful of messages per hour, which breaks sign-in.
5. Authentication, Email templates: the Magic link and Confirm signup templates must contain `{{ .ConfirmationURL }}` (the web sign-in waits for that link) and `{{ .Token }}` (the extension popup signs in with the code). The files in `supabase/templates/` do exactly that; `supabase config push` applies them with the subjects from `supabase/config.toml`.

## 2. Database and functions (agent, with `SUPABASE_ACCESS_TOKEN` and the project ref)

```bash
supabase link --project-ref <ref>
supabase db push
supabase config push
supabase functions deploy clickup-create-task clickup-hierarchy clickup-save-settings notify-email
supabase secrets set SITE_URL=<web url> WEBHOOK_SECRET=<random> RESEND_API_KEY=<key> EMAIL_FROM="Sitenote <noreply@your-domain>"
```

Then, once in the SQL editor, give the database trigger its endpoint and secret (the trigger does nothing while they are missing):

```sql
select vault.create_secret('https://<ref>.supabase.co/functions/v1/notify-email', 'notify_email_url');
select vault.create_secret('<the same WEBHOOK_SECRET>', 'notify_email_webhook_secret');
```

`pg_cron` schedules `sitenote-demo-reset` (03:17 daily) from the migration; check that it exists under Integrations, Cron.

## 3. Web on Vercel (owner imports the repo, agent can supply the values)

Root directory `apps/web`, framework Next.js, Node 24. Environment variables:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | project URL and publishable key |
| `SUPABASE_SECRET_KEY` | secret key, server only, never `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_WEB_URL` | the production web URL, no trailing slash (the session endpoint compares it with `Origin`) |
| `NEXT_PUBLIC_EXTENSION_ID` | optional, defaults to the stable id from the manifest key |
| `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` | `true` only when step 5 is done |
| `NEXT_PUBLIC_GITHUB_URL` | optional, shows the GitHub link on the landing |

## 4. Extension build against production

```bash
WXT_SUPABASE_URL=... WXT_SUPABASE_PUBLISHABLE_KEY=... WXT_WEB_URL=<web url> WXT_AUTH_GOOGLE_ENABLED=false \
  pnpm --filter @sitenote/extension build
pnpm check:manifest
pnpm --filter @sitenote/extension exec wxt zip
```

`check:manifest` fails when the build still points at localhost or asks for host permissions at install time.

## 5. Google sign-in (owner, optional)

Create an OAuth client, add `<supabase url>/auth/v1/callback` as the redirect URI, paste the client id and secret into Supabase, Authentication, Providers, Google, and set `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true` and `WXT_AUTH_GOOGLE_ENABLED=true`.

## 6. Smoke test with the real services (owner supplies the tokens)

1. Sign in with the e-mail link on the production web, create a workspace.
2. Integrations: save a real ClickUp token, pick a list, create a task from a thread and open it in ClickUp.
3. Reply to a thread as a second user and check that the notification e-mail arrives through Resend.
4. Open `/demo` signed out and wait for the daily reset or call `select public.reset_demo()`.
