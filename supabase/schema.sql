-- RAP Sleep Lab — Supabase schema (M2, extended for real auth in M6)
-- Matches PRD §6 (data model) with RLS by role (§4, §7).
-- Run in the Supabase SQL editor, then run seed.sql. Re-runnable: every table,
-- column, constraint, trigger and policy below is guarded.
--
-- Roles: consumer | rap_admin | dealer  (dealer scoped to a location).
--
-- AUTH: customers sign in with Supabase Auth (email + password) and link their
-- purchase, which sets guarantees.consumer_id. Every consumer policy below
-- resolves through that column via auth.uid(), so a signed-in customer can only
-- reach their own rows. Writes still go through the repository's service-role
-- client (server-authoritative — the client never names a row id), so RLS is the
-- backstop rather than the only guard.
--
-- When Supabase is absent entirely, the app falls back to the older light-verify
-- signed cookie so nothing dead-ends; none of this schema is involved then.

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Profiles + role helpers
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  role text not null default 'consumer' check (role in ('consumer', 'rap_admin', 'dealer')),
  dealer_location_id text,                 -- set for dealer role; scopes RLS
  phone text,
  created_at timestamptz default now()
);

-- Every Supabase auth user gets a profile row (role 'consumer' by default).
-- Promote an account to staff by hand:
--   update public.profiles set role = 'rap_admin' where email = 'you@raptns.com';
--   update public.profiles set role = 'dealer', dealer_location_id = '101'
--     where email = 'store@dealer.example';
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'consumer')
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- SECURITY DEFINER helpers avoid recursive RLS when policies read profiles.
create or replace function public.is_rap_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'rap_admin'
  );
$$;

