alter table public.comments drop constraint comments_mentions_limit;
alter table public.comments
  add constraint comments_mentions_limit check (cardinality(mentions) <= 20);

create function private.normalize_mentions(ws uuid, author uuid, mentioned uuid[])
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned uuid[];
begin
  if mentioned is null then
    return null;
  end if;

  if cardinality(mentioned) > 20 then
    raise exception 'a comment can mention at most 20 people' using errcode = '23514';
  end if;

  select coalesce(array_agg(first_mention.user_id order by first_mention.position), '{}')
  into cleaned
  from (
    select mention.user_id, min(mention.position) as position
    from unnest(mentioned) with ordinality as mention(user_id, position)
    where mention.user_id is distinct from author
    group by mention.user_id
  ) as first_mention;

  perform private.assert_mentions_are_members(ws, cleaned);
  return cleaned;
end;
$$;

create or replace function private.comments_prepare_insert()
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
  new.mentions := private.normalize_mentions(new.workspace_id, new.author_id, new.mentions);
  return new;
end;
$$;

create or replace function private.comments_prepare_update()
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
    new.mentions := private.normalize_mentions(new.workspace_id, new.author_id, new.mentions);
  end if;

  return new;
end;
$$;

create function private.comments_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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

create trigger notify after insert on public.comments
  for each row execute function private.comments_notify();

revoke all on all functions in schema private from public;

alter publication supabase_realtime add table public.notifications;
