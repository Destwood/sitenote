create function private.workspace_role(ws uuid)
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.members m
  where m.workspace_id = ws and m.user_id = (select auth.uid())
$$;

create function private.is_workspace_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.members m
    where m.workspace_id = ws and m.user_id = (select auth.uid())
  )
$$;

create function private.shares_workspace(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.members mine
    join public.members theirs on theirs.workspace_id = mine.workspace_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = other
  )
$$;

create function private.is_anonymous()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
$$;

revoke all on all functions in schema private from public;
grant execute on function private.workspace_role(uuid) to authenticated;
grant execute on function private.is_workspace_member(uuid) to authenticated;
grant execute on function private.shares_workspace(uuid) to authenticated;
grant execute on function private.is_anonymous() to authenticated;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.members enable row level security;
alter table public.invites enable row level security;
alter table public.sites enable row level security;
alter table public.threads enable row level security;
alter table public.comments enable row level security;
alter table public.notifications enable row level security;
alter table public.integrations enable row level security;

alter table public.profiles force row level security;
alter table public.workspaces force row level security;
alter table public.members force row level security;
alter table public.invites force row level security;
alter table public.sites force row level security;
alter table public.threads force row level security;
alter table public.comments force row level security;
alter table public.notifications force row level security;
alter table public.integrations force row level security;

revoke all on table
  public.profiles,
  public.workspaces,
  public.members,
  public.invites,
  public.sites,
  public.threads,
  public.comments,
  public.notifications,
  public.integrations
from anon, authenticated;

grant select (user_id, display_name, avatar_url, created_at, updated_at)
  on public.profiles to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

grant select on public.workspaces to authenticated;
grant insert (name, owner_id) on public.workspaces to authenticated;
grant update (name) on public.workspaces to authenticated;
grant delete on public.workspaces to authenticated;

grant select on public.members to authenticated;
grant insert (workspace_id, user_id, role) on public.members to authenticated;
grant update (role) on public.members to authenticated;
grant delete on public.members to authenticated;

grant select on public.invites to authenticated;
grant insert (workspace_id, role, expires_at, created_by) on public.invites to authenticated;
grant update (revoked_at) on public.invites to authenticated;
grant delete on public.invites to authenticated;

grant select on public.sites to authenticated;
grant insert (workspace_id, origin) on public.sites to authenticated;
grant update (origin) on public.sites to authenticated;
grant delete on public.sites to authenticated;

grant select on public.threads to authenticated;
grant insert (
  id, workspace_id, site_id, page_url, anchor, status, context, screenshot_path, created_by
) on public.threads to authenticated;
grant update (status) on public.threads to authenticated;
grant delete on public.threads to authenticated;

grant select on public.comments to authenticated;
grant insert (thread_id, workspace_id, author_id, body, mentions) on public.comments to authenticated;
grant update (body, mentions, deleted_at) on public.comments to authenticated;

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant delete on public.notifications to authenticated;

grant select (id, workspace_id, provider, settings, created_at, updated_at)
  on public.integrations to authenticated;
grant insert (workspace_id, provider, settings) on public.integrations to authenticated;
grant update (settings) on public.integrations to authenticated;
grant delete on public.integrations to authenticated;

create policy profiles_select on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()) or private.shares_workspace(user_id));

create policy profiles_update on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy workspaces_select on public.workspaces
  for select to authenticated
  using (owner_id = (select auth.uid()) or private.is_workspace_member(id));

create policy workspaces_insert on public.workspaces
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and not private.is_anonymous());

create policy workspaces_update on public.workspaces
  for update to authenticated
  using (private.workspace_role(id) = 'owner')
  with check (private.workspace_role(id) = 'owner');

create policy workspaces_delete on public.workspaces
  for delete to authenticated
  using (private.workspace_role(id) = 'owner');

create policy members_select on public.members
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

create policy members_insert on public.members
  for insert to authenticated
  with check (private.workspace_role(workspace_id) = 'owner' and role in ('member', 'guest'));

create policy members_update on public.members
  for update to authenticated
  using (private.workspace_role(workspace_id) = 'owner' and role <> 'owner')
  with check (private.workspace_role(workspace_id) = 'owner' and role in ('member', 'guest'));

create policy members_delete on public.members
  for delete to authenticated
  using (
    role <> 'owner'
    and (user_id = (select auth.uid()) or private.workspace_role(workspace_id) = 'owner')
  );

create policy invites_select on public.invites
  for select to authenticated
  using (private.workspace_role(workspace_id) = 'owner');

create policy invites_insert on public.invites
  for insert to authenticated
  with check (
    private.workspace_role(workspace_id) = 'owner'
    and created_by = (select auth.uid())
    and role in ('member', 'guest')
  );

create policy invites_update on public.invites
  for update to authenticated
  using (private.workspace_role(workspace_id) = 'owner')
  with check (private.workspace_role(workspace_id) = 'owner');

create policy invites_delete on public.invites
  for delete to authenticated
  using (private.workspace_role(workspace_id) = 'owner');

create policy sites_select on public.sites
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

create policy sites_insert on public.sites
  for insert to authenticated
  with check (private.workspace_role(workspace_id) in ('owner', 'member'));

create policy sites_update on public.sites
  for update to authenticated
  using (private.workspace_role(workspace_id) = 'owner')
  with check (private.workspace_role(workspace_id) = 'owner');

create policy sites_delete on public.sites
  for delete to authenticated
  using (private.workspace_role(workspace_id) = 'owner');

create policy threads_select on public.threads
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

create policy threads_insert on public.threads
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and status = 'open'
    and resolved_by is null
    and resolved_at is null
    and private.is_workspace_member(workspace_id)
    and exists (
      select 1 from public.sites s where s.id = site_id and s.workspace_id = threads.workspace_id
    )
  );

create policy threads_update on public.threads
  for update to authenticated
  using (
    private.workspace_role(workspace_id) in ('owner', 'member')
    or (private.workspace_role(workspace_id) = 'guest' and created_by = (select auth.uid()))
  )
  with check (
    private.workspace_role(workspace_id) in ('owner', 'member')
    or (private.workspace_role(workspace_id) = 'guest' and created_by = (select auth.uid()))
  );

create policy threads_delete on public.threads
  for delete to authenticated
  using (private.workspace_role(workspace_id) = 'owner');

create policy comments_select on public.comments
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

create policy comments_insert on public.comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and private.is_workspace_member(workspace_id)
    and exists (
      select 1 from public.threads t where t.id = thread_id and t.workspace_id = comments.workspace_id
    )
  );

create policy comments_update on public.comments
  for update to authenticated
  using (author_id = (select auth.uid()) and private.is_workspace_member(workspace_id))
  with check (author_id = (select auth.uid()) and private.is_workspace_member(workspace_id));

create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()) and private.is_workspace_member(workspace_id));

create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()) and private.is_workspace_member(workspace_id))
  with check (user_id = (select auth.uid()) and private.is_workspace_member(workspace_id));

create policy notifications_delete on public.notifications
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy integrations_select on public.integrations
  for select to authenticated
  using (private.workspace_role(workspace_id) = 'owner');

create policy integrations_insert on public.integrations
  for insert to authenticated
  with check (private.workspace_role(workspace_id) = 'owner');

create policy integrations_update on public.integrations
  for update to authenticated
  using (private.workspace_role(workspace_id) = 'owner')
  with check (private.workspace_role(workspace_id) = 'owner');

create policy integrations_delete on public.integrations
  for delete to authenticated
  using (private.workspace_role(workspace_id) = 'owner');
