-- ---------------------------------------------------------------------------
-- TEST DATA (v3) — additional anonymous CG claims for exercising the admin
-- board, the TTC write-back, and claim links. Safe to run repeatedly
-- (idempotent). Run AFTER schema.sql and seed.sql. Delete rows freely; this
-- is throwaway test data ("@rapqa.com" addresses, 555 phone numbers).
-- ---------------------------------------------------------------------------

-- Five anonymous claims across the lifecycle. None match a seeded guarantee,
-- so they stay unlinked (scoped to dealer location '101' = City Mattress).
insert into public.claims (
  guarantee_id, dealer_location_id, status, step, confirmations, pre_verified,
  claim_number, ttc_claim, first_name, last_name, delivery_zip,
  sales_order_number, model_number, purchase_date, delivery_date,
  protector_used, days_in_service_at_submit, early_preference,
  reason_experience, preferred_replacement,
  contact_phone, contact_phone_kind, contact_email,
  denial_reason,
  submitted_at, reviewed_at, created_at, updated_at
)
select
  null, '101', c.status, 'submitted',
  '["clean_sanitary","law_tag_attached","model_tag_attached","like_new","both_partners_present","within_window","original_owner","in_possession_household","us_original_dealer"]'::jsonb,
  false,
  c.claim_number, c.ttc_claim, c.first_name, c.last_name, c.delivery_zip,
  c.sales_order_number, c.model_number,
  current_date - c.purchase_days_ago, current_date - c.delivery_days_ago,
  c.protector_used, c.days_in_service, c.early_preference,
  c.reason_experience, c.preferred_replacement,
  c.contact_phone, c.contact_phone_kind, c.contact_email,
  c.denial_reason,
  (current_date - c.submitted_days_ago) + interval '10 hours',
  case when c.reviewed_days_ago is not null
       then (current_date - c.reviewed_days_ago) + interval '14 hours' end,
  (current_date - c.submitted_days_ago) + interval '10 hours',
  (current_date - c.updated_days_ago) + interval '16 hours'
from (values
  -- 1. Fresh submission, in-window (day 38), protector used. The plain case.
  ('CGX4T9RM', null::text, 'submitted', 'Marcus', 'Whitfield', '28277',
   '1011099701A', 'SN-4415', 40, 38, true, 38, null::text,
   'Wakes up hot every night; the store model felt much cooler.',
   'Same size, a cooling hybrid.',
   '7045550991', 'mobile', 'marcus.whitfield@rapqa.com', null::text,
   0, null::int, 0),
  -- 2. Early submission (day 24) — customer chose auto-submit at day 31.
  ('CG2WPD84', null, 'submitted', 'Janet', 'Rios', '33445',
   '1011099702B', 'PL-8830', 26, 24, false, 24, 'auto_submit_day_31',
   'Too firm from day one; hoping it breaks in but not confident.',
   'A plush pillow-top.',
   '5615550242', 'mobile', 'janet.rios@rapqa.com', null,
   0, null, 0),
  -- 3. Early submission (day 18) — customer asked for an agent call.
  ('CG9KFH37', null, 'submitted', 'Harold', 'Pemberton', '33483',
   '1011099703C', 'ES-2201', 21, 18, true, 18, 'agent_call',
   'My back is worse than with the old mattress. I want to talk to someone.',
   'Not sure — need advice.',
   '5615550377', 'home', null, null,
   0, null, 0),
  -- 4. In review, already pulled into RAP production — TTC number written
  --    back. This is the two-database tie-in case.
  ('CG5RVN68', 'TTC-100482', 'in_review', 'Alicia', 'Grantham', '28105',
   '1011099704D', 'BH-6612', 55, 52, true, 47, null,
   'Sagging slightly where I sleep; edge feels soft when sitting.',
   'Firmer edge support, same comfort on top.',
   '7045550563', 'mobile', 'alicia.grantham@rapqa.com', null,
   5, 2, 2),
  -- 5. Inspection scheduled — tech visit arranged, TTC number assigned.
  ('CGW8QM25', 'TTC-100467', 'inspection_scheduled', 'Devon', 'Sattler', '28031',
   '1011099705E', 'CJ-9954', 70, 67, false, 60, null,
   'A ridge formed down the middle between our two sides.',
   'Whatever resists body impressions best.',
   '9805550818', 'mobile', 'devon.sattler@rapqa.com', null,
   7, 4, 1)
) as c(claim_number, ttc_claim, status, first_name, last_name, delivery_zip,
       sales_order_number, model_number, purchase_days_ago, delivery_days_ago,
       protector_used, days_in_service, early_preference,
       reason_experience, preferred_replacement,
       contact_phone, contact_phone_kind, contact_email, denial_reason,
       submitted_days_ago, reviewed_days_ago, updated_days_ago)
where not exists (
  select 1 from public.claims x where x.claim_number = c.claim_number
);

-- Claim links: what a RAP agent posts to keep the dealer's team informed.
-- Exchange authorization on the in-review claim; tech report placeholder on
-- the inspection one. URLs are placeholders — replace with real document
-- links when testing that path.
insert into public.claim_links (claim_id, kind, url, label)
select cl.id, l.kind, l.url, l.label
from (values
  ('CG5RVN68', 'exchange_authorization',
   'https://example.com/docs/ea/TTC-100482.pdf', 'Exchange Authorization — TTC-100482'),
  ('CGW8QM25', 'tech_report',
   'https://example.com/docs/tech/TTC-100467.pdf', 'Tech inspection report')
) as l(claim_number, kind, url, label)
join public.claims cl on cl.claim_number = l.claim_number
where not exists (
  select 1 from public.claim_links x where x.claim_id = cl.id and x.url = l.url
);
