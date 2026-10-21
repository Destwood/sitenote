insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'screenshots',
  'screenshots',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create function private.screenshot_workspace(object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when object_name ~ (
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
      || '\.(png|jpg|jpeg|webp)$'
    )
    then split_part(object_name, '/', 1)::uuid
  end
$$;

revoke all on function private.screenshot_workspace(text) from public;
grant execute on function private.screenshot_workspace(text) to authenticated;

create policy screenshots_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'screenshots'
    and private.is_workspace_member(private.screenshot_workspace(name))
  );

create policy screenshots_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'screenshots'
    and private.is_workspace_member(private.screenshot_workspace(name))
  );

create policy screenshots_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'screenshots'
    and private.workspace_role(private.screenshot_workspace(name)) = 'owner'
  )
  with check (
    bucket_id = 'screenshots'
    and private.workspace_role(private.screenshot_workspace(name)) = 'owner'
  );

create policy screenshots_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'screenshots'
    and private.workspace_role(private.screenshot_workspace(name)) = 'owner'
  );
