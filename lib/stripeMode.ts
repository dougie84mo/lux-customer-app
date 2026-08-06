/*
 * Stripe test/live selection.
 *
 * One switch — EXPO_PUBLIC_STRIPE_MODE — picks between two publishable keys
 * that both live in .env. Flipping modes is a one-word edit plus a Metro
 * restart, rather than swapping a key in and out of a single slot (which is
 * how you end up shipping the wrong one).
 *
 * Metro inlines `process.env.EXPO_PUBLIC_*` by matching the literal source
 * text at build time, so every var has to be referenced STATICALLY. A computed
 * read — process.env[`EXPO_PUBLIC_..._${mode}`] — is not inlined and comes back
 * undefined in a real build. Hence the explicit branch below; don't collapse it
 * into a lookup.
 *
 * This is a build-time value, not a runtime one. A store build's mode is fixed
 * when EAS builds it, so EXPO_PUBLIC_STRIPE_MODE has to be right in the build
 * environment — it cannot be changed in a shipped binary or via an OTA update.
 *
 * Keep in sync with app/lib/stripeMode.ts — both apps charge on the same
 * platform account and must agree about which mode they are in.
 */

export type StripeMode = 'test' | 'live';

export const stripeMode: StripeMode =
  process.env.EXPO_PUBLIC_STRIPE_MODE === 'live' ? 'live' : 'test';

const modeKey =
  stripeMode === 'live'
    ? process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE
    : process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST;

// Back-compat: the original single-key var still works when the mode-specific
// pair isn't set, so an un-migrated .env keeps running unchanged.
const legacyKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;

export const publishableKey: string | undefined = modeKey || legacyKey || undefined;

const expectedPrefix = stripeMode === 'live' ? 'pk_live_' : 'pk_test_';

/*
 * The declared mode and the key actually resolved disagree. Both directions are
 * worth stopping for: a live key under STRIPE_MODE=test puts real cards through
 * a test run, and a test key under STRIPE_MODE=live silently takes fake money
 * from a real customer. Reported as "not configured" (see stripe.tsx) rather
 * than thrown — throwing at module scope would take down app boot, and every
 * route is eagerly loaded.
 */
export const stripeModeMismatch =
  !!publishableKey && !publishableKey.startsWith(expectedPrefix);

// Google Pay's testEnv has to track the key actually in use, not the declared
// mode — if the two ever disagree the key is what Stripe honours.
export const stripeUsingTestKey = !!publishableKey?.startsWith('pk_test_');

if (__DEV__) {
  if (stripeModeMismatch) {
    console.error(
      `[stripe] EXPO_PUBLIC_STRIPE_MODE=${stripeMode} but the publishable key is ` +
        `"${publishableKey?.slice(0, 8)}…" — expected one starting ${expectedPrefix}. ` +
        `Payments are disabled until .env and the mode agree.`,
    );
  } else if (!publishableKey) {
    console.warn('[stripe] no publishable key configured — payments are disabled.');
  } else {
    console.log(`[stripe] ${stripeMode} mode`);
  }
}
