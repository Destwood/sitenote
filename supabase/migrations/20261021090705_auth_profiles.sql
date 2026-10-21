create function private.clean_display_name(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(left(regexp_replace(raw, '^\s+|\s+$', '', 'g'), 80), '')
$$;

create function private.profile_display_name(meta jsonb, email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    private.clean_display_name(meta ->> 'full_name'),
    private.clean_display_name(meta ->> 'name'),
    private.clean_display_name(split_part(coalesce(email, ''), '@', 1)),
    'Guest'
  )
$$;

create function private.profile_avatar_url(meta jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select candidate
  from (
    select coalesce(nullif(meta ->> 'avatar_url', ''), nullif(meta ->> 'picture', '')) as candidate
  ) as avatar
  where candidate ~ '^https://[^\s]+$' and char_length(candidate) <= 2048
$$;

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (user_id, display_name, avatar_url, email)
  values (
    new.id,
    private.profile_display_name(meta, new.email),
    private.profile_avatar_url(meta),
    new.email
  );
  return new;
end;
$$;

create function private.sync_user_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set email = new.email
  where user_id = new.id and email is distinct from new.email;
  return new;
end;
$$;

revoke all on all functions in schema private from public;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.sync_user_email();

insert into public.profiles (user_id, display_name, avatar_url, email)
select
  u.id,
  private.profile_display_name(coalesce(u.raw_user_meta_data, '{}'::jsonb), u.email),
  private.profile_avatar_url(coalesce(u.raw_user_meta_data, '{}'::jsonb)),
  u.email
from auth.users u
on conflict (user_id) do nothing;
