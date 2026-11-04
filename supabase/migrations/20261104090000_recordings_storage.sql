insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recordings',
  'recordings',
  false,
  41943040,
  array['video/webm']
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create function private.recording_workspace(object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when object_name ~ (
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
      || '\.webm$'
    )
    then split_part(object_name, '/', 1)::uuid
  end
$$;

revoke all on function private.recording_workspace(text) from public;
grant execute on function private.recording_workspace(text) to authenticated;

create policy recordings_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'recordings'
    and private.is_workspace_member(private.recording_workspace(name))
  );

create policy recordings_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'recordings'
    and private.is_workspace_member(private.recording_workspace(name))
  );

create policy recordings_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'recordings'
    and private.workspace_role(private.recording_workspace(name)) = 'owner'
  )
  with check (
    bucket_id = 'recordings'
    and private.workspace_role(private.recording_workspace(name)) = 'owner'
  );

create policy recordings_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'recordings'
    and private.workspace_role(private.recording_workspace(name)) = 'owner'
  );
