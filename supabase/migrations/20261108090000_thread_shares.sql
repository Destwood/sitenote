create table public.thread_shares (
  thread_id uuid primary key references public.threads (id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(32), 'hex'),
  expires_at timestamptz not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint thread_shares_token_valid check (token ~ '^[0-9a-f]{64}$')
);

alter table public.thread_shares enable row level security;

create policy thread_shares_select on public.thread_shares
  for select to authenticated
  using (
    private.workspace_role((select t.workspace_id from public.threads t where t.id = thread_id))
      in ('owner', 'member')
  );

revoke all on table public.thread_shares from anon, authenticated;
grant select on public.thread_shares to authenticated;

create function public.thread_share_enable(p_thread_id uuid)
returns table (token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  thread_workspace_id uuid;
begin
  select t.workspace_id into thread_workspace_id
  from public.threads t
  where t.id = p_thread_id;
  if thread_workspace_id is null then
    raise exception 'thread not found' using errcode = 'P0002';
  end if;
  if not coalesce(private.workspace_role(thread_workspace_id) in ('owner', 'member'), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  delete from public.thread_shares s
  where s.thread_id = p_thread_id and s.expires_at <= now();

  insert into public.thread_shares as s (thread_id, expires_at)
  values (p_thread_id, now() + interval '30 days')
  on conflict (thread_id) do update set expires_at = excluded.expires_at
  returning s.token, s.expires_at into token, expires_at;
end;
$$;

create function public.thread_share_disable(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  thread_workspace_id uuid;
begin
  select t.workspace_id into thread_workspace_id
  from public.threads t
  where t.id = p_thread_id;
  if thread_workspace_id is null then
    raise exception 'thread not found' using errcode = 'P0002';
  end if;
  if not coalesce(private.workspace_role(thread_workspace_id) in ('owner', 'member'), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  delete from public.thread_shares s
  where s.thread_id = p_thread_id;
end;
$$;

revoke all on function public.thread_share_enable(uuid) from public, anon;
grant execute on function public.thread_share_enable(uuid) to authenticated;

revoke all on function public.thread_share_disable(uuid) from public, anon;
grant execute on function public.thread_share_disable(uuid) to authenticated;
