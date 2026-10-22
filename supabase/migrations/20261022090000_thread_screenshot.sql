drop function public.create_thread(uuid, text, jsonb, jsonb, text, uuid[]);

create function public.create_thread(
  p_site_id uuid,
  p_page_url text,
  p_anchor jsonb,
  p_context jsonb,
  p_body text,
  p_mentions uuid[],
  p_id uuid default null,
  p_screenshot_path text default null
)
returns public.threads
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created public.threads;
  new_thread_id uuid := coalesce(p_id, gen_random_uuid());
  site_workspace uuid;
  stored_path text;
begin
  if p_body is null or p_body !~ '\S' then
    raise exception 'the comment body must not be empty' using errcode = '23514';
  end if;

  select s.workspace_id into site_workspace from public.sites s where s.id = p_site_id;

  if p_screenshot_path is not null
    and site_workspace is not null
    and p_screenshot_path ~ (
      '^' || site_workspace::text || '/' || new_thread_id::text || '\.(webp|png)$'
    )
    and exists (
      select 1
      from storage.objects o
      where o.bucket_id = 'screenshots' and o.name = p_screenshot_path
    )
  then
    stored_path := p_screenshot_path;
  end if;

  insert into public.threads (id, site_id, page_url, anchor, context, screenshot_path, created_by)
  values (
    new_thread_id,
    p_site_id,
    p_page_url,
    p_anchor,
    coalesce(p_context, '{}'::jsonb),
    stored_path,
    (select auth.uid())
  )
  returning * into created;

  insert into public.comments (thread_id, author_id, body, mentions)
  values (created.id, (select auth.uid()), p_body, coalesce(p_mentions, '{}'::uuid[]));

  return created;
end;
$$;

revoke all on function public.create_thread(uuid, text, jsonb, jsonb, text, uuid[], uuid, text)
  from public, anon;
grant execute on function public.create_thread(uuid, text, jsonb, jsonb, text, uuid[], uuid, text)
  to authenticated;
