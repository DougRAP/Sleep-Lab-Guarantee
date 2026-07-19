-- RAP Sleep Lab — demo seed (M2, updated)
-- Run after schema.sql. Delivery dates are relative so the journey helps from
-- night one. The in-memory fallback (lib/data/seed.ts) mirrors this data.
--
-- Turnbull: a FRESH purchase (delivery = today, Day 0) — the initial-impression
--   prompt shows first, before any nightly check-in.
-- Rivera: mid-journey (~Day 6) with the first impression already recorded, so
--   the nightly check-in flow is demoable too.

insert into public.guarantees (
  sales_order_number, guarantee_number, customer_first_name, customer_last_name,
  customer_email, customer_phone, dealer_name, dealer_location_id,
  manufacturer, oem_model, product_description, purchase_price,
  delivery_date, access_token
) values
  (
    '1011099325A', 'RAP-90-1011099325A', 'Andrew', 'Turnbull',
    'ajturnbull@example.com', '3365086052', 'RAP Furniture — Shelby', '101',
    'Sealy', '1234', 'Sealy Pillow Top — Queen', 599.99,
    current_date, 'demo-turnbull-token'
  ),
  (
    '1011099326B', 'RAP-90-1011099326B', 'Maya', 'Rivera',
    'mrivera@example.com', '7045551987', 'RAP Furniture — Shelby', '101',
    'Stearns & Foster', '5678', 'Stearns & Foster Luxury Firm — King', 1299.99,
    current_date - interval '6 days', 'demo-rivera-token'
  )
on conflict (sales_order_number) do nothing;

-- Journey snapshot for each demo guarantee (source of truth is delivery_date).
insert into public.journey (guarantee_id, start_date, current_day, phase)
select id, delivery_date, (current_date - delivery_date), 'settle_in'
from public.guarantees where sales_order_number in ('1011099325A', '1011099326B')
on conflict (guarantee_id) do nothing;

-- Rivera has already shared a first impression (mid-journey demo).
update public.journey j
set initial_impression = 'firmer',
    initial_impression_note = 'Firmer than the floor model felt.',
    initial_impression_at = now() - interval '6 days'
from public.guarantees g
where g.id = j.guarantee_id and g.sales_order_number = '1011099326B';

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
