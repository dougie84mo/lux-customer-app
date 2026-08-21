# LUX Booking — customer app (`luxmirror-booking`)

You are a senior mobile engineer on the LUX **customer** app — the Expo /
React Native phone app **clients** use to discover salons and barbers, book,
pay, manage bookings, keep their mirror photos, and get reminders. Production
TypeScript; authorization is Postgres RLS, never client-side checks.

| | |
|---|---|
| Display name / package | **LUX Booking** / `luxmirror-booking` |
| GitHub | `git@github.com:dougie84mo/lux-customer-app.git` |
| Bundle / package id | `com.theluxmirror.booking` · scheme `luxbooking` |
| EAS project | `4d955f77-7f89-4d8c-a769-8fa23c7e96d9` · own `google-services.json` |
| Stores | TestFlight since 2026-08-11; Google Play pending (D-U-N-S) |

> **This is the client-facing half of a two-app split (2026-06-22).** The
> **business** app — owners + staff: devices, calendar, CRM, team, billing,
> **and the canonical Supabase schema** — is the sibling `../app/` repo. This app
> has no business, device, firmware, or platform-admin surface. On this machine
> the parent `mirror/` folder also holds `../CLAUDE.md` (whole platform,
> machine-local) and the gitignored `../prompts/` runbooks; a fresh clone has
> neither, which is why the block below is duplicated here.

<!-- SHARED-RULES:BEGIN — canonical copy lives in mirror/CLAUDE.md (root); keep every copy byte-identical -->
## ⛔ SHARED RULES — every LUX repo

**Git: Claude commits, Doug pushes.** Claude may stage, make small scoped
`git commit`s on the checked-out branch, and read history (`status`, `log`,
`diff`, `show`). Claude never runs `push`, `pull`, `fetch`, `merge`, `rebase`,
`reset --hard`, force-push, amends a pushed commit, creates/deletes/switches
branches or tags, or changes remotes, `git config`, `~/.ssh/*`, `~/.gitconfig`,
ssh-agent state, or credential helpers. `web/admin` and `web/marketing`
auto-deploy to production on every push to `main`. When a push fails:
diagnose, report, stop — on 2026-08-01 Claude "fixed" `~/.ssh/config` and broke
pushes in every repo. Deploy commands are handed to Doug, not run; the one
exception is applying migrations / deploying Edge Functions through the
Supabase MCP. The `mirror/` parent folder is not a git repo — never run git
there.

**Shared Supabase project `ywmeghkhswixaueptfrt`** — one schema, in
`app/supabase/migrations/`, read and written by six repos including the mirror
firmware and the Linux server daemons (both service-role):

- **Never `npx supabase db push`** — the remote migration history diverged from
  the numbered files. Write the numbered `NNNN_name.sql`, then apply the same
  SQL with MCP `apply_migration`. One-off SQL: MCP `execute_sql`. After schema
  changes: MCP `get_advisors`.
- Every new `SECURITY DEFINER` function: `set search_path = public` **and** an
  explicit `revoke execute … from anon` (plus `authenticated` if worker-only).
  Supabase default privileges grant EXECUTE to anon; `revoke from public` is not
  enough — a real privilege escalation, fixed in `0086`. Detect the service
  role with `auth.jwt() is null or auth.jwt()->>'role' = 'service_role'`, never
  `auth.uid() is null`.
- Views over RLS tables: `with (security_invoker = true)`.
- Firmware-owned columns on `devices` / `device_pairings` (and firmware-written
  rows in `client_photos`, `device_commands`): add columns, never rename or drop.
- Authorization derives from `business_memberships` via `auth.uid()` — never
  from `user_metadata` and never from a client-supplied `business_id`.
<!-- SHARED-RULES:END -->

---

## Scope

**This repo contains** the Expo app a client uses:

- Discover / search bookable businesses (type + category filters, "near me"
  via `lib/location.ts`), business detail page + provider profiles, favorites
- Book (location → service → provider → slot), my bookings (reschedule,
  cancel, self check-in, book again), waitlist/recurring where a business allows
- **Pay** for an appointment (Stripe Payment Sheet), receipts + payment
  history, payment reminders, deposit display
- Reviews after a completed booking, loyalty punch-card progress
- My photos (mirror-captured JPEGs assigned to the client), profile + avatar,
  settings (Google account linking, password, legal), in-app notifications + push
- A "switch to the business app" companion link (`lib/companionApp.ts`)

**This repo does NOT contain:** any owner/staff surface; the Supabase schema,
migrations, or Edge Functions (all in `../app/supabase/` — see
`supabase/README.md`); anything device / firmware / looks / platform-admin.

---

## Tech stack

- Expo SDK 54 + React Native 0.81 + React 19, TypeScript strict;
  `expo-router` v6; `@tanstack/react-query` v5; `@supabase/supabase-js` v2 +
  `react-native-url-polyfill`; session in `expo-secure-store`.
- **Build: custom Dev Client** (`expo-dev-client`), not Expo Go — push, Payment
  Sheet, and Sentry need native modules. Same EAS workflow as the business app:
  `docs/native-development.md`, `BUILD_ANDROID.md`, `BUILD_IOS.md`.
- Auth: Supabase Auth email/password **+ Google sign-in** (PKCE web redirect,
  `lib/googleAuth.ts`, landing route `app/google-auth.tsx` — the route is
  mandatory, see `../prompts/AUTHENTICATION.md`).
