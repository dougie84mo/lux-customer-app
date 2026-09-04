import { ReactNode } from 'react';

import { getStripeConfig, useStripeConfig } from './stripeMode';

// Platform publishable key. With separate charges & transfers the PaymentIntent
// lives on the PLATFORM account, so the platform key is correct (the same one
// the business app uses). Which key (test vs live) is decided by the server per
// business/user and delivered at runtime — see lib/stripeMode.ts. The env key
// is only the pre-sign-in fallback.

// Apple Pay merchant id. Also needed by lib/checkout.ts when it re-initialises
// the SDK for a business whose key differs from the one mounted here.
export const STRIPE_MERCHANT_IDENTIFIER = 'merchant.com.theluxmirror.booking';

// @stripe/stripe-react-native is NATIVE-ONLY: importing it eagerly evaluates a
// TurboModule (getEnforcing) that throws if the native binary lacks it (Expo Go,
// or a dev client built before the module was added). A static `import` would
// then crash the whole app at boot (every route is eagerly loaded). So we
// lazy-require behind try/catch and pass children through when it's unavailable.
let StripeProvider: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  StripeProvider = require('@stripe/stripe-react-native').StripeProvider;
} catch {
  StripeProvider = null;
}

export function PaymentsProvider({ children }: { children: ReactNode }) {
  // Subscribes to the store and fetches `stripe-config` once signed in.
  const { publishableKey } = useStripeConfig();
  if (!StripeProvider) return <>{children}</>;
  // StripeProvider is a bare fragment with an effect keyed on publishableKey:
  // it re-initialises the native SDK whenever the key changes and does nothing
  // while the key is empty. So it stays mounted with '' until the server
  // answers — swapping it in later (or keying it on the key) would remount the
  // whole navigator underneath and reset navigation mid-session.
  return (
    <StripeProvider
      publishableKey={publishableKey ?? ''}
      merchantIdentifier={STRIPE_MERCHANT_IDENTIFIER}
    >
      <>{children}</>
    </StripeProvider>
  );
}

// True only when the native Stripe module is actually present in this binary.
// Screens can use this to show a "rebuild the app" message instead of failing.
export const stripeNativeAvailable = StripeProvider != null;

// True only when Stripe is fully usable RIGHT NOW: native module present AND a
// publishable key is resolved (server, or the env fallback before the server
// answers), so PaymentConfiguration has been initialised. Guard checkout on
// this — without a key the native Payment Sheet hard-crashes
// ("PaymentConfiguration was not initialized"). A function, not a constant,
// because the key arrives at runtime.
export function isStripeConfigured(): boolean {
  return StripeProvider != null && !!getStripeConfig().publishableKey;
}
