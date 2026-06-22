import { ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Card, Text, useTheme } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';

type Section = { heading: string; body: string };
type LegalDoc = { title: string; updated: string; sections: Section[] };

const SUPPORT = 'support@theluxmirror.com';

// Placeholder legal copy. These are scaffolds with reasonable structure so the
// links + screens exist for the store submission; the prose MUST be replaced
// with counsel-reviewed copy before launch. Kept in-app (rather than a webview)
// so it works offline and in Expo Go; a hosted theluxmirror.com/{privacy,terms}
// can mirror these later for the store's required public URL.
const DOCS: Record<string, LegalDoc> = {
  privacy: {
    title: 'Privacy Policy',
    updated: 'Last updated: [DATE]',
    sections: [
      {
        heading: 'Introduction',
        body: 'This Privacy Policy explains how LUX Mirror ("we", "us") collects, uses, and protects information when you use the LUX Mirror app and services.',
      },
      {
        heading: 'Information we collect',
        body: 'Account details (name, email), the businesses and team memberships you belong to, appointment and client records you create, device and usage data, and payment information processed by our payment provider (Stripe). Photos captured by a paired mirror are stored to your account.',
      },
      {
        heading: 'How we use information',
        body: 'To provide and secure the service, operate your fleet of mirrors, process bookings and payments, send transactional email and notifications, and improve the product.',
      },
      {
        heading: 'Sharing',
        body: 'We share data with processors that run the service (e.g. Supabase for hosting/auth, Stripe for billing, our email provider) and only as needed to deliver it. We do not sell personal information.',
      },
      {
        heading: 'Your choices',
        body: 'You can edit your profile, change your password, and request deletion of your account and associated data by contacting us.',
      },
      {
        heading: 'Contact',
        body: `Questions about this policy: ${SUPPORT}.`,
      },
    ],
  },
  terms: {
    title: 'Terms of Service',
    updated: 'Last updated: [DATE]',
    sections: [
      {
        heading: 'Acceptance',
        body: 'By creating an account or using the LUX Mirror app you agree to these Terms of Service.',
      },
      {
        heading: 'Your account',
        body: 'You are responsible for the activity under your account and for keeping your credentials secure. You must provide accurate information and be authorized to act for any business you manage.',
      },
      {
        heading: 'Acceptable use',
        body: 'Do not misuse the service, attempt to access data you are not authorized to, or use it to violate any law or the rights of others.',
      },
      {
        heading: 'Subscriptions & billing',
        body: 'Paid plans are billed through our payment provider on the terms shown at checkout. Fees are non-refundable except where required by law. You can manage or cancel your subscription in the app.',
      },
      {
        heading: 'Disclaimers & liability',
        body: 'The service is provided "as is" without warranties. To the extent permitted by law, our liability is limited as described in the final, counsel-reviewed terms.',
      },
      {
        heading: 'Contact',
        body: `Questions about these terms: ${SUPPORT}.`,
      },
    ],
  },
  'business-terms': {
    title: 'Business Terms',
    updated: 'Last updated: [DATE]',
    sections: [
      {
        heading: 'Scope',
        body: 'These Business Terms apply to salon owners and their team members who operate a business, manage mirrors, staff, clients, and bookings through LUX Mirror. They supplement the Terms of Service.',
      },
      {
        heading: 'Your responsibilities',
        body: 'You are responsible for the accuracy of your business, team, client, and appointment records, for obtaining any consent required to store client information and photos, and for complying with laws that apply to your business.',
      },
      {
        heading: 'Team access & roles',
        body: 'Owners and managers control who can access the business and at what role. You are responsible for promptly removing access when a team member leaves.',
      },
      {
        heading: 'Client data & photos',
        body: 'Client records and mirror-captured photos are processed on your behalf. You are the controller of that data; we act as a processor. You must have a lawful basis and any required consent to collect and store it.',
      },
      {
        heading: 'Billing',
        body: 'Subscription plans, device limits, and fees are as shown in the app at the time of purchase and billed through our payment provider.',
      },
      {
        heading: 'Contact',
        body: `Questions about these business terms: ${SUPPORT}.`,
      },
    ],
  },
};

function LegalScreen() {
  const theme = useTheme();
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const content = doc ? DOCS[doc] : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={content?.title ?? 'Legal'} />
      </Appbar.Header>

      {!content ? (
        <View style={styles.center}>
          <Text variant="bodyMedium">Document not found.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Card mode="contained" style={styles.notice}>
            <Card.Content>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Placeholder copy — to be replaced with final, counsel-reviewed text
                before store submission.
              </Text>
            </Card.Content>
          </Card>

          <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            {content.updated}
          </Text>

          {content.sections.map((s) => (
            <View key={s.heading} style={styles.section}>
              <Text variant="titleMedium" style={{ fontWeight: '700', marginBottom: 4 }}>
                {s.heading}
              </Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, lineHeight: 20 }}>
                {s.body}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  notice: { marginBottom: 16 },
  section: { marginTop: 16 },
});

export default withScreenErrorBoundary(LegalScreen);