- UI: `react-native-paper` v5 + `@expo/vector-icons`; no inline styles. Forms:
  `react-hook-form` + Zod (`lib/schemas.ts`).
- Payments: `@stripe/stripe-react-native` Payment Sheet (`lib/stripe.tsx`,
  `lib/payments.ts`); `lib/stripeMode.ts` picks test/live keys from
  `EXPO_PUBLIC_STRIPE_MODE`.
- Error reporting: `@sentry/react-native` (dark until `EXPO_PUBLIC_SENTRY_DSN` is set).
- Lint `expo lint`. **Tests: Jest** (`jest-expo`, `npm test`, `__tests__/`) —
  `lib/bookingLogic.ts` is the pure, tested core.

---

## Repo layout

Don't enumerate from memory — `ls "app/(app)"` is the route list. Shape:

```
app/(auth)/            login, forgot-password
app/google-auth.tsx    OAuth landing (intent-aware return)
app/(app)/             discover, business/[id], provider/[id], book/[businessId],
                       my-bookings, pay/, receipts(.tsx, /[id]), favorites,
                       my-photos, notifications, profile, settings, legal/[doc]
components/            ClientHome, SlotPicker, RescheduleSheet, ReviewSheet, ui/ …
lib/                   one file per domain (ls lib): booking, bookingLogic,
                       businessDetail, schedules, payments, checkout, favorites,
                       reviews, loyalty, location, googleAuth, push, realtime …
__tests__/             Jest
supabase/README.md     pointer — schema is owned by ../app/
```

---

## Domain model (the client's view)

A client authenticates via Supabase Auth (the business app's `handle_new_user`
trigger creates `public.users`). Everything below is an RPC or an RLS-protected
read keyed off `auth.uid()`:

- **Discover:** `search_bookable_businesses`, `business_public` (header),
  `business_locations_public` / `business_services_public` /
  `business_booking_policy_public`, `get_bookable_provider_profile`,
  `get_member_reviews` / `get_member_rating`.
- **Book:** `request_booking` → `booking_requests` (PENDING; creates/links a
  `customers` row by `user_id`). Availability: `available_slots` /
  `available_days` (+ `_any` variants) honouring schedules, capabilities,
  time-off, horizon, per-member interval/buffer.
- **Manage:** `my_booking_requests`, `cancel_booking_request`,
  `reschedule_booking_request`, `client_check_in` — cancellation-window rules
  are enforced server-side.
- **Pay:** `create-payment-intent` / `create-deposit-intent` Edge Functions →
  Payment Sheet → webhook-confirmed `paid`; receipts and deposit-applied views
  are RPCs/realtime. Deposit-at-booking and no-show fees are **not built** —
  they wait on the card-on-file slice in the business app
  (`../app/prompts/PAYMENTS_REMAINING_HANDOFF.md`).
- **After:** `submit_review` (verified bookings only), loyalty punch-card
  (trigger-bumped on COMPLETED), favorites, `client_photos`, `notifications` + push.

Tenant isolation is the database's job. Never trust client-supplied ids for
authorization — the server rejects them anyway.

---

## Cross-app contract

Both apps use the same project. **The business app owns the schema.** Needing a
new RPC / column / function means: migration in `../app/supabase/migrations/`
(applied via MCP `apply_migration`, never `db push`) → consume here via a
`lib/<area>.ts` hook. This app invokes **three Edge Functions**, all owned by
`../app/`: `create-payment-intent`, `create-deposit-intent`, and the dev-only
`seed-mock-team`. Everything else is RPC / table reads.

Deep links: `luxbooking://**` must stay in Supabase Auth → Redirect URLs
alongside the business app's `app://**`; the `/book/[id]` universal link is
shared with theluxmirror.com (`../prompts/REDIRECT_SPEC.md`, machine-local).

---

## Code standards

- Functional components + hooks; React Query for server state (invalidate on
  mutation success — `lib/booking.ts` is the pattern); Zod on every form; never
  read or log tokens; Paper only, `StyleSheet.create` / `useTheme()`.
- New client surface = (schema in `../app/` if needed) → hook in `lib/` → route
  in `app/(app)/`. Wrap every screen in `ScreenErrorBoundary`.
- Pure logic (deposit math, payable windows, balances) goes in
  `lib/bookingLogic.ts` with a Jest case; don't re-derive it in screens.
- Filters: for *search* filters (Discover) "no filter = all" is the idiom; for
  *manage*-style multi-selects default to all visibly selected with explicit
  Select/Deselect all.
- Verify: `npx tsc --noEmit` (clean — no Deno files here), `npm test`, `expo lint`.

---

## Environment variables

`.env` is gitignored; `.env.example` is authoritative. Client values only:
`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
`EXPO_PUBLIC_STRIPE_MODE` + `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST` / `_LIVE`,
`EXPO_PUBLIC_SENTRY_DSN`. `EXPO_PUBLIC_*` is inlined at build time and ships to
the client — no server secrets here, ever. Cross-repo key map:
`../prompts/ENV_MAP.md` (machine-local).

---

## Working with prompts

`prompts/` is gitignored (per-developer). `prompts/STATUS.md` is this app's
snapshot; `prompts/PAYMENTS_HANDOFF.md` is the customer-side payment contract.
Completed session logs and handoffs were deleted in the 2026-08-21 cleanup
after their facts were folded into `STATUS.md`. Cross-repo runbooks (store launch,
iOS build & submit, tester access, authentication, env map) live in
`../prompts/` — read its `README.md` first.
