# Church Election — SDA Nominating Committee App

Vue 3 + TypeScript + Vite, packaged for mobile with Capacitor.

Built for the chair of the nominating committee (in most cases the pastor),
following the Seventh-day Adventist Church Manual (2022, Ch. 8 — Elections).

## Features — the simple flow (Kahoot-style)
1. **Host starts a session** and picks the departments for next year (SDA dropdown or custom).
2. **One department fills the big screen**, with the session QR code + 6-digit code beside it.
3. **Names are submitted** — members send names from their phones; the **pastor or secretary taps + to add** each name to the official list (or types it directly). Each name gets the **next number** in the order added: 1, 2, 3…
4. **Vote by number** — host taps Start Voting; members scan the QR (or enter the code) and tap a big number tile on their phone. One vote per device per department, no names on ballots, no app install.
5. **Results** — ranked bars on the big screen; #1 = Director, #2 = Sub-Director. Host taps Next Department and repeats.
6. **Summary** — the elected board by department, copyable for the minutes.

EN/ES toggle throughout. Session state syncs live (Supabase when configured — see below — otherwise a local demo mode that syncs across tabs of one browser for testing).

The previous multi-tab "advanced" layout (stages, positions, consent tracker) is in git history if it's ever needed again; the main flow is intentionally this simple one.

## Run (web)
```bash
npm install
npm run dev      # develop
npm run build    # type-check (vue-tsc, strict) + production build to dist/
```

## Mobile (Capacitor)
App ID: `com.iglesiayork.churchelection` · Web dir: `dist`

```bash
npm run build
npx cap sync
npx cap open android   # Android Studio — Android platform is included
# iOS: on a Mac, run: npx cap add ios && npx cap sync && npx cap open ios
```

## QR voting (voters on their own phones)
1. Chair sets up the election and offices, then in the Ballot tab taps **Open QR voting**.
2. The app creates a voting session and shows a **QR code + 6-digit join code**.
3. Voters scan the QR (or enter the code) — the link opens `#/vote/<code>` on their phone, no install, no account, no name.
4. Each device can vote once per session; ballots contain choices only — no voter field.
5. The chair's tally updates live (polls every 3s) and merges QR ballots with any pass-the-device ballots.

**Modes**
- *Live mode* — set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_PUBLIC_BASE_URL` (see `.env.example`) after running `supabase/schema.sql` in a Supabase project, and host the web build at the public URL in the QR. This is the real multi-phone setup.
- *Local demo mode* (no env set) — sessions sync across tabs/windows of the same browser via localStorage + BroadcastChannel, so you can test chair + voter side by side on one device. It is **not** a multi-phone backend.

## Notes
- v1 is a single-device, chair-run app. A shared multi-phone version
  (each committee member voting live from their own device) is phase 2
  and needs a backend — the ballot model is already anonymous by design,
  so no voter identity needs to be stripped later.
