# Church Election — SDA Nominating Committee App

Vue 3 + TypeScript + Vite, packaged for mobile with Capacitor.

Built for the chair of the nominating committee (in most cases the pastor),
following the Seventh-day Adventist Church Manual (2022, Ch. 8 — Elections).

## Features
- 7-stage Manual process: Setup → Nominating → Consent → Report → Voting → Certification → Done
- Departments dropdown with the standard SDA departments/offices (bilingual), plus custom departments; add/remove freely
- Nominees per office with a consent-to-serve tracker
- Anonymous voting: a ballot records choices only — there is no voter field anywhere in the data model. Pass-the-device flow
- Results with totals, abstentions, leading/elected badges, and a copyable report for the minutes
- EN / ES toggle for the full interface; entered names and titles are never translated
- State persists on the device (localStorage)

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

## Notes
- v1 is a single-device, chair-run app. A shared multi-phone version
  (each committee member voting live from their own device) is phase 2
  and needs a backend — the ballot model is already anonymous by design,
  so no voter identity needs to be stripped later.
