# LUX Mirror — Customer App (`luxmirror-customer-app`)

You are a senior mobile engineer building the LUX Mirror **customer** app — the
Expo / React Native phone app that **clients** use to discover salons/barbers,
book appointments, manage their bookings, view their mirror photos, and get
reminders. You write production-quality TypeScript and rely on Postgres RLS for
authorization rather than client-side checks.

> **This is the client-facing half of a two-app split.** The **business** app
> (salon owners + staff: devices, calendar, CRM, team, billing) lives in the
> sibling `../app/` directory and is its own project. This app has **no business,
> device, or firmware concerns** — it is purely the customer experience.

---

## Scope

**This repo contains:** the Expo phone app a customer uses —
- Discover / search bookable businesses
- Book an appointment (pick location, service, provider, time slot)
- My bookings (upcoming/past, reschedule, cancel, self check-in, book again)
- My photos (mirror-captured JPEGs assigned to the client)
- Account (profile + avatar, password, legal)
- In-app notification center + push reminders

**This repo does NOT contain:**
- Any business/owner/staff surface (dashboard, devices, calendar, CRM, team,
  services management, subscription billing, business profile). That's `../app/`.
- The Supabase **schema / migrations / Edge Functions** — those are **owned by
  the business app** (`../app/supabase/`), which is the single source of truth for
  the shared database. This app only *reads/writes through* RPCs and tables via
  the Supabase client. See `supabase/README.md`.
- Any device / firmware / pairing / "looks" / platform-admin context.

---

## Tech stack

- **Runtime:** Expo SDK 54 + React Native 0.81 + React 19, TypeScript strict.
- **Routing:** `expo-router` v6 file-based routing under `app/`.
- **Server state:** `@tanstack/react-query` v5. Local component state for ephemeral
  UI; React context only for auth.
- **Backend client:** `@supabase/supabase-js` v2 with `react-native-url-polyfill`.
  Session persisted via `expo-secure-store`.
- **Auth:** Supabase Auth (email/password). `lib/auth.tsx` exposes `AuthProvider`
  + `useAuth`.
- **UI:** `react-native-paper` v5 + `@expo/vector-icons`. No inline styles — use
  Paper's theme + `StyleSheet.create`.
- **Forms:** `react-hook-form` + Zod via `@hookform/resolvers`. Shared schemas in
  `lib/schemas.ts`.
- **Payments (future):** appointment payments (deposits, checkout, tips) via Stripe
  **Connect** + native Payment Sheet — not built yet.
- **Lint:** `expo lint`. Tests: not yet.

---

## Repo layout

```
app/                          # expo-router routes (single client persona)
  (auth)/                     # login, forgot-password
  (app)/                      # authenticated client surface
    index.tsx                 # Home (ClientHome)
    discover.tsx              # find a business (multi-select type/category filters)
    book/[businessId].tsx     # booking flow (SlotPicker, any-provider, AM/PM)
    my-bookings.tsx           # upcoming/past, reschedule, cancel, check-in, book again
    my-photos.tsx             # mirror photos assigned to this client
    notifications.tsx         # in-app notification center
    account.tsx               # profile + avatar, password, legal
    legal/[doc].tsx
  _layout.tsx                 # root: Auth + QueryClient + Paper providers
components/                   # ClientHome, SlotPicker, RescheduleSheet,
                              # NotificationBell, ScreenErrorBoundary, ui/, …
lib/                          # auth, supabase, queryClient, theme, booking,
                              # schedules (availability), clientProfile, avatars,
                              # clientPhotos, notifications, push, realtime, schemas
supabase/README.md            # pointer — schema is owned by ../app/
```

---

## Domain model (client's view)

A **client** authenticates via Supabase Auth (the `handle_new_user` trigger,
owned by the business app, creates the matching `public.users` row). The client:

- **Discovers** bookable businesses via `search_bookable_businesses` (type +
  category arrays) and reads a business's public locations/services/policy via
  `business_locations_public` / `business_services_public` /
  `business_booking_policy_public`.
- **Books** by calling `request_booking` (creates a `booking_requests` row, and a
  `customers` row linked to the client by `user_id` if needed). Availability comes
  from `available_slots` / `available_days` (+ the `_any` union variants), which
  honor each provider's schedule, capabilities, time-off, booking horizon, and
  per-member slot interval/buffer.
- **Manages bookings** via `my_booking_requests`, `cancel_booking_request`,
  `reschedule_booking_request`, `client_check_in`. Cancellation/reschedule inside a
  business's cancellation window is rejected server-side.
- **Views photos** the mirror captured for them (`client_photos`, assigned by the
  business).
- Receives **in-app notifications** (`notifications`) + push reminders.

**Tenant isolation is the database's job (RLS).** Everything above is an RPC or
an RLS-protected table read keyed off `auth.uid()`. Never trust client-supplied
ids for authorization — the server rejects them anyway.

---

## Cross-app contract (shared Supabase backend)

Both apps point at the **same Supabase project** (`ywmeghkhswixaueptfrt`). The
**business app owns the schema** — all migrations and Edge Functions live in
`../app/supabase/`. Do **not** add a `migrations/` or `functions/` tree here, and
do not apply schema from this app. If this app needs a new RPC/column, it is
added as a migration **in the business app** (the schema is the contract), then
consumed here via a `lib/<area>.ts` hook.

This app calls **only DB RPCs** (no client-invoked Edge Functions today).

---

## Auth flow

```
User → Supabase Auth (email/password)
     → JWT in expo-secure-store
     → supabase-js stamps Authorization on every PostgREST + Realtime call
     → RLS evaluates auth.uid()
     → caller sees only their own data
```

`lib/auth.tsx` restores the session on cold start and refreshes via
`onAuthStateChange`. **JWT claim safety:** never use `user_metadata` for
authorization.

---

## Code standards

### TypeScript
- Functional components + hooks only.
- Server state through React Query. Invalidate keys on mutation success — see
  `lib/booking.ts` for the canonical pattern.
- Validate every form input with Zod via `react-hook-form` resolvers.
- Auth tokens are managed by `supabase-js` — don't read or log them.
- Paper components only; no inline styles (`StyleSheet.create` / `useTheme()`).
- Type-check with `npx tsc --noEmit` (after `npm install`).

### Architecture
- New client surface = (if it needs schema) a migration **in the business app**
  → a React Query hook in `lib/<area>.ts` → a route in `app/(app)/`.
- Wrap every screen with `ScreenErrorBoundary`.
- **Filters & multi-selects:** for *search* filters (Discover), no filter = all is
  the standard idiom; for *manage*-style multi-selects, default to all visibly
  selected and track exclusions with explicit Select/Deselect all.
- Build the simplest working version first; iterate.

---

## ⚠ Not configured yet (post-split TODO)

This app was split out of the business app by **copying its Expo config verbatim**.
Before building/shipping it as a distinct app, reconfigure (see `RECONFIGURE.md`):
`app.json` name/slug/scheme + iOS/Android bundle identifiers, `eas.json` /
EAS `projectId`, `google-services.json` (+ Firebase), and `.env`
(`EXPO_PUBLIC_*`). Until then it shares identifiers with the business app and must
not be built alongside it.

---

## Environment variables

`.env` is gitignored. See `.env.example`.

```env
EXPO_PUBLIC_SUPABASE_URL=https://ywmeghkhswixaueptfrt.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<publishable key>
```

`EXPO_PUBLIC_*` ships to the client. No server-only secrets belong in this app.
