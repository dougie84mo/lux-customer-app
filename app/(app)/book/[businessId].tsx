import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Avatar,
  Button,
  Card,
  Checkbox,
  Chip,
  Icon,
  Menu,
  Snackbar,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { format } from 'date-fns';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { SlotPicker } from '@/components/SlotPicker';
import { avatarUrl, initialsOf } from '@/lib/avatars';
import {
  BookingPolicy,
  depositAmountCents,
  depositAppliesAtBooking,
  useBusinessBookingInfo,
  useRequestBooking,
} from '@/lib/booking';
import { useBusinessPublic } from '@/lib/businessDetail';
import {
  ANY_PROVIDER_ID,
  useBookableProviders,
  useBookableProvidersForService,
} from '@/lib/schedules';

// Whether a policy has anything worth showing the client.
function hasPolicy(p: BookingPolicy): boolean {
  return (
    !!p.cancellation_window_hours ||
    p.no_show_fee > 0 ||
    p.late_cancel_fee > 0 ||
    !!p.cancellation_policy
  );
}

// Each part of the booking is its own step so the flow can later be reordered /
// customized per business (e.g. provider-first). The status strip at the top
// lets the client jump back to any completed step to change an earlier choice;
// forward jumps are gated on the in-between steps being complete.
const STEPS = ['Service', 'Provider', 'Time', 'Confirm'] as const;

