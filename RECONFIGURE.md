# customer-app — post-split reconfiguration checklist

This app was created by **copying the business app's Expo config verbatim** so the
code move could be verified first. Until the items below are done, this app shares
identifiers with the business app (`../app/`) and **must not be built or run
alongside it** (slug/scheme/bundle collisions).

Code move: ✅ done & verified (single client persona; business/device code removed).
Configuration: ⬜ pending (this file).

## To make it a distinct app

- [ ] **`package.json`** — set a unique `name` (e.g. `luxmirror-customer-app`).
- [ ] **`app.json`** — unique `expo.name`, `expo.slug`, `expo.scheme`
      (deep-link scheme), and `ios.bundleIdentifier` / `android.package`
      (e.g. `com.theluxmirror.customer`). Update the app icon/splash if desired.
- [ ] **`eas.json` + EAS** — create a NEW EAS project; set the new
      `extra.eas.projectId` in `app.json`. Build profiles can mirror the business
      app's.
- [ ] **`google-services.json`** — replace with the customer app's Firebase
      Android config (new Firebase app / package). iOS: `GoogleService-Info.plist`.
- [ ] **Push** — register the new EAS project's push credentials; verify tokens
      land in `user_push_tokens` (or wherever the business app stores them).
- [ ] **`.env`** — keep the same `EXPO_PUBLIC_SUPABASE_URL` /
      `EXPO_PUBLIC_SUPABASE_ANON_KEY` (shared project). Set a fresh
      `EXPO_PUBLIC_SENTRY_DSN` if using a separate Sentry project.
- [ ] **Git** — `git init` a new repo for `customer-app/` and add a remote when
      ready (it's currently a plain directory, no repo).
- [ ] **Install + typecheck** — `npm install` then `npx tsc --noEmit` (expect a
      clean run; this app has no `supabase/functions/` Deno files).

## Notes

- Schema stays owned by `../app/supabase/` — see `supabase/README.md`.
- A few business-only infra libs (`currentBusiness`, `businesses`, `permissions`)
  remain because shared infra (`errorLog`) imports them; they're inert in the
  client UI. They can be trimmed later, but leaving them is harmless.
