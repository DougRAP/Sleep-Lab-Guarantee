# RAP Sleep Lab

Mobile-first PWA for filing 90-Night Comfort Guarantee exchanges, OEM warranty issues, and mattress service requests.

**Brand:** Sleep Lab by RAP  
**Demo Mode:** Fully functional with mock data. No Supabase or API keys required to view and test the flows on Netlify.

## Features in this scaffold

- Prefill support via `?token=…` (simulates dashboard button injection)
- Eligibility calculation from purchase date (treated as start date)
- Guided claim flow with chat-style UI
- Photo step emphasizing law tag + model tag (or $29 Fast In-Person Inspection)
- $99 restocking fee reminders + full T&C link placeholder
- Customer "My Claims" tracking
- Admin / Service board (demo)
- Care & Sleep Tips section
- Calming night-sky logo (half-moon + stars + counting sheep)
- Mobile-first responsive design
- PWA-ready (manifest + theme)

## Quick Start (Local Windows)

```bash
cd "C:\Newco\AI\RAP Sleep Lab"
# Copy all project files here if not already
npm install
npm run dev
```

Open http://localhost:3000

**Demo purchase:** sales order `123`, last name `demo`.

## Deploy to Netlify

1. Create GitHub repo `DougRAP/RAP-SleepLab` (if not done) and push this project.
2. In Netlify: New site from Git → select the repo.
3. Build settings:
   - Build command: `npm run build`
   - Publish directory: `.next` (Netlify Next.js runtime will handle it; or use `@netlify/plugin-nextjs`)
4. Deploy. The demo is immediately viewable.

## Later: Connect Supabase

1. Create a Supabase project.
2. Run the SQL in `supabase/schema.sql`.
3. Add environment variables in Netlify:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Replace mock data / local state with real Supabase client calls.
5. Turn off pure demo mode.

## Support placeholders
- Phone: 1-800-RAP-SLEEP
- Email: support@rapsleeplab.com

## Key business rules encoded
- 31–90 day window for comfort exchange (purchase date = start)
- One-time exchange
- $99 restocking fee
- Law tag + model tag photos preferred (or $29 inspection)
- Friendly reminders + full Guarantee document link

Built for RAP by the Grok team.
