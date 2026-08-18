-- 20260728130000_claim_photos_private_bucket.sql
-- P0 security fix (audit 2026-07-28): version the claim-photos bucket as PRIVATE
-- and add owner-scoped storage policies.
--
-- The bucket holds mattress photos, law tags with names, and receipts — customer
-- PII. It was created by hand ("Create it (private) alongside the schema",
-- lib/storage.ts) and its private state lived only in the dashboard, where it
-- could silently drift to public. This pins it in version control.
--
-- Access model (unchanged): the app writes photos with the service-role client
-- and serves reads through short-lived signed URLs — both BYPASS RLS. The
-- policies below are DEFENSE IN DEPTH: if anything ever reads the bucket with a
-- user JWT instead, only the claim's owner, its dealer, or an admin can. No
-- write policy is granted to end users — uploads stay service-role only.
--
-- Idempotent: safe to re-run.

-- 1. The bucket, private. Force public = false even if it already exists.
insert into storage.buckets (id, name, public)
values ('claim-photos', 'claim-photos', false)
on conflict (id) do update set public = false;

-- 2. Owner / dealer / admin read policy. The object path is "<claimId>/<angle>.<ext>",
--    so the first folder segment is the claim id.
drop policy if exists claim_photos_owner_read on storage.objects;
create policy claim_photos_owner_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'claim-photos'
    and (
      public.is_rap_admin()
      or exists (
        select 1 from public.claims c
        where c.id::text = (storage.foldername(name))[1]
          and c.consumer_id = auth.uid()
      )
      or exists (
        select 1
        from public.claims c
        join public.guarantees g on g.id = c.guarantee_id
        where c.id::text = (storage.foldername(name))[1]
          and g.dealer_location_id = public.current_dealer_location()
      )
    )
  );
