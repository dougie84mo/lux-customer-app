import { useState } from 'react';
import { CreatePaymentIntentInput, useCreatePaymentIntent } from './payments';
import { stripeConfigured } from './stripe';

export type CheckoutResult = {
  status: 'completed' | 'canceled' | 'failed';
  saleId?: string;
  error?: string;
};

// Native-only module. Lazy-require behind try/catch so a binary without it
// (Expo Go, or a dev client built before Stripe was added) doesn't crash the app
// at import time — checkout just reports it needs a rebuild. See lib/stripe.tsx.
let stripeModule: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  stripeModule = require('@stripe/stripe-react-native');
} catch {
  stripeModule = null;
}

// Runs the full client → business checkout: create the PaymentIntent on the
// platform (writes the ledger), then present the native Stripe Payment Sheet.
// The caller still polls the sale (waitForSaleResolved) before showing "paid".
export function useAppointmentCheckout() {
  // useStripe only exists when the native module is present. stripeModule is a
  // module-level constant, so this branch is stable across renders.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const stripe = stripeModule ? stripeModule.useStripe() : null;
  const createIntent = useCreatePaymentIntent();
  const [processing, setProcessing] = useState(false);

  async function runCheckout(
    input: CreatePaymentIntentInput & { merchantName?: string },
  ): Promise<CheckoutResult> {
    if (!stripe) {
      return {
        status: 'failed',
        error: 'Payments need the latest app build — rebuild/reinstall the dev client.',
      };
    }
    if (!stripeConfigured) {
      // No publishable key → StripeProvider never mounted → the native Payment
      // Sheet would hard-crash. Fail gracefully instead.
      return {
        status: 'failed',
        error: 'Stripe publishable key is missing — set EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY and restart.',
      };
    }
    const { initPaymentSheet, presentPaymentSheet } = stripe;
    setProcessing(true);
    try {
      const { client_secret, sale_id } = await createIntent.mutateAsync(input);

      // Card + wallets. testEnv tracks the publishable key (test vs live) so
      // Google Pay points at the right environment automatically. Apple Pay uses
      // the merchantIdentifier configured on StripeProvider (iOS).
      const pk = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
      const init = await initPaymentSheet({
        paymentIntentClientSecret: client_secret,
        merchantDisplayName: input.merchantName ?? 'LUX Booking',
        applePay: { merchantCountryCode: 'US' },
        googlePay: { merchantCountryCode: 'US', currencyCode: 'USD', testEnv: pk.startsWith('pk_test_') },
        // Lets redirect methods (Cash App Pay) return to the app after the hop.
        returnURL: 'luxbooking://stripe-redirect',
      });
      if (init.error) return { status: 'failed', saleId: sale_id, error: init.error.message };

      const present = await presentPaymentSheet();
      if (present.error) {
        const canceled = present.error.code === 'Canceled';
        return {
          status: canceled ? 'canceled' : 'failed',
          saleId: sale_id,
          error: present.error.message,
        };
      }
      return { status: 'completed', saleId: sale_id };
    } catch (e) {
      return { status: 'failed', error: e instanceof Error ? e.message : 'Checkout failed' };
    } finally {
      setProcessing(false);
    }
  }

  return { runCheckout, processing, nativeAvailable: stripeModule != null };
}
