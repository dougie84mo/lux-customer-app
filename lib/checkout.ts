import { useState } from 'react';
import {
  CreatePaymentIntentInput,
  DepositMode,
  StripeIntentResponse,
  useCreateDepositIntent,
  useCreatePaymentIntent,
} from './payments';
import { isStripeConfigured, STRIPE_MERCHANT_IDENTIFIER } from './stripe';
import { getStripeConfig, setStripeConfig, StripeMode, stripeModeFor } from './stripeMode';

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

// The server decides test vs live per business, so the key mounted on
// StripeProvider (the client's own mode) may not be the one this intent was
// created under. Re-initialise the native SDK on the returned key before any
// sheet is presented, and record it so the provider + badge follow. Returns the
// mode the sheet should run in (Google Pay's testEnv tracks it).
export async function syncStripeToIntent(envelope: StripeIntentResponse): Promise<StripeMode> {
  const current = getStripeConfig();
  const key = envelope.publishable_key || null;
  if (stripeModule && key && key !== current.publishableKey) {
    await stripeModule.initStripe({
      publishableKey: key,
      merchantIdentifier: STRIPE_MERCHANT_IDENTIFIER,
    });
    setStripeConfig({ mode: envelope.stripe_mode ?? stripeModeFor(key), publishableKey: key });
  }
  return envelope.stripe_mode ?? getStripeConfig().mode;
}

type IntentResponse = StripeIntentResponse & { client_secret: string; sale_id: string };

// Shared native Payment Sheet driver: given a function that creates a
// PaymentIntent (server call returning a client_secret + sale_id + the mode it
// was created in), present the sheet. Both the appointment-balance and deposit
// flows use this; the caller still polls the sale (waitForSaleResolved) before
// showing "paid".
function useStripeSheet() {
  // useStripe only exists when the native module is present. stripeModule is a
  // module-level constant, so this branch is stable across renders.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const stripe = stripeModule ? stripeModule.useStripe() : null;
  const [processing, setProcessing] = useState(false);

  async function present(
    getSecret: () => Promise<IntentResponse>,
    merchantName?: string,
  ): Promise<CheckoutResult> {
    if (!stripe) {
      return {
        status: 'failed',
        error: 'Payments need the latest app build — rebuild/reinstall the dev client.',
      };
    }
    const { initPaymentSheet, presentPaymentSheet } = stripe;
    setProcessing(true);
    try {
      const response = await getSecret();
      const { client_secret, sale_id } = response;

      // Point the SDK at the key this intent was created under (the server
      // resolves test/live per business — lib/stripeMode.ts).
      const mode = await syncStripeToIntent(response);
      if (!isStripeConfigured()) {
        // No publishable key resolved at all → PaymentConfiguration was never
        // initialised → the native Payment Sheet would hard-crash. Fail
        // gracefully instead.
        return {
          status: 'failed',
          saleId: sale_id,
          error:
            `Stripe is not configured for ${mode} mode — the server did not return a ` +
            `publishable key. Check the platform Stripe settings for this account.`,
        };
      }

      // Card + wallets. testEnv tracks the server-resolved mode so Google Pay
      // points at the right environment automatically. Apple Pay uses the
      // merchantIdentifier configured on StripeProvider (iOS).
      const init = await initPaymentSheet({
        paymentIntentClientSecret: client_secret,
        merchantDisplayName: merchantName ?? 'LUX Booking',
        applePay: { merchantCountryCode: 'US' },
        googlePay: { merchantCountryCode: 'US', currencyCode: 'USD', testEnv: mode === 'test' },
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

  return { present, processing, nativeAvailable: stripeModule != null };
}

// Pay for an appointment (full service price + optional tip).
export function useAppointmentCheckout() {
  const sheet = useStripeSheet();
  const createIntent = useCreatePaymentIntent();
  function runCheckout(
    input: CreatePaymentIntentInput & { merchantName?: string },
  ): Promise<CheckoutResult> {
    return sheet.present(() => createIntent.mutateAsync(input), input.merchantName);
  }
  return { runCheckout, processing: sheet.processing, nativeAvailable: sheet.nativeAvailable };
}

// Pay a deposit (or full prepay) against a booking request, before any
// appointment exists. The server derives the amount from the deposit policy.
export function useDepositCheckout() {
  const sheet = useStripeSheet();
  const createDeposit = useCreateDepositIntent();
  function runDepositCheckout(input: {
    businessId: string;
    bookingRequestId: string;
    mode: DepositMode;
    merchantName?: string;
  }): Promise<CheckoutResult> {
    return sheet.present(
      () =>
        createDeposit.mutateAsync({
          businessId: input.businessId,
          bookingRequestId: input.bookingRequestId,
          mode: input.mode,
        }),
      input.merchantName,
    );
  }
  return { runDepositCheckout, processing: sheet.processing, nativeAvailable: sheet.nativeAvailable };
}
