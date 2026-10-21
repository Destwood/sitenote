create function public.create_thread(
  p_site_id uuid,
  p_page_url text,
  p_anchor jsonb,
  p_context jsonb,
  p_body text,
  p_mentions uuid[]
)
returns public.threads
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created public.threads;
begin
  if p_body is null or p_body !~ '\S' then
    raise exception 'the comment body must not be empty' using errcode = '23514';
  end if;

  insert into public.threads (site_id, page_url, anchor, context, created_by)
  values (
    p_site_id,
    p_page_url,
    p_anchor,
    coalesce(p_context, '{}'::jsonb),
    (select auth.uid())
  )
  returning * into created;

  insert into public.comments (thread_id, author_id, body, mentions)
  values (created.id, (select auth.uid()), p_body, coalesce(p_mentions, '{}'::uuid[]));

  return created;
end;
$$;

revoke all on function public.create_thread(uuid, text, jsonb, jsonb, text, uuid[])
  from public, anon;
grant execute on function public.create_thread(uuid, text, jsonb, jsonb, text, uuid[])
  to authenticated;
