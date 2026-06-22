# LUX Mirror — Customer App

The phone app salon owners and their staff use to manage LUX Smart Mirror
devices: sign up, pay, invite team members, pair devices, schedule
appointments, monitor the fleet.

Built with **Expo** (React Native) on top of **Supabase** (Postgres + Auth +
Realtime + Edge Functions). Talks to Supabase directly via supabase-js — no
custom backend.

The on-device mirror firmware lives in a separate repo
(`luxmirror`) and writes to the same Supabase project via the service-role
key. The internal LUX-staff admin SPA lives in another repo (web/admin) and
reads/writes the same DB through `platform_admins`-gated RLS.

## Layout

```
.
├── app/                       Expo Router routes (file-based)
│   ├── (auth)/                Login + signup
│   └── (app)/                 Authenticated app (dashboard, team, devices, …)
├── lib/                       Supabase client, auth context, hooks per domain
├── components/                Shared UI (theme components from create-expo-app)
├── assets/                    Icons, images, fonts
├── supabase/
│   ├── config.toml            Supabase CLI / local stack config
│   ├── migrations/            Postgres DDL + RLS — `supabase db push` deploys
│   ├── functions/
│   │   ├── start-checkout/    Creates Stripe Checkout sessions
│   │   └── stripe-webhook/    Receives Stripe events, writes subscriptions
│   └── seed.sql               Local dev seed (empty for now)
└── app.json                   Expo config
```

## Local setup

```bash
# 1. Install JS deps
npm install

# 2. Copy env and fill in your Supabase project values
cp .env.example .env
# edit .env:
#   EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
#   EXPO_PUBLIC_SUPABASE_ANON_KEY=<publishable / anon key>

# 3. Boot Expo dev server
npm start
# scan the QR with Expo Go on your phone
```

## Deploying the Supabase backend

You'll do this once per environment (test, prod) against a Supabase Cloud
project (https://supabase.com/dashboard).

```bash
# Authenticate the Supabase CLI (one-time)
npx supabase login

# Link this repo to your Supabase project
npx supabase link --project-ref <your-project-ref>

# Apply all migrations
npx supabase db push

# Deploy the Edge Functions
npx supabase functions deploy start-checkout
npx supabase functions deploy stripe-webhook
```

### Required Edge Function secrets

```bash
# Stripe
npx supabase secrets set STRIPE_SECRET_KEY=sk_test_or_live_...
npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...

# One price ID per plan × billing period (six total).
# Get these from https://dashboard.stripe.com/test/products after creating
# Starter / Pro / Enterprise products with monthly + annual prices.
npx supabase secrets set STRIPE_PRICE_STARTER_MONTHLY=price_...
npx supabase secrets set STRIPE_PRICE_STARTER_ANNUAL=price_...
npx supabase secrets set STRIPE_PRICE_PRO_MONTHLY=price_...
npx supabase secrets set STRIPE_PRICE_PRO_ANNUAL=price_...
npx supabase secrets set STRIPE_PRICE_ENTERPRISE_MONTHLY=price_...
npx supabase secrets set STRIPE_PRICE_ENTERPRISE_ANNUAL=price_...
```

### Stripe webhook setup

Tell Stripe where to deliver subscription events:

```bash
stripe webhook_endpoints create \
  --url="https://<project-ref>.supabase.co/functions/v1/stripe-webhook" \
  --enabled-events=checkout.session.completed \
  --enabled-events=customer.subscription.created \
  --enabled-events=customer.subscription.updated \
  --enabled-events=customer.subscription.deleted \
  --enabled-events=invoice.payment_failed
```

Copy the returned `secret` (starts with `whsec_`) into
`STRIPE_WEBHOOK_SECRET` (the secrets command above).

## Schema notes

The `devices` and `device_pairings` tables are **shared with the device
firmware**. The mirror writes via service-role; the phone app reads/updates
through the `claim_device` RPC (which scopes ownership to
`business_memberships`). When the device-side schema changes, coordinate the
migration with the firmware repo's `supabase/schema.sql`.

Tenant isolation lives entirely in Postgres RLS via the
`is_business_member` / `is_business_owner` helpers in
`migrations/0002_rls_policies.sql`. Every business-scoped row is gated on
the caller's membership; service-role bypasses for trusted server-side
flows (Stripe webhook, mirror heartbeats).

## Testing payments end-to-end

1. Create test products + prices in Stripe (https://dashboard.stripe.com/test/products)
2. Set the six `STRIPE_PRICE_*` secrets
3. Deploy both Edge Functions
4. Configure the webhook (above) and set `STRIPE_WEBHOOK_SECRET`
5. In the app: Settings → Subscription → Choose a plan → Continue to
   checkout → use card `4242 4242 4242 4242`, any future expiry, any CVC,
   any ZIP
6. The Subscription screen should flip from "No subscription yet" to your
   active plan after the webhook delivers.
