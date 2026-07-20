# Supabase Setup Runbook

**Who:** RAP dev team · **Time:** ~20 minutes · **Why:** this unblocks real accounts, persistent claims/drafts, and photo storage. Until it's done the app runs an in-memory fallback where nothing persists between requests.

---

## 1. Create the project
1. https://supabase.com → **New project**
2. Name it (e.g. `rap-sleep-lab`), pick a US region, set a strong DB password (save it in your password manager).
3. Wait for provisioning to finish.

## 2. Collect the keys
**Project Settings → API**, copy three values:

| Value | Used as | Secrecy |
|---|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` | public |
| `anon` `public` key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public (RLS protects data) |
| `service_role` key | `SUPABASE_SERVICE_ROLE_KEY` | **SECRET — server only, never ship to the browser** |

## 3. Create the schema
**SQL Editor → New query** → paste the entire contents of `supabase/schema.sql` → **Run**.
This creates all tables, the status-machine constraints, the `updated_at` trigger, the `SECURITY DEFINER` helpers, and **RLS policies on every table**. It is written to be re-runnable (idempotent `alter table … add column if not exists`).

Then run `supabase/seed.sql` the same way to load the demo guarantee(s), journey, tips, and dealer location.

## 4. Create the storage bucket
**Storage → New bucket** → name it exactly **`claim-photos`** → **Private** (not public).
The app uploads through the server using the service-role key, so no extra storage policies are required for the current flow.

## 5. Set environment variables
**Netlify → Site configuration → Environment variables** (and mirror into `.env.local` for local dev):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | from step 2 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from step 2 |
| `SUPABASE_SERVICE_ROLE_KEY` | from step 2 — **secret** |
| `SESSION_SECRET` | a random 32+ character string (e.g. `openssl rand -base64 32`) — signs the light-verify fallback cookie; set it anyway |
| `ANTHROPIC_API_KEY` | optional; enables the live AI concierge (without it the app uses on-persona scripted replies) |
| `ANTHROPIC_MODEL` | optional; defaults to `claude-sonnet-5` |
| `NEXT_PUBLIC_DEMO_MODE` | `true` while demoing (shows the day-jumper); set `false` at launch |

## 6. Enable auth — REQUIRED, this is what turns real accounts on

Until this is done the app runs the light-verify fallback (sales order + last name). The moment the Supabase env vars are present, real accounts become the way in.

1. **Authentication → Providers → Email** → **enable**.
2. **Confirm email** → leave **OFF** for now (the product owner's call). The app is built so it can be turned on later without a code change: sign-up then simply asks the customer to check their inbox.
3. **Authentication → URL Configuration** → set **Site URL** to `https://rap-sleeplab.netlify.app`, and add `http://localhost:3000/**` plus `https://rap-sleeplab.netlify.app/**` as **Redirect URLs** — password-reset links land on `/auth/callback` and won't resolve otherwise.

### Make yourself a RAP admin
Every new account starts as `consumer` (an `on auth.users` trigger creates the profile row). Sign up in the app first, then in **SQL Editor**:

```sql
update public.profiles set role = 'rap_admin' where email = 'dwright@raptns.com';

-- a dealer, scoped to one location id (matches guarantees.dealer_location_id):
update public.profiles set role = 'dealer', dealer_location_id = '101'
  where email = 'store@dealer.example';
```

`rap_admin` sees every exchange request at `/admin`; a `dealer` sees only their own location's. Consumers who wander to `/admin` are redirected calmly.

## 7. Redeploy and verify
1. Netlify → **Deploys → Trigger deploy → Deploy site** (env vars only apply to new builds).
2. Open the site: you should now be asked to **create an account** (not to look up a sales order). Sign up, then link the demo purchase — sales order `123`, last name `demo`.
3. Confirm in Supabase: **Table Editor** → a row appears in `claims` (and `claim_items` / `claim_photos`), and objects land in the `claim-photos` bucket.

Once these are set, `getRepository()` switches from the in-memory fallback to Supabase automatically — **no code change required**.

---

## Troubleshooting
- **Still not persisting?** The env vars only take effect on a *new* build — trigger a redeploy.
- **Rows visible via service role but not to a signed-in user?** That's RLS doing its job; check the user's `profiles.role` and, for dealers, `dealer_location_id`.
- **Still being asked for a sales order instead of an account?** The two `NEXT_PUBLIC_SUPABASE_*` vars aren't reaching the build — real auth is off and the fallback is running.
- **"That purchase is already linked to another account"?** One purchase belongs to one account. Clear it with `update public.guarantees set consumer_id = null, linked_via = null where sales_order_number = '123';`
- **Photo upload silently skipped?** The app degrades on purpose when Supabase isn't configured — confirm all three Supabase vars are present and the `claim-photos` bucket exists.
- **Never expose `SUPABASE_SERVICE_ROLE_KEY` to the client.** It bypasses RLS. Server-side only.
