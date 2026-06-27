import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider } from 'react-native-paper';
import { en, registerTranslation } from 'react-native-paper-dates';
import { QueryClientProvider } from '@tanstack/react-query';
import * as Sentry from '@sentry/react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { PaymentsProvider } from '@/lib/stripe';
import { AuthProvider } from '@/lib/auth';
import { BusinessProvider } from '@/lib/currentBusiness';
import { useErrorReporter } from '@/lib/errorLog';
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

// react-native-paper-dates requires a translation to be registered before
// any picker can mount. Done once at module load — adding more locales
// here is the only change needed for i18n later.
registerTranslation('en', en);

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
          <PaperProvider theme={paperTheme}>
            <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
              <PaymentsProvider>
                <Stack screenOptions={{ headerShown: false }} />
                <StatusBar style="auto" />
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
