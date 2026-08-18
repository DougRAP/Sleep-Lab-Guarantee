-- 20260728120000_profiles_no_privilege_escalation.sql
-- P0 security fix (audit 2026-07-28): close the privilege-escalation hole in the
-- profiles self-update policy.
--
-- Before: `profiles_self_update` was `for update using (id = auth.uid())` with NO
-- `with check`. RLS only checked WHICH row was touched, not WHAT the new row
-- held, so an authenticated user could call
--   PATCH /rest/v1/profiles?id=eq.<their-uid>   { "role": "rap_admin" }
-- straight through PostgREST (the anon key is public) and become an admin,
-- gaining read access to every customer's PII.
--
-- After: `with check` freezes the privilege columns (role, dealer_location_id)
-- to their current values. A self-update can still edit email/phone/full_name,
-- but role and dealer scope can never change through this path.
--
-- Legitimate role management is untouched: service_role (backend) and by-hand
-- SQL promotion run as roles that BYPASS RLS, so this policy never applies to
-- them. The subqueries read the caller's own row; the profiles SELECT policy and
-- is_rap_admin() (SECURITY DEFINER) keep them from recursing.
--
-- Idempotent: safe to re-run.

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select p.role from public.profiles p where p.id = auth.uid())
    and dealer_location_id is not distinct from
        (select p.dealer_location_id from public.profiles p where p.id = auth.uid())
  );
