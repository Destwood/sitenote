create schema if not exists private;

create type public.member_role as enum ('owner', 'member', 'guest');
create type public.thread_status as enum ('open', 'resolved');
create type public.notification_kind as enum ('reply', 'mention');
create type public.integration_provider as enum ('clickup');

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_url text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_valid check (
    char_length(display_name) between 1 and 80 and display_name ~ '\S'
  ),
  constraint profiles_avatar_url_valid check (
    avatar_url is null or (avatar_url ~ '^https://' and char_length(avatar_url) <= 2048)
  )
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references public.profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspaces_name_valid check (char_length(name) between 1 and 80 and name ~ '\S')
);

create index workspaces_owner_id_idx on public.workspaces (owner_id);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint members_workspace_user_key unique (workspace_id, user_id)
);

create index members_user_id_idx on public.members (user_id);
create unique index members_one_owner_per_workspace_idx on public.members (workspace_id)
  where role = 'owner';

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  token text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  role public.member_role not null,
  expires_at timestamptz not null,
  created_by uuid references public.profiles (user_id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invites_token_key unique (token),
  constraint invites_role_valid check (role in ('member', 'guest')),
  constraint invites_expiry_valid check (expires_at > created_at)
);

create index invites_workspace_id_idx on public.invites (workspace_id);
create index invites_created_by_idx on public.invites (created_by);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  origin text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sites_workspace_origin_key unique (workspace_id, origin),
  constraint sites_origin_valid check (
    origin ~ '^https?://[^/?#@\s]+$' and origin = lower(origin) and char_length(origin) <= 300
  )
);

create table public.threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  site_id uuid not null references public.sites (id) on delete cascade,
  page_url text not null,
  anchor jsonb not null,
  status public.thread_status not null default 'open',
  context jsonb not null default '{}',
  screenshot_path text,
  created_by uuid references public.profiles (user_id) on delete set null,
  resolved_by uuid references public.profiles (user_id) on delete set null,
  resolved_at timestamptz,
  clickup_task_id text,
  clickup_task_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint threads_page_url_valid check (
    page_url ~ '^https?://[^\s]+$' and char_length(page_url) <= 2048
  ),
  constraint threads_anchor_valid check (
    jsonb_typeof(anchor) = 'object'
    and coalesce(anchor ->> 'kind' in ('element', 'text'), false)
    and octet_length(anchor::text) <= 32768
  ),
  constraint threads_context_valid check (
    jsonb_typeof(context) = 'object' and octet_length(context::text) <= 65536
  ),
  constraint threads_screenshot_path_valid check (
    screenshot_path is null
    or screenshot_path ~ ('^' || workspace_id::text || '/' || id::text || '\.(png|jpg|jpeg|webp)$')
  ),
  constraint threads_resolution_valid check ((status = 'resolved') = (resolved_at is not null)),
  constraint threads_clickup_valid check (
    (clickup_task_id is null or char_length(clickup_task_id) <= 64)
    and (
      clickup_task_url is null
      or (clickup_task_url ~ '^https://' and char_length(clickup_task_url) <= 2048)
    )
  )
);

create index threads_site_page_idx on public.threads (site_id, page_url);
create index threads_workspace_status_idx on public.threads (workspace_id, status);
create index threads_created_by_idx on public.threads (created_by);
create index threads_resolved_by_idx on public.threads (resolved_by);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  author_id uuid references public.profiles (user_id) on delete set null,
  body text not null,
  mentions uuid[] not null default '{}',
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comments_body_length check (char_length(body) <= 10000),
  constraint comments_body_present check (deleted_at is not null or body ~ '\S'),
  constraint comments_deleted_blank check (
    deleted_at is null or (body = '' and cardinality(mentions) = 0)
  ),
  constraint comments_mentions_limit check (cardinality(mentions) <= 50)
);

create index comments_thread_created_idx on public.comments (thread_id, created_at);
create index comments_workspace_id_idx on public.comments (workspace_id);
create index comments_author_id_idx on public.comments (author_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  thread_id uuid not null references public.threads (id) on delete cascade,
  comment_id uuid not null references public.comments (id) on delete cascade,
  kind public.notification_kind not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notifications_user_read_idx on public.notifications (user_id, read_at);
create index notifications_workspace_id_idx on public.notifications (workspace_id);
create index notifications_thread_id_idx on public.notifications (thread_id);
create index notifications_comment_id_idx on public.notifications (comment_id);

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  provider public.integration_provider not null,
  settings jsonb not null default '{}',
  secret_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integrations_workspace_provider_key unique (workspace_id, provider),
  constraint integrations_settings_valid check (
    jsonb_typeof(settings) = 'object' and octet_length(settings::text) <= 8192
  )
);

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function private.forbid_column_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  column_name text;
  old_value jsonb;
  new_value jsonb;
begin
  foreach column_name in array tg_argv loop
    old_value := to_jsonb(old) -> column_name;
    new_value := to_jsonb(new) -> column_name;
    if new_value is distinct from old_value and new_value <> 'null'::jsonb then
      raise exception 'column % of % is immutable', column_name, tg_table_name
        using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