create or replace function public.current_dealer_location()
returns text language sql stable security definer set search_path = public as $$
  select dealer_location_id from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Dealer locations (dealer triage #4 + shop coupon #6)
-- Keyed by the same text id that guarantees.dealer_location_id and
-- profiles.dealer_location_id reference (a loose text scope, like the columns
-- above — no FK, consistent with the existing convention).
-- ---------------------------------------------------------------------------
create table if not exists public.dealer_locations (
  id text primary key,                     -- matches guarantees.dealer_location_id
  name text not null,
  phone text,
  email text,
  site_url text,
  coupon_code text,
  coupon_pct numeric,                       -- whole-percent discount (e.g. 20)
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Guarantees (seeded from CRM export)
-- ---------------------------------------------------------------------------
create table if not exists public.guarantees (
  id uuid primary key default uuid_generate_v4(),
  sales_order_number text unique not null,
  guarantee_number text,
  customer_first_name text,
  customer_last_name text not null,
  customer_email text,
  customer_phone text,
  dealer_name text,
  dealer_location_id text,                 -- scopes dealer-role access
  manufacturer text,
  oem_model text,
  product_description text,
  purchase_price numeric,
  delivery_date date not null,             -- start date for 90-night window
  access_token text,                       -- Path A pre-filled-link token
  consumer_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);
create index if not exists guarantees_sales_order_idx on public.guarantees (sales_order_number);
create index if not exists guarantees_dealer_location_idx on public.guarantees (dealer_location_id);

-- Idempotent migration (M6 — real auth). consumer_id is THE link between a
-- Supabase auth user and their purchase: it is set when an authenticated
-- customer links their sales order, and every consumer RLS policy below keys
-- off it via auth.uid(). linked_via records how ('token' = arrived on the RAP
-- dashboard link, so the fitting can skip the receipt photo).
alter table public.guarantees
  add column if not exists consumer_id uuid references public.profiles(id) on delete set null;
alter table public.guarantees add column if not exists linked_via text;
do $$ begin
  alter table public.guarantees drop constraint if exists guarantees_linked_via_check;
  alter table public.guarantees add constraint guarantees_linked_via_check
    check (linked_via is null or linked_via in ('token','lookup'));
end $$;
create index if not exists guarantees_consumer_idx on public.guarantees (consumer_id);

-- ---------------------------------------------------------------------------
-- Claims (one comfort-exchange request per guarantee)
-- ---------------------------------------------------------------------------
create table if not exists public.claims (
  id uuid primary key default uuid_generate_v4(),
  -- v3: NULLABLE — an anonymous claim exists before (unless) it is matched to
  -- a registered guarantee. FK + cascade kept for linked claims.
  guarantee_id uuid references public.guarantees(id) on delete cascade,
  consumer_id uuid references public.profiles(id) on delete set null,
  -- 'draft' (M5) precedes 'submitted': an in-progress fitting is persisted so
  -- the customer can leave and resume rather than being held in a linear script.
  -- v3 adds 'inspection_scheduled' (a tech visit is on the calendar).
  status text not null default 'submitted' check (status in (
    'draft','submitted','in_review','inspection_scheduled','approved',
    'dealer_scheduled','completed','denied','expired','withdrawn'
  )),
  -- v3: neither RA nor tracking number is minted at submit any more (kept for
  -- rows that have them; RA issuance became a manual admin action). The claim
  -- number CG###### below is the single customer reference.
  ra_number text,
  tracking_number text,
  claim_number text unique,
  -- v3 anonymous intake: self-reported identity + purchase details.
  first_name text,
  last_name text,
  delivery_zip text,
  sales_order_number text,
  model_number text,
  purchase_date date,
  delivery_date date,
  protector_used boolean,
  days_in_service_at_submit int,
  -- Set only when submitted before day 31 (the customer's choice).
  early_preference text check (early_preference in ('auto_submit_day_31','agent_call')),
  -- Scopes an UNLINKED claim to a dealer (default City Mattress); linked
  -- claims keep scoping through their guarantee. Loose text id, like
  -- guarantees.dealer_location_id.
  dealer_location_id text,
  -- Structured intake (agent or guided form) — both land on the RA.
  reason_experience text,
  preferred_replacement text,
  -- Resume point + the tap-to-confirm set from the 90-Night terms.
  step text not null default 'intake'
    check (step in ('intake','items','confirmations','photos','verify','submitted')),
  confirmations jsonb not null default '[]'::jsonb,
  -- True when the sales order arrived pre-verified (dashboard/CRM token link).
  -- Drives the receipt-photo rule: a receipt is only asked for when false.
  pre_verified boolean not null default false,
  contact_phone text,
  contact_phone_kind text check (contact_phone_kind in ('mobile','home','work')),
  contact_email text,
  at_delivery_address boolean,
  new_address text,
  still_owns boolean,
  denial_reason text,
  restocking_fee numeric,
  price_difference numeric,
  submitted_at timestamptz default now(),
  reviewed_at timestamptz,
  approved_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists claims_guarantee_idx on public.claims (guarantee_id);
create index if not exists claims_draft_idx on public.claims (guarantee_id, status);
-- B-18 architecture audit: the staff desk lists non-draft claims newest-first
-- (listClaimRecords orders by updated_at desc, neq draft). Trivial today,
-- necessary at City Mattress scale (~50k units/yr).
create index if not exists claims_updated_at_idx
  on public.claims (updated_at desc) where status <> 'draft';

-- Idempotent migration for existing deployments (columns added in M5).
alter table public.claims add column if not exists tracking_number text;
alter table public.claims add column if not exists reason_experience text;
alter table public.claims add column if not exists preferred_replacement text;
alter table public.claims add column if not exists step text not null default 'intake';
alter table public.claims add column if not exists confirmations jsonb not null default '[]'::jsonb;
alter table public.claims add column if not exists pre_verified boolean not null default false;
alter table public.claims add column if not exists contact_phone text;
alter table public.claims add column if not exists contact_phone_kind text;
alter table public.claims add column if not exists contact_email text;
alter table public.claims add column if not exists at_delivery_address boolean;
alter table public.claims add column if not exists new_address text;
alter table public.claims add column if not exists still_owns boolean;
-- Review 2026-07-22: the dealer records the in-store exchange's sales order.
alter table public.claims add column if not exists exchange_sales_order_number text;

-- Idempotent migration for existing deployments (v3, M-S1 — simplified claims
-- intake). These ALTERs are the migration: run this file against an existing
-- database and the claims table gains the anonymous-intake shape.
alter table public.claims alter column guarantee_id drop not null;
alter table public.claims add column if not exists claim_number text;
alter table public.claims add column if not exists first_name text;
alter table public.claims add column if not exists last_name text;
alter table public.claims add column if not exists delivery_zip text;
alter table public.claims add column if not exists sales_order_number text;
alter table public.claims add column if not exists model_number text;
alter table public.claims add column if not exists purchase_date date;
alter table public.claims add column if not exists delivery_date date;
alter table public.claims add column if not exists protector_used boolean;
alter table public.claims add column if not exists days_in_service_at_submit int;
alter table public.claims add column if not exists early_preference text;
alter table public.claims add column if not exists dealer_location_id text;
-- Unique + fast lookup for the customer reference (also enforces the
-- mint-with-retry rule in the repository).
create unique index if not exists claims_claim_number_key
  on public.claims (claim_number);
do $$ begin
  alter table public.claims drop constraint if exists claims_early_preference_check;
  alter table public.claims add constraint claims_early_preference_check
    check (early_preference is null or early_preference in ('auto_submit_day_31','agent_call'));
end $$;

-- Doug 2026-07-23: customer address mirroring the bulk-import file spec
-- (CUST_STREET/2/CIT/ST/ZIP). Empty until the import fills them; the ZIP
-- powers the staff records search.
alter table public.guarantees add column if not exists customer_street text;
alter table public.guarantees add column if not exists customer_street2 text;
alter table public.guarantees add column if not exists customer_city text;
alter table public.guarantees add column if not exists customer_state text;
alter table public.guarantees add column if not exists customer_zip text;

-- Widen the status check to admit 'draft' on pre-M5 deployments and
-- 'inspection_scheduled' on pre-v3 ones.
do $$ begin
  alter table public.claims drop constraint if exists claims_status_check;
  alter table public.claims add constraint claims_status_check check (status in (
    'draft','submitted','in_review','inspection_scheduled','approved',
    'dealer_scheduled','completed','denied','expired','withdrawn'
  ));
end $$;

-- One mattress per row; max 2 per request is enforced in the repository layer.
create table if not exists public.claim_items (
  id uuid primary key default uuid_generate_v4(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  model_number text not null,          -- from the mattress tag or the receipt
  not_soiled boolean not null default false,
  no_odors boolean not null default false,
  not_damaged boolean not null default false,
  position int not null default 0,
  created_at timestamptz default now()
);
create index if not exists claim_items_claim_idx on public.claim_items (claim_id);

create table if not exists public.claim_photos (
  id uuid primary key default uuid_generate_v4(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  angle text not null check (angle in (
    'law_tag','model_tag','overall','protector',
    'foot','left_side','right_side','head','top_down','receipt'
  )),
  -- Nullable on purpose: with no Supabase Storage configured the capture is
  -- recorded as metadata only so the request is never blocked (see lib/storage.ts).
  storage_path text,
  label text,
  file_name text,
  captured boolean not null default true,
  captured_at timestamptz default now(),
  ai_coach jsonb,
  created_at timestamptz default now()
);
create index if not exists claim_photos_claim_idx on public.claim_photos (claim_id);

-- Idempotent migration for existing deployments (M5).
alter table public.claim_photos alter column storage_path drop not null;
alter table public.claim_photos add column if not exists label text;
alter table public.claim_photos add column if not exists file_name text;
alter table public.claim_photos add column if not exists captured boolean not null default true;
alter table public.claim_photos add column if not exists captured_at timestamptz default now();
do $$ begin
  alter table public.claim_photos drop constraint if exists claim_photos_angle_check;
  alter table public.claim_photos add constraint claim_photos_angle_check check (angle in (
    'law_tag','model_tag','overall','protector',
    'foot','left_side','right_side','head','top_down','receipt'
  ));
end $$;

create table if not exists public.claim_notes (
  id uuid primary key default uuid_generate_v4(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null,
  is_internal boolean not null default true,  -- admin-only when true
  created_at timestamptz default now()
);
create index if not exists claim_notes_claim_idx on public.claim_notes (claim_id);

-- v3: document links agents attach to a claim (exchange authorization sheet,
-- tech report, …) — how RAP's manual adjudication lands back in the app.
create table if not exists public.claim_links (
  id uuid primary key default uuid_generate_v4(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  kind text not null check (kind in ('exchange_authorization','tech_report','other')),
  url text not null,
  label text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);
create index if not exists claim_links_claim_idx on public.claim_links (claim_id);

-- Payment seam only — dev team wires Stripe (PRD §2).
create table if not exists public.payments (
  id uuid primary key default uuid_generate_v4(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  kind text not null check (kind in ('restocking_fee','price_difference')),
  amount numeric not null,
  status text not null default 'pending'
    check (status in ('pending','authorized','captured','failed','refunded')),
  provider text,
  provider_ref text,
  created_at timestamptz default now()
);
create index if not exists payments_claim_idx on public.payments (claim_id);

-- ---------------------------------------------------------------------------
-- Shop coupons (v2 expansion #6, M5b)
-- Issued to one guarantee ON REQUEST with a four-week expiry — never a static
-- always-on code. Persisted so the code a customer comes back to is the same
-- code they were given. pct is SNAPSHOTTED from dealer_locations.coupon_pct at
-- issue time: changing the dealer's percentage later must not silently alter a
-- code already in a customer's hands.
-- ---------------------------------------------------------------------------
create table if not exists public.coupons (
  id uuid primary key default uuid_generate_v4(),
  guarantee_id uuid not null references public.guarantees(id) on delete cascade,
  dealer_location_id text,                  -- whose counter honors it (snapshot)
  code text not null unique,                -- SLP-XXXXXX
  pct numeric,                              -- whole-percent discount (snapshot)
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz default now()
);
create index if not exists coupons_guarantee_idx on public.coupons (guarantee_id);

-- ---------------------------------------------------------------------------
-- Sleep-companion tables
-- ---------------------------------------------------------------------------
create table if not exists public.journey (
  id uuid primary key default uuid_generate_v4(),
  guarantee_id uuid not null unique references public.guarantees(id) on delete cascade,
  start_date date not null,                 -- = delivery_date
  current_day int,                          -- computed snapshot; source of truth is delivery_date
  phase text not null default 'settle_in'
    check (phase in ('settle_in','safety_net','expired','resolved')),
  -- One-time out-of-the-box first impression (captured day 0–1).
  initial_impression text
    check (initial_impression in ('firmer','just_right','softer')),
  initial_impression_note text,
  initial_impression_at timestamptz,
  created_at timestamptz default now()
);

-- Idempotent migration for existing deployments (columns added after M3).
alter table public.journey add column if not exists initial_impression text;
alter table public.journey add column if not exists initial_impression_note text;
alter table public.journey add column if not exists initial_impression_at timestamptz;
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'journey_initial_impression_check'
  ) then
    alter table public.journey add constraint journey_initial_impression_check
      check (initial_impression in ('firmer','just_right','softer'));
  end if;
end $$;

-- Concerns quietly recorded by the concierge chat (optional tool-use capture).
create table if not exists public.concerns (
  id uuid primary key default uuid_generate_v4(),
  guarantee_id uuid not null references public.guarantees(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);
create index if not exists concerns_guarantee_idx on public.concerns (guarantee_id);

create table if not exists public.check_ins (
  id uuid primary key default uuid_generate_v4(),
  guarantee_id uuid not null references public.guarantees(id) on delete cascade,
  date date not null default current_date,
  feeling text not null check (feeling in ('better','same','rougher')),
  note text,
  created_at timestamptz default now()
);
create index if not exists check_ins_guarantee_idx on public.check_ins (guarantee_id);

-- Tunable content layer (editable / seedable).
create table if not exists public.tips (
  id uuid primary key default uuid_generate_v4(),
  day_min int,
  day_max int,
  phase text check (phase in ('settle_in','safety_net','expired','resolved','any')),
  time_of_day text not null default 'any'
    check (time_of_day in ('morning','day','evening','night','any')),
  title text not null,
  body text not null,
  active boolean not null default true,
  created_at timestamptz default now()
);

create table if not exists public.concierge_threads (
  id uuid primary key default uuid_generate_v4(),
  guarantee_id uuid not null references public.guarantees(id) on delete cascade,
  created_at timestamptz default now()
);

create table if not exists public.concierge_messages (
  id uuid primary key default uuid_generate_v4(),
  thread_id uuid not null references public.concierge_threads(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  body text not null,
  created_at timestamptz default now()
);
create index if not exists concierge_messages_thread_idx on public.concierge_messages (thread_id);

-- B-11: coach usage telemetry. Numbers + thread only — no guarantee_id, no
-- text (privacy-adjusted design 2026-07-24). Server-only via service_role; see
-- supabase/migrations/20260724120000_concierge_usage.sql for the daily view,
-- RLS and grants (fresh installs run schema.sql THEN the migrations).
create table if not exists public.concierge_usage (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references public.concierge_threads(id) on delete set null,
  model text not null,
  api_calls integer not null default 1,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_creation_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists concierge_usage_created_idx
  on public.concierge_usage (created_at);

-- B-13: tunable limits + rate-limit counters. Server-only (service_role). Full
-- definitions, grants and the atomic bump function live in
-- supabase/migrations/20260724180000_b13_settings_and_rate_limits.sql; fresh
-- installs run schema.sql THEN the migrations.
create table if not exists public.app_settings (
  key text primary key,
  value numeric not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.rate_counters (
  bucket text not null,
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (bucket, key, window_start)
);
create index if not exists rate_counters_window_idx
  on public.rate_counters (window_start);

-- keep claims.updated_at fresh
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists claims_set_updated_at on public.claims;
create trigger claims_set_updated_at before update on public.claims
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.dealer_locations   enable row level security;
alter table public.guarantees         enable row level security;
alter table public.claims             enable row level security;
alter table public.claim_items        enable row level security;
alter table public.claim_photos       enable row level security;
alter table public.claim_notes        enable row level security;
alter table public.claim_links        enable row level security;
alter table public.payments           enable row level security;
alter table public.coupons            enable row level security;
alter table public.journey            enable row level security;
alter table public.check_ins          enable row level security;
alter table public.concerns           enable row level security;
alter table public.tips               enable row level security;
alter table public.concierge_threads  enable row level security;
alter table public.concierge_messages enable row level security;

-- profiles: self + admin
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles
  for select using (id = auth.uid() or public.is_rap_admin());
drop policy if exists profiles_self_update on public.profiles;
-- Audit 2026-07-28: WITH CHECK freezes the privilege columns to their current
-- values, so a self-update can edit email/phone/name but can NEVER change role
-- or dealer scope. Without it, an authenticated user could PATCH their own row
-- via PostgREST and set role='rap_admin' (privilege escalation). service_role
-- and by-hand SQL promotion bypass RLS, so backend/admin role management is
-- unaffected. The subqueries read the caller's own row (id = auth.uid()); the
-- profiles SELECT policy and is_rap_admin() (SECURITY DEFINER) prevent recursion.
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select p.role from public.profiles p where p.id = auth.uid())
    and dealer_location_id is not distinct from
        (select p.dealer_location_id from public.profiles p where p.id = auth.uid())
  );

-- dealer_locations: admin all · dealer own location · consumer via own guarantee.
-- (Server-authoritative reads use the service role, which bypasses RLS; these
--  policies harden any future client/anon access, consistent with the others.)
drop policy if exists dealer_locations_read on public.dealer_locations;
create policy dealer_locations_read on public.dealer_locations
  for select using (
    public.is_rap_admin()
    or id = public.current_dealer_location()
    or exists (
      select 1 from public.guarantees g
      where g.dealer_location_id = dealer_locations.id
        and g.consumer_id = auth.uid()
    )
  );
drop policy if exists dealer_locations_admin_write on public.dealer_locations;
create policy dealer_locations_admin_write on public.dealer_locations
  for all using (public.is_rap_admin()) with check (public.is_rap_admin());

-- guarantees: consumer own · admin all · dealer by location
drop policy if exists guarantees_read on public.guarantees;
create policy guarantees_read on public.guarantees
  for select using (
    consumer_id = auth.uid()
    or public.is_rap_admin()
    or (dealer_location_id is not null and dealer_location_id = public.current_dealer_location())
  );
drop policy if exists guarantees_admin_write on public.guarantees;
create policy guarantees_admin_write on public.guarantees
  for all using (public.is_rap_admin()) with check (public.is_rap_admin());

-- claims: consumer own · admin all · dealer by guarantee location
drop policy if exists claims_read on public.claims;
create policy claims_read on public.claims
  for select using (
    consumer_id = auth.uid()
    or public.is_rap_admin()
    or exists (
      select 1 from public.guarantees g
      where g.id = claims.guarantee_id
        and g.dealer_location_id = public.current_dealer_location()
    )
  );
drop policy if exists claims_consumer_insert on public.claims;
create policy claims_consumer_insert on public.claims
  for insert with check (consumer_id = auth.uid());
drop policy if exists claims_admin_write on public.claims;
create policy claims_admin_write on public.claims
  for all using (public.is_rap_admin()) with check (public.is_rap_admin());

-- claim_items: follow the parent claim's scope (same shape as claim_photos)
drop policy if exists claim_items_read on public.claim_items;
create policy claim_items_read on public.claim_items
  for select using (
    public.is_rap_admin()
    or exists (
      select 1 from public.claims c
      join public.guarantees g on g.id = c.guarantee_id
      where c.id = claim_items.claim_id
        and (c.consumer_id = auth.uid()
             or g.dealer_location_id = public.current_dealer_location())
    )
  );

-- claim_photos: follow the parent claim's scope
drop policy if exists claim_photos_read on public.claim_photos;
create policy claim_photos_read on public.claim_photos
  for select using (
    public.is_rap_admin()
    or exists (
      select 1 from public.claims c
      join public.guarantees g on g.id = c.guarantee_id
      where c.id = claim_photos.claim_id
        and (c.consumer_id = auth.uid()
             or g.dealer_location_id = public.current_dealer_location())
    )
  );

-- claim_notes: admin sees all; consumer/dealer see non-internal notes on their claims
drop policy if exists claim_notes_read on public.claim_notes;
create policy claim_notes_read on public.claim_notes
  for select using (
    public.is_rap_admin()
    or (is_internal = false and exists (
      select 1 from public.claims c
      join public.guarantees g on g.id = c.guarantee_id
      where c.id = claim_notes.claim_id
        and (c.consumer_id = auth.uid()
             or g.dealer_location_id = public.current_dealer_location())
    ))
  );

-- claim_links (v3): admin all; consumer/dealer via the parent claim's scope,
-- same join shape as claim_notes. An ANONYMOUS unlinked claim has no
-- consumer_id and no guarantee row, so neither branch matches — those links
-- are service-role only until the claim is matched, by design (spec/handoff:
-- follow the existing pattern; do not weaken existing policies).
drop policy if exists claim_links_read on public.claim_links;
create policy claim_links_read on public.claim_links
  for select using (
    public.is_rap_admin()
    or exists (
      select 1 from public.claims c
      join public.guarantees g on g.id = c.guarantee_id
      where c.id = claim_links.claim_id
        and (c.consumer_id = auth.uid()
             or g.dealer_location_id = public.current_dealer_location())
    )
  );
drop policy if exists claim_links_admin_write on public.claim_links;
create policy claim_links_admin_write on public.claim_links
  for all using (public.is_rap_admin()) with check (public.is_rap_admin());

-- payments: admin all; consumer own claim
drop policy if exists payments_read on public.payments;
create policy payments_read on public.payments
  for select using (
    public.is_rap_admin()
    or exists (
      select 1 from public.claims c
      where c.id = payments.claim_id and c.consumer_id = auth.uid()
    )
  );

-- coupons: consumer own guarantee · admin all · dealer by guarantee location
-- (issuing is server-authoritative via the service role, which bypasses RLS)
drop policy if exists coupons_read on public.coupons;
create policy coupons_read on public.coupons
  for select using (
    public.is_rap_admin()
    or exists (
      select 1 from public.guarantees g
      where g.id = coupons.guarantee_id
        and (g.consumer_id = auth.uid()
             or g.dealer_location_id = public.current_dealer_location())
    )
  );

-- journey: consumer own · admin all · dealer by guarantee location
drop policy if exists journey_read on public.journey;
create policy journey_read on public.journey
  for select using (
    public.is_rap_admin()
    or exists (
      select 1 from public.guarantees g
      where g.id = journey.guarantee_id
        and (g.consumer_id = auth.uid()
             or g.dealer_location_id = public.current_dealer_location())
    )
  );

-- check_ins: consumer own · admin all
drop policy if exists check_ins_read on public.check_ins;
create policy check_ins_read on public.check_ins
  for select using (
    public.is_rap_admin()
    or exists (
      select 1 from public.guarantees g
      where g.id = check_ins.guarantee_id and g.consumer_id = auth.uid()
    )
  );
drop policy if exists check_ins_consumer_insert on public.check_ins;
create policy check_ins_consumer_insert on public.check_ins
  for insert with check (
    exists (
      select 1 from public.guarantees g
      where g.id = check_ins.guarantee_id and g.consumer_id = auth.uid()
    )
  );

-- concerns: consumer own · admin all (writes are server-authoritative via service role)
drop policy if exists concerns_read on public.concerns;
create policy concerns_read on public.concerns
  for select using (
    public.is_rap_admin()
    or exists (
      select 1 from public.guarantees g
      where g.id = concerns.guarantee_id and g.consumer_id = auth.uid()
    )
  );

-- tips: readable by any authenticated user; only admin edits
drop policy if exists tips_read on public.tips;
create policy tips_read on public.tips
  for select using (auth.role() = 'authenticated');
drop policy if exists tips_admin_write on public.tips;
create policy tips_admin_write on public.tips
  for all using (public.is_rap_admin()) with check (public.is_rap_admin());

-- concierge: consumer own · admin all
drop policy if exists concierge_threads_read on public.concierge_threads;
create policy concierge_threads_read on public.concierge_threads
  for select using (
    public.is_rap_admin()
    or exists (
      select 1 from public.guarantees g
      where g.id = concierge_threads.guarantee_id and g.consumer_id = auth.uid()
    )
  );
drop policy if exists concierge_messages_read on public.concierge_messages;
create policy concierge_messages_read on public.concierge_messages
  for select using (
    public.is_rap_admin()
    or exists (
      select 1 from public.concierge_threads t
      join public.guarantees g on g.id = t.guarantee_id
      where t.id = concierge_messages.thread_id and g.consumer_id = auth.uid()
    )
  );
