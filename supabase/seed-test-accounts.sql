-- ---------------------------------------------------------------------------
-- TEST ACCOUNTS (Doug 2026-08-18) — dummy purchases for the five test logins.
--
-- PREREQUISITE: create the five auth users first (Supabase Dashboard →
-- Authentication → Users → Add user, "Auto Confirm User" ticked):
--   smith@test.com, jones@test.com, osborn@test.com, johnson@test.com,
--   marks@test.com
--
-- Then run this script. It is idempotent: re-running refreshes the delivery
-- dates (relative to today) and re-links accounts. Timing (delivery = day 0,
-- window opens day 31):
--   Smith    day 16 — too early by 15 days
--   Jones    day 30 — too early by 1 day (opens tomorrow)
--   Osborn   day 35 — in window
--   Johnson  day 45 — in window
--   Marks    day 60 — in window
-- ---------------------------------------------------------------------------

insert into public.guarantees (
  sales_order_number, guarantee_number, customer_first_name, customer_last_name,
  customer_email, customer_phone, dealer_name, dealer_location_id,
  manufacturer, oem_model, product_description, purchase_price,
  delivery_date, access_token
)
select t.sales_order_number, t.guarantee_number, t.first_name, t.last_name,
       t.email, t.phone, 'City Mattress', '101',
       t.manufacturer, t.oem_model, t.description, t.price,
       current_date - t.day, t.access_token
from (values
  ('1011099801S', 'RAP-90-1011099801S', 'Sam',    'Smith',   'smith@test.com',
   '5615550801', 'Serta',   'SN-1101', 'Serta Arctic Premier Plush King',      2899.00, 16, 'tok-test-smith'),
  ('1011099802J', 'RAP-90-1011099802J', 'Jenna',  'Jones',   'jones@test.com',
   '5615550802', 'Sealy',   'PS-2202', 'Sealy Posturepedic Plus Firm Queen',   1799.00, 30, 'tok-test-jones'),
  ('1011099803O', 'RAP-90-1011099803O', 'Owen',   'Osborn',  'osborn@test.com',
   '5615550803', 'Stearns', 'ES-3303', 'Stearns & Foster Estate Medium Queen', 3299.00, 35, 'tok-test-osborn'),
  ('1011099804W', 'RAP-90-1011099804W', 'Jill',   'Johnson', 'johnson@test.com',
   '5615550804', 'Beautyrest', 'BH-4404', 'Beautyrest Harmony Lux Plush King', 2499.00, 45, 'tok-test-johnson'),
  ('1011099805M', 'RAP-90-1011099805M', 'Marcus', 'Marks',   'marks@test.com',
   '5615550805', 'Tempur',  'CJ-5505', 'Tempur-Pedic ProAdapt Medium Queen',   3999.00, 60, 'tok-test-marks')
) as t(sales_order_number, guarantee_number, first_name, last_name, email,
       phone, manufacturer, oem_model, description, price, day, access_token)
where not exists (
  select 1 from public.guarantees g
  where g.sales_order_number = t.sales_order_number
);

-- Re-running refreshes the day counts so the stages stay true over time.
update public.guarantees g
set delivery_date = current_date - t.day
from (values
  ('1011099801S', 16), ('1011099802J', 30), ('1011099803O', 35),
  ('1011099804W', 45), ('1011099805M', 60)
) as t(sales_order_number, day)
where g.sales_order_number = t.sales_order_number;

-- Link each purchase to its auth account (matched by profile email). Safe to
-- re-run; only fills a missing link or repoints at the same account.
update public.guarantees g
set consumer_id = p.id, linked_via = 'lookup'
from public.profiles p
where lower(p.email) = lower(g.customer_email)
  and g.customer_email like '%@test.com'
  and (g.consumer_id is null or g.consumer_id = p.id);

-- See where each account stands.
select g.customer_last_name, g.customer_email, g.sales_order_number,
       current_date - g.delivery_date as day,
       case
         when current_date - g.delivery_date < 31 then
           'too early by ' || (31 - (current_date - g.delivery_date)) || ' day(s)'
         when current_date - g.delivery_date <= 90 then 'in window'
         else 'window closed'
       end as stage,
       (g.consumer_id is not null) as linked
from public.guarantees g
where g.customer_email like '%@test.com'
order by day;
