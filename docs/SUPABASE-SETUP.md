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
| `SESSION_SECRET` | a random 32+ character string (e.g. `openssl rand -base64 32`) — **required in any deployed environment** |
| `ANTHROPIC_API_KEY` | optional; enables the live AI concierge (without it the app uses on-persona scripted replies) |
| `ANTHROPIC_MODEL` | optional; defaults to `claude-sonnet-5` |
| `NEXT_PUBLIC_DEMO_MODE` | `true` while demoing (shows the day-jumper); set `false` at launch |

## 6. Enable auth (for the account work)
**Authentication → Providers → Email** → enable.
Decide on **"Confirm email"**: leave **off** for a frictionless demo, turn **on** before launch.
Under **Authentication → URL Configuration**, set the Site URL to `https://rap-sleeplab.netlify.app` (plus `http://localhost:3000` for local) so password-reset and confirmation links resolve.

## 7. Redeploy and verify
1. Netlify → **Deploys → Trigger deploy → Deploy site** (env vars only apply to new builds).
2. Open the site, sign in, and walk a flow.
3. Confirm in Supabase: **Table Editor** → a row appears in `claims` (and `claim_items` / `claim_photos`), and objects land in the `claim-photos` bucket.

Once these are set, `getRepository()` switches from the in-memory fallback to Supabase automatically — **no code change required**.

---

## Troubleshooting
- **Still not persisting?** The env vars only take effect on a *new* build — trigger a redeploy.
- **Rows visible via service role but not to a signed-in user?** That's RLS doing its job; check the user's `profiles.role` and, for dealers, `dealer_location_id`.
- **Photo upload silently skipped?** The app degrades on purpose when Supabase isn't configured — confirm all three Supabase vars are present and the `claim-photos` bucket exists.
- **Never expose `SUPABASE_SERVICE_ROLE_KEY` to the client.** It bypasses RLS. Server-side only.
