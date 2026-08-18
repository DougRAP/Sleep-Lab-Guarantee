-- RAP Sleep Lab — demo seed (M2, updated)
-- Run after schema.sql. Delivery dates are relative so the journey helps from
-- night one. The in-memory fallback (lib/data/seed.ts) mirrors this data.
--
-- Demo (order 123 / last name "demo"): a FRESH purchase (delivery = today, Day 0) — the initial-impression
--   prompt shows first, before any nightly check-in.
-- Rivera: mid-journey (~Day 6) with the first impression already recorded, so
--   the nightly check-in flow is demoable too.

-- PLACEHOLDER dealer — replace with real dealer contact + coupon before launch.
-- Keyed "101" so both demo guarantees (dealer_location_id '101') resolve to it.
-- Serves the dealer-triage card (#4) and the shop coupon (#6).
insert into public.dealer_locations (
  id, name, phone, email, site_url, coupon_code, coupon_pct
) values (
  '101', 'City Mattress', '(555) 012-3456', 'care@demobedding.example',
  'https://example.com/shop', 'SLEEPLAB20', 20
)
on conflict (id) do nothing;

insert into public.guarantees (
  sales_order_number, guarantee_number, customer_first_name, customer_last_name,
  customer_email, customer_phone, dealer_name, dealer_location_id,
  manufacturer, oem_model, product_description, purchase_price,
  delivery_date, access_token
) values
  (
    '123', 'RAP-90-123', 'Andrew', 'Demo',
    'andrew.demo@example.com', '3365086052', 'City Mattress', '101',
    'Sealy', '1234', 'Sealy Pillow Top — Queen', 599.99,
    current_date, 'demo-primary-token'
  ),
  (
    '1011099326B', 'RAP-90-1011099326B', 'Maya', 'Rivera',
    'mrivera@example.com', '7045551987', 'City Mattress', '101',
    'Stearns & Foster', '5678', 'Stearns & Foster Luxury Firm — King', 1299.99,
    current_date - interval '6 days', 'demo-rivera-token'
  )
on conflict (sales_order_number) do nothing;

-- Journey snapshot for each demo guarantee (source of truth is delivery_date).
insert into public.journey (guarantee_id, start_date, current_day, phase)
select id, delivery_date, (current_date - delivery_date), 'settle_in'
from public.guarantees where sales_order_number in ('123', '1011099326B')
on conflict (guarantee_id) do nothing;

-- Rivera has already shared a first impression (mid-journey demo).
update public.journey j
set initial_impression = 'firmer',
    initial_impression_note = 'Firmer than the floor model felt.',
    initial_impression_at = now() - interval '6 days'
from public.guarantees g
where g.id = j.guarantee_id and g.sales_order_number = '1011099326B';

-- ---------------------------------------------------------------------------
-- Six lifecycle guarantees + requests (one per status), mirroring
-- lib/data/seed.ts, so the staff desk reads like a live program out of the
-- box. Ported 2026-07-22 — the in-memory seed had these but this file didn't,
-- which left a fresh Supabase project with an empty /admin.
-- ---------------------------------------------------------------------------
insert into public.guarantees (
  sales_order_number, guarantee_number, customer_first_name, customer_last_name,
  customer_email, customer_phone, dealer_name, dealer_location_id,
  manufacturer, oem_model, product_description, purchase_price,
  delivery_date, access_token
) values
  ('1011099412A', 'RAP-90-1011099412A', 'Denise', 'Calloway',
   'd.calloway@example.com', '7045550214', 'City Mattress', '101',
   'Sealy', '2214', 'Sealy Posturepedic Plush — Queen', 749.99,
   current_date - 38, 'demo-calloway-token'),
  ('1011099437K', 'RAP-90-1011099437K', 'Marcus', 'Boyd',
   'marcus.boyd@example.com', '8285550172', 'City Mattress', '101',
   'Serta', '8871', 'Serta Perfect Sleeper — King', 899.99,
   current_date - 45, 'demo-boyd-token'),
  ('1011099450M', 'RAP-90-1011099450M', 'Priya', 'Natarajan',
   'priya.natarajan@example.com', '9805550346', 'City Mattress', '101',
   'Stearns & Foster', '4402', 'Stearns & Foster Estate — Queen', 1499.99,
   current_date - 58, 'demo-natarajan-token'),
  ('1011099461T', 'RAP-90-1011099461T', 'Evan', 'Kowalski',
   'e.kowalski@example.com', '7045550488', 'City Mattress', '101',
   'Beautyrest', '3320', 'Beautyrest Harmony — Split King (pair)', 1899.99,
   current_date - 63, 'demo-kowalski-token'),
  ('1011099478E', 'RAP-90-1011099478E', 'Gloria', 'Simmons',
   'gloria.simmons@example.com', '8285550631', 'City Mattress', '101',
   'Sealy', '5583', 'Sealy Crown Jewel — Queen', 999.99,
   current_date - 74, 'demo-simmons-token'),
  ('1011099489R', 'RAP-90-1011099489R', 'Ray', 'Delgado',
   'ray.delgado@example.com', '9805550759', 'City Mattress', '101',
   'Serta', '1108', 'Serta iComfort — Twin XL', 579.99,
   current_date - 52, 'demo-delgado-token')
on conflict (sales_order_number) do nothing;

insert into public.journey (guarantee_id, start_date, current_day, phase)
select id, delivery_date, (current_date - delivery_date), 'safety_net'
from public.guarantees
where sales_order_number in ('1011099412A','1011099437K','1011099450M',
                             '1011099461T','1011099478E','1011099489R')
on conflict (guarantee_id) do nothing;

with confirmations as (
  select '["clean_sanitary","law_tag_attached","model_tag_attached","like_new","both_partners_present","within_window","original_owner","in_possession_household","us_original_dealer"]'::jsonb as all_keys
)
insert into public.claims (
  guarantee_id, status, step, confirmations, pre_verified,
  reason_experience, preferred_replacement,
  contact_phone, contact_phone_kind, contact_email,
  at_delivery_address, new_address, still_owns, denial_reason,
  ra_number, tracking_number,
  submitted_at, reviewed_at, approved_at, completed_at, created_at, updated_at
)
select g.id, c.status, 'submitted', (select all_keys from confirmations), c.pre_verified,
       c.reason_experience, c.preferred_replacement,
       c.contact_phone, c.contact_phone_kind, c.contact_email,
       c.at_delivery_address, c.new_address, true, c.denial_reason,
       'RA-' || to_char(current_date - c.submitted_days, 'YYMMDD') || '-' || c.ra_suffix,
       c.tracking_number,
       (current_date - c.submitted_days) + interval '15 hours',
       case when c.reviewed_days  is not null then (current_date - c.reviewed_days)  + interval '15 hours' end,
       case when c.approved_days  is not null then (current_date - c.approved_days)  + interval '15 hours' end,
       case when c.completed_days is not null then (current_date - c.completed_days) + interval '15 hours' end,
       (current_date - c.created_days) + interval '15 hours',
       (current_date - c.updated_days) + interval '15 hours'
from (values
  ('1011099412A', 'submitted',        true,
   'It sleeps much warmer than the floor model and I wake up with lower-back stiffness.',
   'Something cooler, medium-firm.', '7045550214', 'mobile', 'd.calloway@example.com',
   true,  null, null, 'V7KM', 'RAP-W4XKQ7MD', 2,  null, null, null, 3,  2),
  ('1011099437K', 'in_review',        false,
   'Far softer than the one we tried in the store — I sink in and can''t turn over easily.',
   'The firmer Perfect Sleeper we almost bought.', '8285550172', 'mobile', 'marcus.boyd@example.com',
   true,  null, null, 'T4XG', 'RAP-N3TGV8PH', 6,  4,    null, null, 7,  4),
  ('1011099450M', 'approved',         true,
   'Pressure points at the hip and shoulder every morning, even after two months.',
   'A plusher Estate model, same size.', '9805550346', 'home', 'priya.natarajan@example.com',
   true,  null, null, 'R8DP', 'RAP-C6RJDM24', 12, 9,    7,    null, 13, 7),
  ('1011099461T', 'dealer_scheduled', false,
   'Both halves of the split king feel firmer than expected; neither of us has adjusted.',
   'The softer Harmony option on both sides.', '7045550488', 'mobile', 'e.kowalski@example.com',
   false, '412 Pinehurst Ct, Shelby, NC 28150', null, 'H6WC', 'RAP-F9HWSL73', 16, 13, 11, null, 17, 5),
  ('1011099478E', 'completed',        true,
   'Too firm from the first week and it never broke in the way the store said it would.',
   'The pillow-top version of the same set.', '8285550631', 'home', 'gloria.simmons@example.com',
   true,  null, null, 'Q3NF', 'RAP-D2QNXB85', 30, 27,   24,   18,   31, 18),
  ('1011099489R', 'denied',           false,
   'Feels lumpy on one side after a month and a half.',
   'Whatever holds its shape better.', '9805550759', 'mobile', 'ray.delgado@example.com',
   true,  null, 'Law tag removed — outside the guarantee''s like-new condition terms.',
   'B9SL', 'RAP-G7VKTP36', 10, 8,    null, null, 11, 8)
) as c(sales_order_number, status, pre_verified, reason_experience, preferred_replacement,
       contact_phone, contact_phone_kind, contact_email, at_delivery_address, new_address,
       denial_reason, ra_suffix, tracking_number,
       submitted_days, reviewed_days, approved_days, completed_days, created_days, updated_days)
join public.guarantees g on g.sales_order_number = c.sales_order_number
where not exists (
  select 1 from public.claims x where x.tracking_number = c.tracking_number
);

insert into public.claim_items (claim_id, model_number, not_soiled, no_odors, not_damaged, position, created_at)
select cl.id, i.model_number, true, true, true, i.position, cl.created_at
from (values
  ('RAP-W4XKQ7MD', 'SP-2214', 0),
  ('RAP-N3TGV8PH', 'PS-8871', 0),
  ('RAP-C6RJDM24', 'ES-4402', 0),
  ('RAP-F9HWSL73', 'BH-3320', 0),
  ('RAP-F9HWSL73', 'BH-3321', 1),
  ('RAP-D2QNXB85', 'CJ-5583', 0),
  ('RAP-G7VKTP36', 'IC-1108', 0)
) as i(tracking_number, model_number, position)
join public.claims cl on cl.tracking_number = i.tracking_number
where not exists (
  select 1 from public.claim_items x
  where x.claim_id = cl.id and x.model_number = i.model_number and x.position = i.position
);

-- Staff notes on the shared thread. The byline derives from the author
-- profile's role; if the staff accounts don't exist yet the note lands with a
-- null author, which is harmless.
insert into public.claim_notes (claim_id, author_id, body, is_internal, created_at)
select cl.id,
       (select p.id from public.profiles p where p.role = n.author_role limit 1),
       n.body, false,
       (current_date - n.days_ago) + interval '15 hours'
from (values
  ('RAP-N3TGV8PH', 'rap_admin',
   'Photos look complete and the law tag is legible. Reviewing against the like-new terms.', 4),
  ('RAP-C6RJDM24', 'rap_admin',
   'Approved — credit $1,499.99 toward the replacement. Dealer to schedule the exchange.', 7),
  ('RAP-F9HWSL73', 'dealer',
   'Customer called to schedule — exchange set for Thursday morning, both partners present.', 5)
) as n(tracking_number, author_role, body, days_ago)
join public.claims cl on cl.tracking_number = n.tracking_number
where not exists (
  select 1 from public.claim_notes x where x.claim_id = cl.id and x.body = n.body
);

-- ---------------------------------------------------------------------------
-- v3 (M-S1): a submitted ANONYMOUS claim, mirroring lib/data/seed.ts — no
-- guarantee link, no RA/tracking number; the CG claim number is the single
-- customer reference. Gives the admin desk an unlinked claim to render (M-S4).
-- Osborne matches no seeded guarantee, so auto-match correctly leaves it
-- unlinked.
-- ---------------------------------------------------------------------------
insert into public.claims (
  guarantee_id, dealer_location_id, status, step, confirmations, pre_verified,
  claim_number, first_name, last_name, delivery_zip,
  sales_order_number, model_number, purchase_date, delivery_date,
  protector_used, days_in_service_at_submit, early_preference,
  reason_experience, preferred_replacement,
  contact_phone, contact_phone_kind, contact_email,
  submitted_at, created_at, updated_at
)
select
  null, '101', 'submitted', 'submitted',
  '["clean_sanitary","law_tag_attached","model_tag_attached","like_new","both_partners_present","within_window","original_owner","in_possession_household","us_original_dealer"]'::jsonb,
  false,
  'CG7MKQ42', 'Terri', 'Osborne', '28105',
  '1011099600S', 'PL-2290', current_date - 46, current_date - 44,
  true, 40, null,
  'Softer than expected around the edges and I roll toward the middle.',
  'Something with firmer edge support.',
  '7045551340', 'mobile', 'terri.osborne@example.com',
  (current_date - 4) + interval '15 hours',
  (current_date - 4) + interval '15 hours',
  (current_date - 4) + interval '15 hours'
where not exists (
  select 1 from public.claims x where x.claim_number = 'CG7MKQ42'
);

-- ---------------------------------------------------------------------------
-- Fresh, UNLINKED guarantees for testing the full journey at three points:
-- day 0 (arrival), ~day 15 (settling in), ~day 35 (window open). None have
-- accounts or claims — link them and walk the flow.
-- ---------------------------------------------------------------------------
insert into public.guarantees (
  sales_order_number, guarantee_number, customer_first_name, customer_last_name,
  customer_email, customer_phone, dealer_name, dealer_location_id,
  manufacturer, oem_model, product_description, purchase_price,
  delivery_date, access_token
) values
  ('1011099501F', 'RAP-90-1011099501F', 'Alma', 'Fleming',
   'alma.fleming@example.com', '7045550901', 'City Mattress', '101',
   'Sealy', '7710', 'Sealy Essentials — Queen', 649.99,
   current_date, 'demo-fleming-token'),
  ('1011099502M', 'RAP-90-1011099502M', 'Victor', 'Mendez',
   'victor.mendez@example.com', '7045550902', 'City Mattress', '101',
   'Serta', '6620', 'Serta Blue Lagoon — Full', 799.99,
   current_date - 15, 'demo-mendez-token'),
  ('1011099503T', 'RAP-90-1011099503T', 'June', 'Tran',
   'june.tran@example.com', '7045550903', 'City Mattress', '101',
   'Beautyrest', '5510', 'Beautyrest Silver — Queen', 1099.99,
   current_date - 35, 'demo-tran-token')
on conflict (sales_order_number) do nothing;

insert into public.journey (guarantee_id, start_date, current_day, phase)
select id, delivery_date, (current_date - delivery_date),
       case when (current_date - delivery_date) > 30 then 'safety_net' else 'settle_in' end
from public.guarantees
where sales_order_number in ('1011099501F','1011099502M','1011099503T')
on conflict (guarantee_id) do nothing;

-- ---------------------------------------------------------------------------
-- Demo addresses for the seeded guarantees (2026-07-23), so the staff ZIP
-- search has something to find before the real bulk import. UPDATE (not
-- insert) so re-running refreshes existing rows too. Real data replaces
-- these via the City Mattress import.
-- ---------------------------------------------------------------------------
update public.guarantees g
set customer_street = a.street, customer_city = a.city,
    customer_state = a.state, customer_zip = a.zip
from (values
  ('1011099412A', '118 Maple Row',      'Shelby',    'NC', '28150'),
  ('1011099437K', '42 Laurel Bend',     'Asheville', 'NC', '28801'),
  ('1011099450M', '907 Camden Loop',    'Charlotte', 'NC', '28202'),
  ('1011099461T', '412 Pinehurst Ct',   'Shelby',    'NC', '28150'),
  ('1011099478E', '23 Birchfield Ave',  'Asheville', 'NC', '28801'),
  ('1011099489R', '1508 Weller St',     'Gastonia',  'NC', '28052'),
  ('1011099501F', '76 Dogwood Terrace', 'Shelby',    'NC', '28150'),
  ('1011099502M', '301 Kings Rd',       'Charlotte', 'NC', '28202'),
  ('1011099503T', '88 Riverbend Dr',    'Gastonia',  'NC', '28052')
) as a(sales_order_number, street, city, state, zip)
where g.sales_order_number = a.sales_order_number;

-- Tunable tips content layer (3–5 rows).
insert into public.tips (day_min, day_max, phase, time_of_day, title, body, active) values
  (0, 7,   'settle_in', 'evening', 'Give it a week',
   'The first nights on a new mattress can feel unfamiliar. Keep your room cool and dark, and let your body learn the new surface.', true),
  (0, 30,  'settle_in', 'night', 'Adjustment takes time',
   'Most bodies take four to six weeks to fully settle in. A little stiffness early on is normal and usually eases.', true),
  (8, 21,  'settle_in', 'morning', 'Rotate, don''t judge yet',
   'Around week two, rotate the mattress head-to-foot to keep it even. Hold off on any verdict — you''re still adjusting.', true),
  (22, 30, 'settle_in', 'evening', 'Almost through settling in',
   'You''re near the end of the adjustment window. If sleep is trending better, that''s the body finding its rhythm.', true),
  (31, 90, 'safety_net', 'any', 'The comfort exchange is open',
   'If it still isn''t right, your one-time comfort exchange is available. When you''re ready, we''ll walk through it together.', true)
on conflict do nothing;

-- 2026-07-24 — dealer name fix (Doug's "chat bug"). The original seed shipped
-- the placeholder 'RAP Furniture — Shelby' as dealer_name and the coach read it
-- back to a customer. The dealer is City Mattress; RAP is the program, never
-- the store. Idempotent retrofit for rows inserted by earlier seed runs.
update public.guarantees
set dealer_name = 'City Mattress'
where dealer_name = 'RAP Furniture — Shelby';

update public.dealer_locations
set name = 'City Mattress'
where id = '101' and name = 'Demo Bedding Co.';
