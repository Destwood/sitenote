create extension if not exists pg_cron with schema pg_catalog;

create function private.demo_workspace_id()
returns uuid
language sql
immutable
set search_path = ''
as $$
  select '00000000-0000-4000-8000-00000000d3e0'::uuid
$$;

create function private.demo_owner_id()
returns uuid
language sql
immutable
set search_path = ''
as $$
  select '00000000-0000-4000-8000-00000000d3e1'::uuid
$$;

create function private.ensure_demo_workspace()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    email_change_token_current,
    phone_change,
    phone_change_token,
    reauthentication_token,
    is_sso_user,
    is_anonymous,
    banned_until
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    private.demo_owner_id(),
    'authenticated',
    'authenticated',
    null,
    null,
    null,
    '{}'::jsonb,
    '{"full_name":"Sitenote team"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    false,
    false,
    '2999-12-31 00:00:00+00'
  )
  on conflict (id) do nothing;

  insert into public.workspaces (id, name, owner_id)
  values (private.demo_workspace_id(), 'Sitenote demo', private.demo_owner_id())
  on conflict (id) do nothing;
end;
$$;

create function private.demo_element_anchor(
  p_test_id text,
  p_tag text,
  p_text text,
  p_width integer,
  p_height integer
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'kind', 'element',
    'selectors', jsonb_build_object(
      'testId', p_test_id,
      'css', '[data-testid="' || p_test_id || '"]',
      'nthPath', 'main > ' || p_tag
    ),
    'fingerprint', jsonb_build_object(
      'tag', p_tag,
      'text', p_text,
      'classes', '[]'::jsonb,
      'width', p_width,
      'height', p_height
    ),
    'offset', jsonb_build_object('x', 0.5, 'y', 0.5)
  )
$$;

create function private.demo_text_anchor(p_test_id text, p_exact text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'kind', 'text',
    'quote', jsonb_build_object('exact', p_exact, 'prefix', '', 'suffix', ''),
    'position', jsonb_build_object('start', 0, 'end', char_length(p_exact)),
    'container', '[data-testid="' || p_test_id || '"]'
  )
$$;

