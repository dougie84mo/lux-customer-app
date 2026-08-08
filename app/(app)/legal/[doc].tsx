import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Button, Card, Text, useTheme } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';

type Section = { heading: string; body: string };
type LegalDoc = {
  title: string;
  updated: string;
  /** Canonical full text on the marketing site, or null where none exists. */
  url: string | null;
  sections: Section[];
};

const SUPPORT = 'support@theluxmirror.com';
const PRIVACY_EMAIL = 'privacy@theluxmirror.com';
const SITE = 'https://theluxmirror.com';

/*
 * Condensed versions of the policies published at theluxmirror.com/privacy and
 * /terms. Those pages are canonical — the store listings point at them and they
 * are what a reviewer reads. These screens exist so the same terms are readable
 * offline and inside Expo Go, and every one links out to its full text.
 *
 * Keep them in step. A summary that contradicts the canonical page is worse
 * than no summary, so when web/marketing/src/app/{privacy,terms}/page.tsx
 * changes, change the matching section here and bump UPDATED.
 */
const UPDATED = 'Last updated: August 8, 2026';

const DOCS: Record<string, LegalDoc> = {
  privacy: {
    title: 'Privacy Policy',
    updated: UPDATED,
    url: `${SITE}/privacy`,
    sections: [
      {
        heading: 'Who we are',
        body: 'LUX Mirror is a product of Lux Mirror LLC, 96 Commerce Drive PMB 200, Wyomissing, PA 19610.',
      },
      {
        heading: 'Our two roles',
        body: 'We control the information in your own account — your name, email, business, and billing. The client records, appointments, and photos your shop keeps belong to your shop; we process those on its instructions and never for our own purposes.',
      },
      {
        heading: 'What we collect',
        body: 'Name, email, phone, and a hashed password (or your name, email, and picture if you sign in with Google). Your business, locations, services, team, clients, and appointments. Card details go straight to Stripe and never touch our servers — we keep only the brand, last four digits, and the Stripe identifiers needed to bill you. Plus app diagnostics and crash reports.',
      },
      {
        heading: 'The mirror’s camera',
        body: 'The live camera feed is processed on the mirror itself and is never streamed to us. It is not recorded, not uploaded, and not retained. An image leaves the mirror only when someone deliberately takes a photo, and that photo goes to your business’s private library. We do not run facial recognition and we do not build biometric identifiers.',
      },
      {
        heading: 'Location',
        body: 'Only if you ask for it. Searching for shops near you uses your device’s approximate location, with your permission, to sort results. We do not build a location history.',
      },
      {
        heading: 'Who we share it with',
        body: 'Only the providers that run the service: Supabase (database, auth, storage), Stripe (payments), Resend (email), Sentry (crash diagnostics), Firebase (push), and Google Maps. We have never sold personal information and we do not share it for advertising.',
      },
      {
        heading: 'Your rights',
        body: `Ask us for a copy of your data, a correction, an export, or deletion of your account — email ${PRIVACY_EMAIL} from the address on the account and we respond within 30 days. Deleted accounts are removed within 30 days, except records we must keep for tax or security.`,
      },
      {
        heading: 'Contact',
        body: `Privacy questions: ${PRIVACY_EMAIL}. Everything else: ${SUPPORT}.`,
      },
    ],
  },
  terms: {
    title: 'Terms of Service',
    updated: UPDATED,
    url: `${SITE}/terms`,
    sections: [
      {
        heading: 'The agreement',
        body: 'These terms are between you and Lux Mirror LLC, a Pennsylvania limited liability company. Creating an account or using the app means you accept them. You must be 18 and, if you are signing up for a business, authorised to bind it.',
      },
      {
        heading: 'Your account',
        body: 'Keep your credentials secure. You are responsible for everything done under your account, including by team members you invite, and for removing access when someone leaves.',
      },
      {
        heading: 'Subscriptions and billing',
        body: 'Plans renew automatically at the end of each billing period until cancelled. Cancel any time in the app; you keep access through the period you have already paid for. Fees exclude tax and are non-refundable except where the law requires otherwise. We give at least 30 days’ notice before a price change applies to your renewal.',
      },
      {
        heading: 'Mirrors, reservations, and deposits',
        body: 'A reservation is free and is not a purchase. The $199 deposit is optional, moves you up the production queue, and is credited against your mirror at dispatch — ask before dispatch and we refund it. Published ship dates are estimates, not guarantees.',
      },
      {
        heading: 'Trial and warranty',
        body: 'Every mirror carries a 30-day trial from delivery and a one-year warranty against defects in materials and workmanship. The warranty does not cover accident, misuse, or damage from installation or power problems at your premises.',
      },
      {
        heading: 'Acceptable use',
        body: 'Do not access data belonging to another business, probe our security without permission, reverse-engineer mirror firmware, or photograph anyone without their knowledge and consent.',
      },
      {
        heading: 'Your content and ours',
        body: 'Your business details, client records, and photos stay yours; you grant us only the licence needed to run the service for you, and we do not use them to train AI models. The LUX software, firmware, hardware design, and brand stay ours.',
      },
      {
        heading: 'Disclaimers and liability',
        body: 'Apart from the hardware warranty and rights you have under consumer law, the service is provided “as is”. Our total liability is capped at what you paid us in the 12 months before a claim, or one hundred dollars, whichever is greater. Style previews are illustrative, not a promise of a result at the chair.',
      },
      {
        heading: 'Governing law',
        body: `Pennsylvania law governs, with venue in Berks County. Email ${SUPPORT} first and give us 30 days — most problems are a support ticket, not a lawsuit.`,
      },
    ],
  },
  'business-terms': {
    title: 'Business Terms',
    updated: UPDATED,
    // No separate web page; the salon-specific obligations live inside /terms.
    url: `${SITE}/terms#salon-obligations`,
    sections: [
      {
        heading: 'Scope',
        body: 'These terms apply to salon owners and their team members who run a business, mirrors, staff, clients, and bookings through LUX Mirror. They supplement the Terms of Service.',
      },
      {
        heading: 'You control your client data',
        body: 'Client records, notes, appointment history, and photos taken at the chair are yours. You are the controller of that information and we process it on your behalf.',
      },
      {
        heading: 'Consent is your responsibility',
        body: 'You must have a lawful basis, and any consent required, to collect and keep client information — including photographs of a client, and any photograph of a minor. You must also tell your clients how you use their information and honour their requests about it.',
      },
      {
        heading: 'Team access and roles',
        body: 'Owners and managers control who can reach the business and at what role. Removing a team member who leaves is your responsibility, and we recommend doing it the same day.',
      },
      {
        heading: 'Your own obligations',
        body: 'Licensing, employment, tax, health and safety, and the services you sell your clients remain yours. LUX provides scheduling and record-keeping tools; it is not legal, accounting, or professional advice, and we are not a party to the services you provide.',
      },
      {
        heading: 'Billing',
        body: 'Plans, device limits, and fees are as shown in the app at the time of purchase and billed through Stripe.',
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
          <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            {content.updated}
          </Text>

          <Card mode="contained" style={styles.notice}>
            <Card.Content>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                A summary for reading offline. The full policy on theluxmirror.com
                is the version that governs.
              </Text>
            </Card.Content>
          </Card>

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

          {content.url ? (
            <Button
              mode="outlined"
              icon="open-in-new"
              style={styles.full}
              onPress={() => Linking.openURL(content.url as string)}
            >
              Read the full policy
            </Button>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  notice: { marginTop: 12 },
  section: { marginTop: 16 },
  full: { marginTop: 28 },
});

export default withScreenErrorBoundary(LegalScreen);
