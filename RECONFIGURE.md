# customer-app — post-split reconfiguration checklist

> **✅ Completed 2026-06-23.** Kept as the record of what was done to make this
> a distinct app after the 2026-06-22 split. Nothing here is pending; the
> identity table in `README.md` is the live reference.

This app was created by **copying the business app's Expo config verbatim** so
the code move could be verified first. The items below made it a distinct app.

Code move: ✅ done & verified (single client persona; business/device code removed).
Configuration: ✅ done (2026-06-23).

## Done

- [x] **`package.json`** — `name: luxmirror-booking`.
- [x] **`app.json`** — `expo.name: LUX Booking`, `slug: luxmirror-booking`,
      `scheme: luxbooking`, `ios.bundleIdentifier` / `android.package`
      `com.theluxmirror.booking`. Brand icons landed 2026-08-11.
- [x] **`eas.json` + EAS** — new EAS project `4d955f77-7f89-4d8c-a769-8fa23c7e96d9`
      (`extra.eas.projectId`); build profiles mirror the business app's.
- [x] **`google-services.json`** — customer app's own Firebase Android config
      (committed; the FCM V1 key is EAS-managed, never in the repo).
- [x] **Push** — EAS push credentials registered; tokens land in the shared
      push-token table.
- [x] **`.env`** — same `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY` (shared
      project); own `EXPO_PUBLIC_SENTRY_DSN`.
- [x] **Git** — own repo, remote `git@github.com:dougie84mo/lux-customer-app.git`.
- [x] **Install + typecheck** — `npm install` then `npx tsc --noEmit` clean.

## Notes

- Schema stays owned by `../app/supabase/` — see `supabase/README.md`.
- A few business-only infra libs (`currentBusiness`, `businesses`, `permissions`)
  remain because shared infra (`errorLog`) imports them; they're inert in the
  client UI. They can be trimmed later, but leaving them is harmless.