function BookScreen() {
  const theme = useTheme();
  const { businessId, name, serviceId: initialServiceId } = useLocalSearchParams<{
    businessId: string;
    name?: string;
    serviceId?: string;
  }>();
  const { data: info, isLoading, error } = useBusinessBookingInfo(businessId);
  const { data: pub } = useBusinessPublic(businessId);
  const bizName = name ?? pub?.name; // params on deep-tap; RPC on a cold deep link
  const requestBooking = useRequestBooking();

  const [step, setStep] = useState(0); // 0 Service · 1 Provider · 2 Time · 3 Confirm
  const [locationId, setLocationId] = useState<string | null>(null);
  // May be preselected when arriving from the business profile's service menu.
  const [serviceId, setServiceId] = useState<string | null>(initialServiceId ?? null);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [locationMenu, setLocationMenu] = useState(false);
  const [when, setWhen] = useState<Date | null>(null);
  const [notes, setNotes] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // A preselected serviceId (from "book again") may name a service that's since
  // been removed/deactivated. Once the catalog loads, drop a stale id so the user
  // just picks fresh instead of getting stuck on a phantom (invisible) selection.
  useEffect(() => {
    const svc = info?.services;
    if (serviceId && svc && svc.length > 0 && !svc.some((s) => s.id === serviceId)) {
      setServiceId(null);
    }
  }, [serviceId, info]);

  // Provider list narrows to those who can do the chosen service (capabilities,
  // migration 0037); before a service is picked, show all bookable providers.
  const allProviders = useBookableProviders(businessId);
  const serviceProviders = useBookableProvidersForService(businessId, serviceId ?? undefined);
  const providers = (serviceId ? serviceProviders.data : allProviders.data) ?? [];

  // Auto-select the only location when there's just one. We keep location quiet
  // in the flow — most clients are booking the exact shop they tapped into.
  const locations = info?.locations ?? [];
  const services = info?.services ?? [];
  const effectiveLocationId = locationId ?? (locations.length === 1 ? locations[0].id : null);
  const selectedLocation = locations.find((l) => l.id === effectiveLocationId);
  const selectedService = services.find((s) => s.id === serviceId);
  // Require an explicit acknowledgement only when the shop has a real policy.
  const needsAck = !!info?.policy && hasPolicy(info.policy);
  const anyProvider = providerId === ANY_PROVIDER_ID;
  const selectedProvider = providers.find((p) => p.id === providerId);
  // Deposit at booking (only when the policy is timed to the request). The
  // amount shown is derived from the policy; the server re-derives the real
  // charge. Inert until business_booking_policy_public exposes the deposit cols.
  const depositApplies = depositAppliesAtBooking(info?.policy);
  const depositRequired = info?.policy?.deposit_required ?? false;
  const depositCents = depositAmountCents(info?.policy, selectedService?.price);

  // Per-step completion drives both the Next button and which status tabs are
  // reachable. Index matches STEPS: Service / Provider / Time / Confirm.
  const stepComplete = useMemo(
    () => [
      !!effectiveLocationId && !!serviceId,
      !!providerId,
      !!when,
      !needsAck || acknowledged,
    ],
    [effectiveLocationId, serviceId, providerId, when, needsAck, acknowledged],
  );
  const canContinue = stepComplete[step];
  // Backward is always allowed; forward only when every in-between step is done.
  const canGoToStep = (target: number) =>
    target <= step || stepComplete.slice(0, target).every(Boolean);
  const goToStep = (target: number) => {
    if (!canGoToStep(target)) return;
    setValidationError(null);
    setStep(target);
  };

  // Provider photo (or initials) at a given size — leading element of a row.
  const providerAvatar = (avatar_path?: string | null, who?: string, size = 40) => {
    const uri = avatarUrl(avatar_path);
    return uri ? (
      <Avatar.Image size={size} source={{ uri }} />
    ) : (
      <Avatar.Text size={size} label={initialsOf(who)} />
    );
  };

  const onSubmit = async () => {
    setValidationError(null);
    if (!businessId) return;
    if (!effectiveLocationId) return setValidationError('Choose a location.');
    if (!serviceId) return setValidationError('Choose a service.');
    if (!providerId) return setValidationError('Choose a provider.');
    if (!when) return setValidationError('Pick an available time.');
    if (needsAck && !acknowledged) {
      return setValidationError('Please acknowledge the cancellation policy to continue.');
    }
    try {
      const requestId = await requestBooking.mutateAsync({
        businessId,
        locationId: effectiveLocationId,
        serviceId,
        requestedStart: when.toISOString(),
        notes: notes || undefined,
        // "Any available" → no preferred provider; staff assigns at confirm.
        employeeId: anyProvider ? undefined : providerId,
      });
      // A deposit (timed to the request) → take it now against the new request.
      if (depositApplies && requestId) {
        router.replace({
          pathname: '/(app)/pay/deposit/[requestId]',
          params: {
            requestId,
            businessId,
            businessName: bizName ?? '',
            serviceName: selectedService?.name ?? '',
            ...(depositCents != null ? { amountCents: String(depositCents) } : {}),
            required: depositRequired ? '1' : '0',
          },
        });
      } else {
        router.replace('/(app)/my-bookings');
      }
    } catch (err: any) {
      setFeedback(err?.message ?? 'Could not send your request');
    }
  };

  const goNext = () => {
    setValidationError(null);
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else onSubmit();
  };
  const goBack = () => {
    setValidationError(null);
    if (step > 0) setStep((s) => s - 1);
    else router.back();
  };

  // -- Selectable choice card (service / provider rows) ----------------------
  const ChoiceCard = ({
    selected,
    onPress,
    leading,
    title,
    subtitle,
  }: {
    selected: boolean;
    onPress: () => void;
    leading?: React.ReactNode;
    title: string;
    subtitle?: string;
  }) => (
    <Card
      mode={selected ? 'contained' : 'outlined'}
      onPress={onPress}
      style={[styles.choice, selected && { borderColor: theme.colors.primary, borderWidth: 1.5 }]}
    >
      <Card.Content style={styles.choiceRow}>
        {leading ? <View style={styles.choiceLeading}>{leading}</View> : null}
        <View style={{ flex: 1 }}>
          <Text variant="titleSmall" style={{ fontWeight: '600' }}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <Icon
          source={selected ? 'check-circle' : 'circle-outline'}
          size={22}
          color={selected ? theme.colors.primary : theme.colors.onSurfaceVariant}
        />
      </Card.Content>
    </Card>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={goBack} />
        <Appbar.Content title={bizName ? `Book · ${bizName}` : 'Book appointment'} />
      </Appbar.Header>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text variant="bodyMedium" style={{ color: theme.colors.error }}>
            {error.message}
          </Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Status tabs — jump to any reachable step to change an earlier choice. */}
          <View style={styles.tabs}>
            {STEPS.map((label, i) => {
              const active = i === step;
              const complete = stepComplete[i] && !active;
              const reachable = canGoToStep(i);
              return (
                <Chip
                  key={label}
                  compact
                  icon={complete ? 'check' : undefined}
                  selected={active}
                  showSelectedCheck={false}
                  disabled={!reachable}
                  onPress={() => goToStep(i)}
                  style={[styles.tab, active && { backgroundColor: theme.colors.primaryContainer }]}
                  textStyle={styles.tabText}
                >
                  {`${i + 1}. ${label}`}
                </Chip>
              );
            })}
          </View>

          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            {/* -------------------------------------------------- STEP 1 */}
            {step === 0 ? (
              <>
                {/* Location stays quiet: only surfaced when there's a choice. */}
                {locations.length > 1 ? (
                  <View style={styles.locRow}>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      Location
                    </Text>
                    <Menu
                      visible={locationMenu}
                      onDismiss={() => setLocationMenu(false)}
                      anchor={
                        <Button
                          compact
                          mode="text"
                          icon="map-marker"
                          onPress={() => setLocationMenu(true)}
                        >
                          {selectedLocation?.name ?? 'Select location'}
                        </Button>
                      }
                    >
                      {locations.map((l) => (
                        <Menu.Item
                          key={l.id}
                          title={l.name}
                          onPress={() => {
                            setLocationId(l.id);
                            setLocationMenu(false);
                          }}
                        />
                      ))}
                    </Menu>
                  </View>
                ) : null}

                <Text variant="titleMedium" style={styles.stepTitle}>
                  What can we do for you?
                </Text>
                {services.map((s) => (
                  <ChoiceCard
                    key={s.id}
                    selected={s.id === serviceId}
                    title={s.name}
                    subtitle={`$${s.price.toFixed(0)} · ${s.duration} min${
                      s.description ? ` — ${s.description}` : ''
                    }`}
                    onPress={() => {
                      setServiceId(s.id);
                      // Capable providers + availability change with the service.
                      setProviderId(null);
                      setWhen(null);
                    }}
                  />
                ))}

              </>
            ) : null}

            {/* -------------------------------------------------- STEP 2 · Provider */}
            {step === 1 ? (
              <>
                <Text variant="titleMedium" style={styles.stepTitle}>
                  With whom?
                </Text>
                {selectedService ? (
                  <Text
                    variant="bodySmall"
                    style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}
                  >
                    For {selectedService.name}
                  </Text>
                ) : null}
                {providers.length === 0 ? (
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    No providers available for this service.
                  </Text>
                ) : (
                  <>
                    <ChoiceCard
                      selected={anyProvider}
                      title="Any available"
                      subtitle="First open slot with any provider"
                      leading={<Avatar.Icon size={40} icon="account-multiple" />}
                      onPress={() => {
                        setProviderId(ANY_PROVIDER_ID);
                        setWhen(null);
                      }}
                    />
                    {providers.map((p) => (
                      <ChoiceCard
                        key={p.id}
                        selected={p.id === providerId}
                        title={p.name}
                        leading={providerAvatar(p.avatar_path, p.name)}
                        onPress={() => {
                          setProviderId(p.id);
                          setWhen(null);
                        }}
                      />
                    ))}
                  </>
                )}
              </>
            ) : null}

            {/* -------------------------------------------------- STEP 3 · Time */}
            {step === 2 ? (
              <>
                <Text variant="titleMedium" style={styles.stepTitle}>
                  Pick a date &amp; time
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
                  {selectedService?.name}
                  {anyProvider ? ' · any provider' : selectedProvider ? ` · ${selectedProvider.name}` : ''}
                </Text>
                <SlotPicker
                  businessId={businessId}
                  employeeId={anyProvider ? null : providerId}
                  anyProvider={anyProvider}
                  durationMinutes={selectedService?.duration}
                  serviceId={serviceId ?? undefined}
                  value={when}
                  onChange={setWhen}
                  minDate={new Date()}
                />
              </>
            ) : null}

            {/* -------------------------------------------------- STEP 4 · Confirm */}
            {step === 3 ? (
              <>
                <Text variant="titleMedium" style={styles.stepTitle}>
                  Review &amp; confirm
                </Text>

                <Card mode="outlined" style={styles.review}>
                  <Card.Content>
                    <SummaryRow label="Service" value={selectedService?.name ?? '—'} />
                    {selectedService ? (
                      <SummaryRow
                        label="Price"
                        value={`$${selectedService.price.toFixed(0)} · ${selectedService.duration} min`}
                      />
                    ) : null}
                    <SummaryRow
                      label="Provider"
                      value={anyProvider ? 'Any available' : selectedProvider?.name ?? '—'}
                    />
                    {selectedLocation ? (
                      <SummaryRow label="Location" value={selectedLocation.name} />
                    ) : null}
                    <SummaryRow
                      label="When"
                      value={when ? format(when, 'EEE MMM d, yyyy · h:mm a') : '—'}
                    />
                  </Card.Content>
                </Card>

                {/* Notes live on the final page now. */}
                <TextInput
                  label="Notes (optional)"
                  mode="outlined"
                  multiline
                  numberOfLines={3}
                  value={notes}
                  onChangeText={setNotes}
                  style={{ marginTop: 16 }}
                  placeholder="Anything the salon should know"
                />

                <Card style={styles.review} mode="contained">
                  <Card.Content>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      You&apos;re requesting an appointment. The business confirms a final time —
                      you&apos;ll see the status under Bookings.
                    </Text>
                  </Card.Content>
                </Card>

                {depositApplies ? (
                  <Card style={styles.review} mode="outlined">
                    <Card.Content>
                      <View style={styles.policyHead}>
                        <Icon source="cash-lock" size={16} color={theme.colors.primary} />
                        <Text variant="labelLarge">
                          {depositRequired ? 'Deposit required' : 'Deposit'}
                        </Text>
                      </View>
                      <Text variant="bodySmall" style={styles.policyLine}>
                        {depositRequired
                          ? 'This business requires a deposit to book'
                          : 'You can secure your spot with a deposit'}
                        {depositCents != null ? ` — $${(depositCents / 100).toFixed(2)}` : ''}. After
                        you send the request you&apos;ll be able to pay it; it comes off your balance
                        at checkout.
                      </Text>
                    </Card.Content>
                  </Card>
                ) : null}

                {info?.policy && hasPolicy(info.policy) ? (
                  <Card style={styles.review} mode="outlined">
                    <Card.Content>
                      <View style={styles.policyHead}>
                        <Icon source="information-outline" size={16} color={theme.colors.primary} />
                        <Text variant="labelLarge">Cancellation policy</Text>
                      </View>
                      {info.policy.cancellation_window_hours ? (
                        <Text variant="bodySmall" style={styles.policyLine}>
                          Cancel or reschedule at least {info.policy.cancellation_window_hours} hours
                          before your appointment.
                        </Text>
                      ) : null}
                      {info.policy.no_show_fee > 0 ? (
                        <Text variant="bodySmall" style={styles.policyLine}>
                          No-show fee: ${info.policy.no_show_fee.toFixed(0)}
                        </Text>
                      ) : null}
                      {info.policy.late_cancel_fee > 0 ? (
                        <Text variant="bodySmall" style={styles.policyLine}>
                          Late-cancellation fee: ${info.policy.late_cancel_fee.toFixed(0)}
                        </Text>
                      ) : null}
                      {info.policy.cancellation_policy ? (
                        <Text variant="bodySmall" style={styles.policyLine}>
                          {info.policy.cancellation_policy}
                        </Text>
                      ) : null}
                      <Checkbox.Item
                        label="I understand the cancellation policy and will arrive on time."
                        status={acknowledged ? 'checked' : 'unchecked'}
                        onPress={() => setAcknowledged((v) => !v)}
                        position="leading"
                        labelVariant="bodySmall"
                        style={styles.ackItem}
                      />
                    </Card.Content>
                  </Card>
                ) : null}
              </>
            ) : null}

            {validationError ? (
              <Text variant="bodySmall" style={{ color: theme.colors.error, marginTop: 12 }}>
                {validationError}
              </Text>
            ) : null}
          </ScrollView>

          {/* Sticky footer nav */}
          <View style={[styles.footer, { borderTopColor: theme.colors.outlineVariant }]}>
            <Button mode="text" onPress={goBack} disabled={requestBooking.isPending}>
              {step === 0 ? 'Cancel' : 'Back'}
            </Button>
            <Button
              mode="contained"
              onPress={goNext}
              disabled={!canContinue || requestBooking.isPending}
              loading={requestBooking.isPending}
            >
              {step === STEPS.length - 1 ? 'Request appointment' : 'Next'}
            </Button>
          </View>
        </KeyboardAvoidingView>
      )}

      <Snackbar visible={!!feedback} onDismiss={() => setFeedback(null)} duration={4000}>
        {feedback ?? ''}
      </Snackbar>
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.summaryRow}>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, width: 84 }}>
        {label}
      </Text>
      <Text variant="bodyMedium" style={{ flex: 1, fontWeight: '500' }}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 2,
  },
  tab: { marginVertical: 2 },
  tabText: { fontSize: 12 },
  scroll: { padding: 16, paddingBottom: 24 },
  stepTitle: { fontWeight: '700', marginBottom: 12 },
  locRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  choice: { marginBottom: 8 },
  choiceRow: { flexDirection: 'row', alignItems: 'center' },
  choiceLeading: { marginRight: 12 },
  review: { marginTop: 16 },
  summaryRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  policyHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  policyLine: { marginTop: 2 },
  ackItem: { paddingHorizontal: 0, marginTop: 8 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
});

export default withScreenErrorBoundary(BookScreen);
