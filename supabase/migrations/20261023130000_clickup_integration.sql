create function public.clickup_configured(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.workspace_role(p_workspace_id) in ('owner', 'member')
    and exists (
      select 1
      from public.integrations i
      where i.workspace_id = p_workspace_id
        and i.provider = 'clickup'
        and i.secret_id is not null
    )
$$;

create function public.clickup_disconnect(p_workspace_id uuid)
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
  where workspace_id = p_workspace_id and provider = 'clickup'
  returning secret_id into removed_secret;

  if removed_secret is not null then
    delete from vault.secrets where id = removed_secret;
  end if;
end;
$$;

create function public.integration_secret_upsert(
  p_value text,
  p_workspace_id uuid,
  p_provider public.integration_provider,
  p_secret_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_secret_id is null then
    return vault.create_secret(
      p_value,
      p_provider::text || ':' || p_workspace_id::text || ':' || gen_random_uuid()::text
    );
  end if;

  if not exists (select 1 from vault.secrets where id = p_secret_id) then
    raise exception 'the integration secret does not exist' using errcode = 'P0002';
  end if;

  perform vault.update_secret(p_secret_id, p_value);
  return p_secret_id;
end;
$$;

create function public.integration_secret_read(p_secret_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select ds.decrypted_secret
  from vault.decrypted_secrets ds
  where ds.id = p_secret_id
$$;

revoke all on function public.clickup_configured(uuid) from public, anon;
grant execute on function public.clickup_configured(uuid) to authenticated;

revoke all on function public.clickup_disconnect(uuid) from public, anon;
grant execute on function public.clickup_disconnect(uuid) to authenticated;

revoke all on function public.integration_secret_upsert(text, uuid, public.integration_provider, uuid)
  from public, anon, authenticated;
grant execute on function public.integration_secret_upsert(text, uuid, public.integration_provider, uuid)
  to service_role;

revoke all on function public.integration_secret_read(uuid) from public, anon, authenticated;
grant execute on function public.integration_secret_read(uuid) to service_role;
