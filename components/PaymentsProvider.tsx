import { ReactNode } from 'react';
import { StripeProvider } from '@stripe/stripe-react-native';

// Initializes the Stripe SDK for the booking Payment Sheet (deposits).
//
// "Wired but dark" until EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is set: with no key
// we render children directly so the app runs identically and never initializes
// the native Stripe bridge for nothing. Mirrors the Sentry pattern in
// app/_layout.tsx. Set the publishable key in .env to light it up.
//
// merchantIdentifier (Apple Pay) and urlScheme (3DS / redirect return) are added
// alongside the deposit feature, where that flow is actually exercised.
const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;

export function PaymentsProvider({ children }: { children: ReactNode }) {
  if (!publishableKey) return <>{children}</>;
  // StripeProvider types children as ReactElement, so wrap in a fragment.
  return (
    <StripeProvider publishableKey={publishableKey}>
      <>{children}</>
    </StripeProvider>
  );
}
