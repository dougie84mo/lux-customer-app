# Supabase — schema is NOT owned here

This customer app talks to the **shared** Supabase project
`ywmeghkhswixaueptfrt`, but it does **not** own the database schema.

**The single source of truth for migrations and Edge Functions is the business
app:** `../app/supabase/` (`migrations/`, `functions/`). All schema changes —
new tables, columns, RPCs, RLS policies, triggers, Edge Functions — are authored
and applied there.

Do **not** add a `migrations/` or `functions/` tree in this repo, and do not
apply schema from this app. If the customer app needs a new RPC or column:

1. Add the migration in `../app/supabase/migrations/` (schema is the contract).
2. Apply it from the business app via the Supabase MCP `apply_migration`
   (**never `npx supabase db push`** — the remote migration history diverged
   from the numbered files).
3. Consume it here via a hook in `lib/<area>.ts`.

This app authenticates as `authenticated` and relies on RLS for isolation. It
calls DB RPCs plus three Edge Functions owned by the business app:
`create-payment-intent` and `create-deposit-intent` (`lib/payments.ts`) and the
dev-only `seed-mock-team` (`lib/schedules.ts`).
