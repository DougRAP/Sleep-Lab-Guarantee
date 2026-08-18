-- B-13: tunable limits + rate-limit counters. Server-only, service_role bypasses
-- RLS; browser roles get nothing. gen_random_uuid used per the CLI-runner note.

-- Pieza 5: the tunable knobs. One row per limit; changing "300" is an UPDATE,
-- not a deploy. Code holds safe defaults (lib/app-settings.ts) so a missing or
-- empty table never breaks a caller. Seeded with the agreed values.
create table if not exists public.app_settings (
  key text primary key,
  value numeric not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value) values
  ('chat_messages_per_day', 300),
  ('chat_global_messages_per_day', 20000),
  ('chat_max_input_chars', 1500),
  ('chat_history_turns', 20),
  ('lookup_max_per_order_hour', 5),
  ('lookup_max_per_ip_15min', 30)
on conflict (key) do nothing;

-- Pieza 1: fixed-window counters. PK is (bucket, key, window_start); the count
-- is bumped atomically so concurrent serverless instances can't undercount.
create table if not exists public.rate_counters (
  bucket text not null,
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (bucket, key, window_start)
);
create index if not exists rate_counters_window_idx
  on public.rate_counters (window_start);

-- Atomic insert-or-increment, returning the new count. SECURITY DEFINER so it
-- runs with the table owner's rights; called only from the service-role client.
create or replace function public.bump_rate_counter(
  p_bucket text, p_key text, p_window_start timestamptz
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  insert into public.rate_counters (bucket, key, window_start, count)
  values (p_bucket, p_key, p_window_start, 1)
  on conflict (bucket, key, window_start)
  do update set count = public.rate_counters.count + 1
  returning count into v_count;

  -- Opportunistic cleanup: drop windows older than a day. Cheap, no cron.
  delete from public.rate_counters where window_start < now() - interval '1 day';

  return v_count;
end;
$$;

alter table public.app_settings enable row level security;
alter table public.rate_counters enable row level security;

revoke all on public.app_settings from anon, authenticated;
revoke all on public.rate_counters from anon, authenticated;
grant select on public.app_settings to service_role;
grant select, insert, update, delete on public.rate_counters to service_role;
revoke all on function public.bump_rate_counter(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.bump_rate_counter(text, text, timestamptz) to service_role;