create function private.seed_demo_site(p_site_id uuid, p_origin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := private.demo_owner_id();
  seed record;
  created_id uuid;
begin
  for seed in
    select v.anchor, v.body
    from (
      values
        (
          private.demo_element_anchor('demo-hero-title', 'h1', 'Comments that stay on the page', 640, 56),
          'Is this headline too strong for the pricing audience?'
        ),
        (
          private.demo_element_anchor('demo-feature-pins', 'article', 'Pin to elements', 320, 180),
          'Could we show the pin count next to each feature?'
        ),
        (
          private.demo_element_anchor('demo-pricing-team', 'article', 'Team plan', 320, 420),
          'The team price looks right. Please confirm the annual discount is visible.'
        ),
        (
          private.demo_text_anchor(
            'demo-testimonial-quote',
            'Feedback lands on the exact button it is about, so we stopped losing it in email threads.'
          ),
          'Design should check the wording of this quote.'
        )
    ) as v (anchor, body)
  loop
    insert into public.threads (site_id, page_url, anchor, created_by)
    values (p_site_id, p_origin || '/demo', seed.anchor, owner_id)
    returning id into created_id;

    insert into public.comments (thread_id, author_id, body)
    values (created_id, owner_id, seed.body);
  end loop;
end;
$$;

create function private.demo_limit_threads()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  site_workspace uuid;
begin
  select s.workspace_id
  into site_workspace
  from public.sites s
  where s.id = new.site_id;

  if site_workspace = private.demo_workspace_id()
    and new.created_by is distinct from private.demo_owner_id()
    and (
      select count(*)
      from public.threads t
      where t.created_by = new.created_by
        and t.workspace_id = site_workspace
        and t.created_at > now() - interval '1 hour'
    ) >= 10
  then
    raise exception 'demo_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create function private.demo_limit_comments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  thread_workspace uuid;
begin
  select t.workspace_id
  into thread_workspace
  from public.threads t
  where t.id = new.thread_id;

  if thread_workspace = private.demo_workspace_id()
    and new.author_id is distinct from private.demo_owner_id()
    and (
      select count(*)
      from public.comments c
      where c.author_id = new.author_id
        and c.workspace_id = thread_workspace
        and c.created_at > now() - interval '1 hour'
    ) >= 30
  then
    raise exception 'demo_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger demo_limit before insert on public.threads
  for each row execute function private.demo_limit_threads();
create trigger demo_limit before insert on public.comments
  for each row execute function private.demo_limit_comments();

create or replace function private.comments_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.workspace_id = private.demo_workspace_id() then
    return new;
  end if;

  with mentioned as (
    select distinct mention as user_id
    from unnest(new.mentions) as mention
  ),
  participants as (
    select t.created_by as user_id
    from public.threads t
    where t.id = new.thread_id
    union
    select c.author_id
    from public.comments c
    where c.thread_id = new.thread_id and c.deleted_at is null
  ),
  recipients as (
    select m.user_id, 'mention'::public.notification_kind as kind
    from mentioned m
    union all
    select p.user_id, 'reply'::public.notification_kind
    from participants p
    where p.user_id is not null
      and p.user_id not in (select m.user_id from mentioned m)
  )
  insert into public.notifications (user_id, workspace_id, thread_id, comment_id, kind)
  select r.user_id, new.workspace_id, new.thread_id, new.id, r.kind
  from recipients r
  where r.user_id is distinct from new.author_id
    and exists (
      select 1
      from public.members mb
      where mb.workspace_id = new.workspace_id and mb.user_id = r.user_id
    );
  return new;
end;
$$;

create function public.join_demo(p_display_name text)
returns table (workspace_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := (select auth.uid());
  clean_name text;
begin
  if uid is null then
    raise exception 'sign in to join the demo' using errcode = '28000';
  end if;

  if not private.is_anonymous() then
    raise exception 'only anonymous visitors can join the demo' using errcode = '42501';
  end if;

  clean_name := regexp_replace(coalesce(p_display_name, ''), '^\s+|\s+$', '', 'g');
  if char_length(clean_name) not between 1 and 40 then
    raise exception 'a display name of 1 to 40 characters is required' using errcode = '22023';
  end if;

  perform private.ensure_demo_workspace();

  insert into public.members (workspace_id, user_id, role)
  values (private.demo_workspace_id(), uid, 'guest')
  on conflict (workspace_id, user_id) do nothing;

  update public.profiles set display_name = clean_name where user_id = uid;

  return query select private.demo_workspace_id();
end;
$$;

create function public.demo_site(p_origin text)
returns table (site_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  allowed_origin text := (
    select ds.decrypted_secret
    from vault.decrypted_secrets ds
    where ds.name = 'demo_origin'
  );
  created_site uuid;
begin
  if uid is null or not exists (
    select 1
    from public.members m
    where m.workspace_id = private.demo_workspace_id() and m.user_id = uid
  ) then
    raise exception 'join the demo before using it' using errcode = '42501';
  end if;

  if not coalesce(
    p_origin ~ '^https?://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?$'
    or p_origin = allowed_origin,
    false
  ) then
    raise exception 'this origin is not allowed for the demo' using errcode = '22023';
  end if;

  insert into public.sites (workspace_id, origin)
  values (private.demo_workspace_id(), p_origin)
  on conflict (workspace_id, origin) do nothing
  returning id into created_site;

  if created_site is null then
    select s.id
    into created_site
    from public.sites s
    where s.workspace_id = private.demo_workspace_id() and s.origin = p_origin;
  else
    perform private.seed_demo_site(created_site, p_origin);
  end if;

  return query select created_site;
end;
$$;

create function public.reset_demo()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ws uuid := private.demo_workspace_id();
  site record;
begin
  perform private.ensure_demo_workspace();
  perform set_config('storage.allow_delete_query', 'true', true);

  delete from storage.objects
  where bucket_id = 'screenshots' and name like (ws::text || '/%');

  delete from public.threads where workspace_id = ws;

  delete from public.members
  where workspace_id = ws
    and role = 'guest'
    and created_at < now() - interval '24 hours';

  for site in
    select s.id, s.origin
    from public.sites s
    where s.workspace_id = ws
  loop
    perform private.seed_demo_site(site.id, site.origin);
  end loop;
end;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'sitenote-demo-reset') then
    perform cron.unschedule('sitenote-demo-reset');
  end if;
  perform cron.schedule('sitenote-demo-reset', '17 3 * * *', 'select public.reset_demo()');
end;
$$;

revoke all on all functions in schema private from public;

revoke all on function public.join_demo(text) from public, anon;
grant execute on function public.join_demo(text) to authenticated;

revoke all on function public.demo_site(text) from public, anon;
grant execute on function public.demo_site(text) to authenticated;

revoke all on function public.reset_demo() from public, anon, authenticated;
grant execute on function public.reset_demo() to service_role;
