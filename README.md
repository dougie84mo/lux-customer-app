# LUX Booking — customer app

The phone app **clients** use to find a salon or barber, book, pay, and keep
their mirror photos: discover → book → pay → my bookings → receipts, plus
favorites, reviews, loyalty punch-cards, and push reminders.

Built with **Expo** (React Native) on **Supabase**. It is the client-facing
half of a two-app split (2026-06-22); the **business** app — owners and staff,
devices, calendar, CRM, team, billing — lives in the sibling `../app/` repo.

| | |
|---|---|
| Display name / package | **LUX Booking** / `luxmirror-booking` |
| Bundle / package id | `com.theluxmirror.booking` (scheme `luxbooking`) |
| GitHub | `dougie84mo/lux-customer-app` |
| EAS project | `4d955f77-7f89-4d8c-a769-8fa23c7e96d9` |
| Stores | TestFlight since 2026-08-11; Play pending (D-U-N-S) |

## Schema is not owned here

Both apps use the same Supabase project. **All migrations and Edge Functions
live in `../app/supabase/`.** This repo never adds a `migrations/` or
`functions/` tree — if a screen needs a new RPC or column, it is added in the
business app first (see `supabase/README.md` and `CLAUDE.md`).

## Local setup

```bash
npm install
cp .env.example .env      # EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY (+ Stripe mode keys)
npm start                 # Metro — open in the custom Dev Client, not Expo Go
npm test                  # Jest (jest-expo)
npx tsc --noEmit          # clean run expected (no Deno files here)
```

The app runs on a **custom Dev Client** (push, Payment Sheet, Google sign-in
need native modules Expo Go can't load). Build it with EAS — see
`BUILD_ANDROID.md` / `BUILD_IOS.md` (pointers to the shared guides in `../app/`).

## Layout

```
app/(auth)/        login, forgot-password, google-auth landing
app/(app)/         discover, book/, business/, provider/, my-bookings, pay/,
                   receipts, favorites, my-photos, notifications, profile, settings
lib/               one file per domain — booking, bookingLogic (pure, tested),
                   payments, favorites, reviews, loyalty, location, googleAuth …
components/        Paper-based shared UI
__tests__/         Jest
```

## Where the rest of the docs are

- `CLAUDE.md` — working agreement + architecture for this repo
- `docs/native-development.md` — Dev Client / EAS workflow (shared with `../app/`)
- Workspace-level runbooks (machine-local, gitignored `../prompts/`): store
  launch, iOS build & submit, tester access, env map, authentication.
