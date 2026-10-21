# Supabase Setup — COMPLETE ✅

Connected on 2026-10-21. The app runs in **live mode**: sessions, name submissions,
ballots and tallies sync across devices through this project.

- **Project:** church-election-app (ref zhkpugpkjtqxirwosdfu), East US (North Virginia), Free plan
- **Project URL:** https://zhkpugpkjtqxirwosdfu.supabase.co
- **Tables:** vote_sessions + vote_ballots (schema.sql applied, RLS policies incl. PIN-rotation)
- **Keys:** the anon public key lives in the local `.env` (gitignored) and is baked into
  the production build at deploy time. Never add the `service_role` key anywhere in this app.

To redeploy after code changes, the build must run with `.env` present so Vite bakes the
live configuration in; without it the app falls back to local demo mode (same-device only).

# Supabase setup — live QR voting

Goal: voters on different phones can join one session and ballots tally live on the chair's screen.

## 1. Create the project
- supabase.com → Sign in with GitHub (Rtavare)
- New project: name `church-election-app`, free tier, region US East (closest to PA)
- Save the database password somewhere safe (not in this repo)

## 2. Create the tables
- Supabase dashboard → SQL Editor → New query
- Paste all of `supabase/schema.sql` → Run
- Expect: `vote_sessions` and `vote_ballots` tables, RLS on, ballots have NO voter column (anonymous by design)

## 3. Get the two public values
- Dashboard → Project Settings → API
- Copy: **Project URL** and **anon public key**
- These two are safe to embed in the app (anon key is public by design — do NOT use or share the `service_role` key)

## 4. Wire the app
Create `.env` in the project root (copy `.env.example`):
```
VITE_SUPABASE_URL=<Project URL>
VITE_SUPABASE_ANON_KEY=<anon public key>
VITE_PUBLIC_BASE_URL=<public hosting URL from step 5>
```
Then `npm run build` — the app switches from "Local demo mode" to "Live mode (Supabase)" automatically when these are present.

## 5. Host the web build at a public URL
The QR code encodes `VITE_PUBLIC_BASE_URL + #/vote/<code>`, so the built site must be reachable by voters' phones.
Options: GitHub Pages (needs the repo public or a paid plan for private-repo Pages), Netlify, or Vercel (free, connect the GitHub repo, set the same three env vars, build command `npm run build`, output `dist`).

## 6. Test on two phones
- Phone A (chair): open the hosted app, create a test election, add one office + two nominees, Ballot tab → Open QR voting — badge must say "Live mode (Supabase)"
- Phone B (voter): scan the QR, vote, submit
- Phone A should show the QR ballot count increment within ~3 seconds, with only totals in Results
