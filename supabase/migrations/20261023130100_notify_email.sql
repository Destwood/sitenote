create extension if not exists pg_net with schema extensions;

create function private.notifications_send_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  endpoint text;
  webhook_secret text;
begin
  select ds.decrypted_secret into endpoint
  from vault.decrypted_secrets ds
  where ds.name = 'notify_email_url';

  select ds.decrypted_secret into webhook_secret
  from vault.decrypted_secrets ds
  where ds.name = 'notify_email_webhook_secret';

  if endpoint is null or webhook_secret is null then
    return new;
  end if;

  perform net.http_post(
    url := endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Webhook-Secret', webhook_secret
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'notifications',
      'schema', 'public',
      'record', to_jsonb(new),
      'old_record', null
    )
  );

  return new;
end;
$$;

revoke all on function private.notifications_send_email() from public, anon, authenticated;

create trigger notifications_send_email
  after insert on public.notifications
  for each row execute function private.notifications_send_email();
