-- Dealer name fix, 2026-07-24 (Doug's "chat bug"). The coach told a customer
-- their retailer was "RAP Furniture in Shelby" — a placeholder written into
-- the original demo seed. The dealer is City Mattress; RAP is the guarantee
-- program, never the store. Idempotent; safe to re-run.

-- The 11 demo guarantees carry the placeholder in dealer_name.
update public.guarantees
set dealer_name = 'City Mattress'
where dealer_name = 'RAP Furniture — Shelby';

-- The store directory row the triage card / RA / coach resolve against.
update public.dealer_locations
set name = 'City Mattress'
where id = '101' and name = 'Demo Bedding Co.';
