alter table public.threads
  add column jira_issue_key text,
  add column jira_issue_url text,
  add constraint threads_jira_valid check (
    (
      jira_issue_key is null
      or (jira_issue_key ~ '^[A-Z][A-Z0-9_]+-[0-9]+$' and char_length(jira_issue_key) <= 64)
    )
    and (
      jira_issue_url is null
      or (jira_issue_url ~ '^https://' and char_length(jira_issue_url) <= 2048)
    )
    and ((jira_issue_key is null) = (jira_issue_url is null))
  );

create function public.jira_configured(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.workspace_role(p_workspace_id) in ('owner', 'member'), false)
    and exists (
      select 1
      from public.integrations i
      where i.workspace_id = p_workspace_id
        and i.provider = 'jira'
        and i.secret_id is not null
    )
$$;

create function public.jira_disconnect(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed_secret uuid;
begin
  if private.workspace_role(p_workspace_id) is distinct from 'owner' then
    raise exception 'only the owner can disconnect an integration' using errcode = '42501';
  end if;

  delete from public.integrations
  where workspace_id = p_workspace_id and provider = 'jira'
  returning secret_id into removed_secret;

  if removed_secret is not null then
    delete from vault.secrets where id = removed_secret;
  end if;
end;
$$;

revoke all on function public.jira_configured(uuid) from public, anon;
grant execute on function public.jira_configured(uuid) to authenticated;

revoke all on function public.jira_disconnect(uuid) from public, anon;
grant execute on function public.jira_disconnect(uuid) to authenticated;
