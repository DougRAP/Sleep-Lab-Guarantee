-- B-11: coach usage telemetry (privacy-adjusted design, 2026-07-24).
-- One raw row per assistant reply: thread_id + numbers ONLY. No guarantee_id
-- and no text, on purpose — the privacy panel's ruling: the join to a person,
-- if ever needed to explain a cost spike, is a deliberate staff-side query via
-- concierge_messages, not a stored column. The admin report reads the
-- identifier-free daily view. Retention (raw rows collapse to daily aggregates
-- after 90 days) lands with the B-27 pg_cron purge alongside the chat purge.

create table if not exists public.concierge_usage (
  -- gen_random_uuid(): built-in (PG13+); uuid_generate_v4 lives in the
  -- `extensions` schema, outside the CLI migration runner's search_path.
  id uuid primary key default gen_random_uuid(),
  -- Nullable + set null: a billed row must survive a thread/customer deletion.
  thread_id uuid references public.concierge_threads(id) on delete set null,
  model text not null,
  -- API round-trips summed into this reply (tool-use makes several).
  api_calls integer not null default 1,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_creation_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists concierge_usage_created_idx
  on public.concierge_usage (created_at);

-- RLS on, and NO policies on purpose: only the server writes and reads this,
-- through the service_role client (which bypasses RLS). Browsers never touch it.
alter table public.concierge_usage enable row level security;

-- The identifier-free report the admin page reads: one line per UTC day.
create or replace view public.concierge_usage_daily
with (security_invoker = true) as
select
  (created_at at time zone 'utc')::date as day,
  count(*)::int as replies,
  sum(api_calls)::int as api_calls,
  sum(input_tokens)::bigint as input_tokens,
  sum(output_tokens)::bigint as output_tokens,
  sum(cache_creation_tokens)::bigint as cache_creation_tokens,
  sum(cache_read_tokens)::bigint as cache_read_tokens
from public.concierge_usage
group by 1;

-- Explicit Data API grants (mandatory for new tables): service_role only.
revoke all on public.concierge_usage from anon, authenticated;
revoke all on public.concierge_usage_daily from anon, authenticated;
grant select, insert on public.concierge_usage to service_role;
grant select on public.concierge_usage_daily to service_role;
