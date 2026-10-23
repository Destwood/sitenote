create function private.contains_pattern(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select '%' || replace(replace(replace(p_text, '\', '\\'), '%', '\%'), '_', '\_') || '%'
$$;

revoke all on function private.contains_pattern(text) from public;
grant execute on function private.contains_pattern(text) to authenticated;

create function public.search_threads(
  p_workspace_id uuid,
  p_q text default null,
  p_site_id uuid default null,
  p_status public.thread_status default null,
  p_author_id uuid default null,
  p_page text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  thread_id uuid,
  site_id uuid,
  page_url text,
  status public.thread_status,
  created_by uuid,
  created_at timestamptz,
  comment_count bigint,
  last_activity timestamptz,
  first_body text,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset < 0 then
    raise exception 'the page size must be 1 to 100 and the offset must not be negative'
      using errcode = '22023';
  end if;

  return query
  with matched as (
    select t.id, t.site_id, t.page_url, t.status, t.created_by, t.created_at
    from public.threads t
    where t.workspace_id = p_workspace_id
      and (p_site_id is null or t.site_id = p_site_id)
      and (p_status is null or t.status = p_status)
      and (p_author_id is null or t.created_by = p_author_id)
      and (p_page is null or t.page_url ilike private.contains_pattern(p_page))
      and (
        p_q is null
        or exists (
          select 1
          from public.comments c
          where c.thread_id = t.id
            and c.deleted_at is null
            and c.body ilike private.contains_pattern(p_q)
        )
      )
  )
  select
    m.id,
    m.site_id,
    m.page_url,
    m.status,
    m.created_by,
    m.created_at,
    stats.comment_count,
    coalesce(stats.last_comment_at, m.created_at),
    left(first_comment.body, 120),
    count(*) over ()
  from matched m
  cross join lateral (
    select count(*) as comment_count, max(c.created_at) as last_comment_at
    from public.comments c
    where c.thread_id = m.id and c.deleted_at is null
  ) as stats
  left join lateral (
    select c.body
    from public.comments c
    where c.thread_id = m.id and c.deleted_at is null
    order by c.created_at, c.id
    limit 1
  ) as first_comment on true
  order by coalesce(stats.last_comment_at, m.created_at) desc, m.id desc
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.search_threads(
  uuid, text, uuid, public.thread_status, uuid, text, integer, integer
) from public, anon;
grant execute on function public.search_threads(
  uuid, text, uuid, public.thread_status, uuid, text, integer, integer
) to authenticated;
