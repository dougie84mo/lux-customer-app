import { ReactNode } from 'react';

// Platform publishable key. With separate charges & transfers the PaymentIntent
// lives on the PLATFORM account, so the platform key is correct (the same one
// the business app uses). Ships to the client by design (EXPO_PUBLIC_*).
const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;

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
  if (!StripeProvider || !publishableKey) return <>{children}</>;
  return (
    <StripeProvider
      publishableKey={publishableKey}
      merchantIdentifier="merchant.com.theluxmirror.booking"
    >
      <>{children}</>
    </StripeProvider>
  );
}

// True only when the native Stripe module is actually present in this binary.
// Screens can use this to show a "rebuild the app" message instead of failing.
export const stripeNativeAvailable = StripeProvider != null;

// True only when Stripe is fully usable: native module present AND a publishable
// key is configured (so StripeProvider actually mounted and PaymentConfiguration
// was initialized). Guard checkout on this — without the key the native Payment
// Sheet hard-crashes ("PaymentConfiguration was not initialized").
export const stripeConfigured = StripeProvider != null && !!publishableKey;
