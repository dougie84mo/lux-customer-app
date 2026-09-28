import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider } from 'react-native-paper';
import { en, es, registerTranslation } from 'react-native-paper-dates';
import { QueryClientProvider } from '@tanstack/react-query';
import * as Sentry from '@sentry/react-native';
import 'react-native-reanimated';

// Initialises i18next (and the date-picker translations) before any screen
// renders — keep it the first app import.
import '@/lib/i18n';
import { StripeModeBadge } from '@/components/StripeModeBadge';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { PaymentsProvider } from '@/lib/stripe';
import { AuthProvider } from '@/lib/auth';
import { BusinessProvider } from '@/lib/currentBusiness';
import { useErrorReporter } from '@/lib/errorLog';
import { LocaleSync } from '@/lib/localeSync';
import { queryClient } from '@/lib/queryClient';
import { lightTheme, darkTheme } from '@/lib/theme';

// Crash + error reporting. No-op until EXPO_PUBLIC_SENTRY_DSN is set, so the
// app runs identically with Sentry "wired but dark." Set the DSN (and, for
// build-time source-map upload, SENTRY_ORG / SENTRY_PROJECT / SENTRY_AUTH_TOKEN
// in the EAS build env) to light it up. See docs/native-development.md.
const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    // Full transaction sampling in dev for easy verification; trim in prod.
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,
    // Sentry's screenshot/feedback widgets are off by default — enable later.
  });
}

// react-native-paper-dates needs every app language registered before a
// picker mounts (kept out of lib/i18n so Jest never loads the picker).
registerTranslation('en', en);
registerTranslation('es', es);

// Installs the global JS-error handler and keeps the error-reporter's
// user/business/route context in sync. Renders nothing; must live inside
// AuthProvider + BusinessProvider so it can read the session and active tenant.
function ErrorReporterMount() {
  useErrorReporter();
  return null;
}

function RootLayout() {
  const colorScheme = useColorScheme();
  const paperTheme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BusinessProvider>
          <ErrorReporterMount />
          <LocaleSync />
          <PaperProvider theme={paperTheme}>
            <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
              <PaymentsProvider>
                <Stack screenOptions={{ headerShown: false }} />
                <StatusBar style="auto" />
                <StripeModeBadge />
              </PaymentsProvider>
            </ThemeProvider>
          </PaperProvider>
        </BusinessProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

// Sentry.wrap enables native crash + error-boundary capture for the whole tree.
// Harmless when no DSN is configured.
export default Sentry.wrap(RootLayout);