create function private.assert_mentions_are_members(ws uuid, mentioned uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from unnest(mentioned) as mention(user_id)
    where not exists (
      select 1
      from public.members m
      where m.workspace_id = ws and m.user_id = mention.user_id
    )
  ) then
    raise exception 'mentions must be members of the workspace' using errcode = '23514';
  end if;
end;
$$;

create function private.workspaces_add_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

create function private.members_guard_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'owner'
    and new.user_id is distinct from (
      select w.owner_id from public.workspaces w where w.id = new.workspace_id
    ) then
    raise exception 'only the workspace owner can hold the owner role' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE'
    and new.role is distinct from old.role
    and (old.role = 'owner' or new.role = 'owner') then
    raise exception 'the owner role cannot be granted or removed' using errcode = '23514';
  end if;
  return new;
end;
$$;

create function private.sites_guard_origin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.origin is distinct from old.origin
    and exists (select 1 from public.threads t where t.site_id = old.id) then
    raise exception 'origin cannot change while the site has threads' using errcode = '23514';
  end if;
  return new;
end;
$$;

create function private.threads_prepare_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  site_workspace uuid;
  site_origin text;
begin
  select s.workspace_id, s.origin
  into site_workspace, site_origin
  from public.sites s
  where s.id = new.site_id;

  if site_workspace is null
    or (new.workspace_id is not null and new.workspace_id <> site_workspace) then
    raise exception 'site does not belong to the workspace' using errcode = '23514';
  end if;

  if new.page_url <> site_origin and left(new.page_url, char_length(site_origin) + 1) <> site_origin || '/' then
    raise exception 'page_url must belong to the site origin' using errcode = '23514';
  end if;

  new.workspace_id := site_workspace;
  return new;
end;
$$;

create function private.threads_apply_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'resolved' then
      new.resolved_by := (select auth.uid());
      new.resolved_at := now();
    else
      new.resolved_by := null;
      new.resolved_at := null;
    end if;
  end if;
  return new;
end;
$$;

create function private.comments_prepare_insert()
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

  if thread_workspace is null
    or (new.workspace_id is not null and new.workspace_id <> thread_workspace) then
    raise exception 'thread does not belong to the workspace' using errcode = '23514';
  end if;

  new.workspace_id := thread_workspace;
  perform private.assert_mentions_are_members(new.workspace_id, new.mentions);
  return new;
end;
$$;

create function private.comments_prepare_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.deleted_at is not null then
    if (new.body, new.mentions, new.deleted_at, new.edited_at)
      is distinct from (old.body, old.mentions, old.deleted_at, old.edited_at) then
      raise exception 'deleted comments are read-only' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.deleted_at is not null then
    new.deleted_at := now();
    new.body := '';
    new.mentions := '{}';
    return new;
  end if;

  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;

  if new.mentions is distinct from old.mentions then
    perform private.assert_mentions_are_members(new.workspace_id, new.mentions);
  end if;

  return new;
end;
$$;

create trigger set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.workspaces
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.members
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.invites
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.sites
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.threads
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.comments
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.notifications
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.integrations
  for each row execute function private.set_updated_at();

create trigger forbid_column_change before update on public.profiles
  for each row execute function private.forbid_column_change('user_id');
create trigger forbid_column_change before update on public.workspaces
  for each row execute function private.forbid_column_change('owner_id');
create trigger forbid_column_change before update on public.members
  for each row execute function private.forbid_column_change('workspace_id', 'user_id');
create trigger forbid_column_change before update on public.invites
  for each row execute function private.forbid_column_change('workspace_id', 'token', 'created_by');
create trigger forbid_column_change before update on public.sites
  for each row execute function private.forbid_column_change('workspace_id');
create trigger forbid_column_change before update on public.threads
  for each row execute function private.forbid_column_change('workspace_id', 'site_id', 'created_by');
create trigger forbid_column_change before update on public.comments
  for each row execute function private.forbid_column_change('thread_id', 'workspace_id', 'author_id');
create trigger forbid_column_change before update on public.notifications
  for each row execute function private.forbid_column_change(
    'user_id', 'workspace_id', 'thread_id', 'comment_id', 'kind'
  );
create trigger forbid_column_change before update on public.integrations
  for each row execute function private.forbid_column_change('workspace_id', 'provider');

create trigger add_owner_membership after insert on public.workspaces
  for each row execute function private.workspaces_add_owner();
create trigger guard_owner before insert or update on public.members
  for each row execute function private.members_guard_owner();
create trigger guard_origin before update on public.sites
  for each row execute function private.sites_guard_origin();
create trigger prepare_insert before insert on public.threads
  for each row execute function private.threads_prepare_insert();
create trigger apply_status before update on public.threads
  for each row execute function private.threads_apply_status();
create trigger prepare_insert before insert on public.comments
  for each row execute function private.comments_prepare_insert();
create trigger prepare_update before update on public.comments
  for each row execute function private.comments_prepare_update();

revoke all on all functions in schema private from public;
