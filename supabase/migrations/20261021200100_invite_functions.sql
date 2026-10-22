create function private.role_rank(role public.member_role)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case role when 'owner' then 3 when 'member' then 2 else 1 end
$$;

create function public.create_invite(
  p_workspace_id uuid,
  p_role public.member_role,
  p_expires_in interval default interval '7 days'
)
returns public.invites
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created public.invites;
begin
  if p_role not in ('member', 'guest') then
    raise exception 'an invite can only grant the member or guest role' using errcode = '23514';
  end if;

  if p_expires_in is null
    or p_expires_in < interval '1 hour'
    or p_expires_in > interval '30 days' then
    raise exception 'an invite must expire between 1 hour and 30 days from now'
      using errcode = '23514';
  end if;

  insert into public.invites (workspace_id, role, expires_at, created_by)
  values (p_workspace_id, p_role, now() + p_expires_in, (select auth.uid()))
  returning * into created;

  return created;
end;
$$;

create function public.invite_preview(p_token text)
returns table (
  workspace_name text,
  role public.member_role,
  expires_at timestamptz,
  valid boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select found.name, found.role, found.expires_at, found.name is not null
  from (values (1)) as one(x)
  left join lateral (
    select w.name, i.role, i.expires_at
    from public.invites i
    join public.workspaces w on w.id = i.workspace_id
    where i.token = p_token and i.revoked_at is null and i.expires_at > now()
  ) as found on true
$$;

create function public.accept_invite(p_token text, p_display_name text default null)
returns table (workspace_id uuid, role public.member_role)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := (select auth.uid());
  invite public.invites;
  anonymous boolean := private.is_anonymous();
  clean_name text;
  resulting_role public.member_role;
begin
  if uid is null then
    raise exception 'sign in to accept an invite' using errcode = '28000';
  end if;

  select i.*
  into invite
  from public.invites i
  where i.token = p_token and i.revoked_at is null and i.expires_at > now();

  if not found then
    raise exception 'the invite is not valid' using errcode = '22023';
  end if;

  if anonymous then
    if invite.role <> 'guest' then
      raise exception 'anonymous users can only accept guest invites' using errcode = '42501';
    end if;

    clean_name := regexp_replace(coalesce(p_display_name, ''), '^\s+|\s+$', '', 'g');
    if char_length(clean_name) not between 1 and 80 then
      raise exception 'a display name of 1 to 80 characters is required' using errcode = '22023';
    end if;

    update public.profiles set display_name = clean_name where user_id = uid;
  end if;

  insert into public.members as m (workspace_id, user_id, role)
  values (invite.workspace_id, uid, invite.role)
  on conflict (workspace_id, user_id) do update
    set role = case
      when private.role_rank(excluded.role) > private.role_rank(m.role) then excluded.role
      else m.role
    end
  returning m.role into resulting_role;

  return query select invite.workspace_id, resulting_role;
end;
$$;

revoke all on all functions in schema private from public;

revoke all on function public.create_invite(uuid, public.member_role, interval)
  from public, anon;
grant execute on function public.create_invite(uuid, public.member_role, interval)
  to authenticated;

revoke all on function public.invite_preview(text) from public;
grant execute on function public.invite_preview(text) to anon, authenticated;

revoke all on function public.accept_invite(text, text) from public, anon;
grant execute on function public.accept_invite(text, text) to authenticated;
