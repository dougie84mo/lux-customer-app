import { StyleSheet, Text, View } from 'react-native';

import { stripeMode, stripeModeMismatch, publishableKey } from '@/lib/stripeMode';

/*
 * Dev-only chip showing which Stripe environment this build is talking to.
 *
 * Payment-mode confusion is expensive and invisible — a test key looks exactly
 * like a live one from inside the app, and you only find out which you used
 * after the money did or didn't move. So the mode is always on screen in dev.
 * Returns null in production builds; it is not a user-facing affordance.
 */
export function StripeModeBadge() {
  if (!__DEV__) return null;

  const state = stripeModeMismatch
    ? { label: `STRIPE ${stripeMode.toUpperCase()} · KEY MISMATCH`, style: styles.bad }
    : !publishableKey
      ? { label: 'STRIPE · NO KEY', style: styles.bad }
      : stripeMode === 'live'
        ? { label: 'STRIPE LIVE · REAL MONEY', style: styles.live }
        : { label: 'STRIPE TEST', style: styles.test };

  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={[styles.chip, state.style]}>
        <Text style={styles.text}>{state.label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 8,
    bottom: 28,
    zIndex: 9999,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    opacity: 0.85,
  },
  text: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  test: { backgroundColor: '#4a4a52' },
  live: { backgroundColor: '#b3261e' },
  bad: { backgroundColor: '#a06400' },
});
