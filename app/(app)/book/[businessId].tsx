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
import { useTranslation } from 'react-i18next';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { useFormat } from '@/lib/format';
import { tMessage } from '@/lib/i18n';
import { SelectableChip } from '@/components/SelectableChip';
import { SlotPicker } from '@/components/SlotPicker';
import { avatarUrl, initialsOf } from '@/lib/avatars';
import {
  BookingPolicy,
  depositAmountCents,
  depositAppliesAtBooking,
  useBusinessBookingInfo,
  useRequestBooking,
} from '@/lib/booking';
import {
  BOOKING_UNAVAILABLE_MESSAGE,
  bookingErrorMessage,
  photoConsentPrompt,
  smsConsentPrompt,
  toE164US,
} from '@/lib/bookingLogic';
import {
  SMS_CONSENT_CHECKBOX_LABEL,
  SMS_CONSENT_CTA,
  SMS_CONSENT_VERSION,
  useMySmsStatus,
  useSetSmsConsent,
} from '@/lib/smsConsent';
import { PHOTO_CONSENT_VERSION, photoConsentSentence, useMyPhotoConsents } from '@/lib/photoConsent';
import { useBusinessBookingEnabled, useBusinessPublic } from '@/lib/businessDetail';
import {
  ANY_PROVIDER_ID,
  useBookableProviders,
  useBookableProvidersForService,
  useServicesForProvider,
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
const STEPS = ['service', 'provider', 'time', 'confirm'] as const;

function BookScreen() {
  const theme = useTheme();
  const { t, i18n } = useTranslation(['booking', 'common', 'inbox', 'photos']);
  // Consent wording is versioned and carrier-reviewed, so it stays English;
  // other languages get a plain-language note above it.
  const consentInEnglishOnly = i18n.language !== 'en';
  const f = useFormat();
  const { businessId, name, serviceId: initialServiceId } = useLocalSearchParams<{
    businessId: string;
    name?: string;
    serviceId?: string;
  }>();
  const { data: info, isLoading, error } = useBusinessBookingInfo(businessId);
  const { data: pub } = useBusinessPublic(businessId);
  // Reachable by deep link even though discovery filters unbookable businesses
  // out (0126). Without this the whole four-step flow runs and only fails at
  // submit, where 0120's trigger returns a message written for salon owners.
  //
  // The flow is blocked only on a definite 'disabled' — an entitlement check
  // that FAILED ('unknown') must not lock a client out of a shop that is
  // probably fine. Instead onSubmit re-asks before it sends, and the submit
  // catch maps the trigger's rejection to client-facing copy either way.
  const bookingCheck = useBusinessBookingEnabled(businessId);
  const entitlement = bookingCheck.entitlement;
  const bizName = name ?? pub?.name; // params on deep-tap; RPC on a cold deep link
  const requestBooking = useRequestBooking();

  const [step, setStep] = useState(0); // 0 Service · 1 Provider · 2 Time · 3 Confirm
  const [locationId, setLocationId] = useState<string | null>(null);
  // May be preselected when arriving from the business profile's service menu.
  const [serviceId, setServiceId] = useState<string | null>(initialServiceId ?? null);
  const [providerId, setProviderId] = useState<string | null>(null);
  // Provider-first filter on the Service step: null = "Any barber" (all services);
  // a provider id narrows the service list to that barber's capabilities.
  const [serviceFilterProvider, setServiceFilterProvider] = useState<string | null>(null);
  const [locationMenu, setLocationMenu] = useState(false);
  const [when, setWhen] = useState<Date | null>(null);
  const [notes, setNotes] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  // Mirror photo consent (0168): opt-in, never blocks. Shown only when the
  // shop has capture on and the client hasn't already agreed there.
  const [photoConsent, setPhotoConsent] = useState(false);
  const { data: myConsents } = useMyPhotoConsents();
  const existingConsent = myConsents?.find((c) => c.business_id === businessId) ?? null;
  const consentPrompt = photoConsentPrompt(info?.policy, existingConsent, PHOTO_CONSENT_VERSION);
  // Text messages (0174): unticked box, never blocks. Recorded after the
  // request is sent, as its own consent row with source booking_confirm.
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [smsPhone, setSmsPhone] = useState('');
  const { data: smsStatus } = useMySmsStatus();
  const setSmsConsent = useSetSmsConsent();
  const smsPrompt = smsConsentPrompt(smsStatus, SMS_CONSENT_VERSION);
  const smsPhoneE164 = toE164US(smsPhone) ?? smsStatus?.phone_e164 ?? null;
  const smsNeedsPhone = smsPrompt === 'checkbox' && !smsStatus?.phone_e164;
  const [feedback, setFeedback] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Service list: all active services, or — when a barber filter is set —
  // just that provider's capabilities (provider-first booking, RPC 0061).
  const servicesForProvider = useServicesForProvider(businessId, serviceFilterProvider ?? undefined);
  const services = useMemo(
    () => (serviceFilterProvider ? servicesForProvider.data ?? [] : info?.services ?? []),
    [serviceFilterProvider, servicesForProvider.data, info?.services],
  );

  // A selected serviceId may become invalid — a "book again" service that's been
  // removed, or one the newly-filtered barber doesn't offer. Once the relevant
  // list has loaded, drop a stale id so the user picks fresh instead of being
  // stuck on a phantom (invisible) selection.
  useEffect(() => {
    if (serviceId && services.length > 0 && !services.some((s) => s.id === serviceId)) {
      setServiceId(null);
    }
  }, [serviceId, services]);

  // Provider list narrows to those who can do the chosen service (capabilities,
  // migration 0037); before a service is picked, show all bookable providers.
  const allProviders = useBookableProviders(businessId);
  const serviceProviders = useBookableProvidersForService(businessId, serviceId ?? undefined);
  const providers = (serviceId ? serviceProviders.data : allProviders.data) ?? [];

  // Auto-select the only location when there's just one. We keep location quiet
  // in the flow — most clients are booking the exact shop they tapped into.
  const locations = info?.locations ?? [];
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

  // Switching the barber filter changes the provider context: reset provider +
  // time; the stale-service effect drops the service if the barber can't do it.
  const onChangeFilter = (id: string | null) => {
    setServiceFilterProvider(id);
    setProviderId(null);
    setWhen(null);
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
    if (!effectiveLocationId) return setValidationError(t('book.validation.location'));
    if (!serviceId) return setValidationError(t('book.validation.service'));
    if (!providerId) return setValidationError(t('book.validation.provider'));
    if (!when) return setValidationError(t('book.validation.time'));
    if (needsAck && !acknowledged) {
      return setValidationError(t('book.validation.acknowledge'));
    }
    if (smsPrompt === 'checkbox' && smsOptIn && !smsPhoneE164) {
      return setValidationError(t('book.validation.smsPhone'));
    }
    // The entitlement check settled without an answer. Browsing stayed open on
    // purpose, but we don't send a request we can't stand behind: ask once more,
    // and stop here if the answer comes back no. If the retry fails too, fall
    // through — the server is the authority and the catch below has the copy.
    if (entitlement === 'unknown') {
      const recheck = await bookingCheck.refetch();
      if (recheck.data === false) return setFeedback(tMessage(BOOKING_UNAVAILABLE_MESSAGE) ?? null);
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
        photoConsent: consentPrompt === 'checkbox' && photoConsent,
      });
      // The booking is in; the text opt-in is a separate record and must not
      // undo it if it fails — surface the error and carry on.
      if (smsPrompt === 'checkbox' && smsOptIn && smsPhoneE164) {
        try {
          await setSmsConsent.mutateAsync({ phoneE164: smsPhoneE164, on: true, source: 'booking_confirm' });
        } catch (err: any) {
          setFeedback(err?.message ?? t('book.smsFailed'));
        }
      }
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
      // 0120's trigger says "Add a seat to start taking bookings." — copy for the
      // salon owner, never for their client. Only that one rejection is
      // rewritten; every other failure keeps its own message.
      setFeedback(tMessage(bookingErrorMessage(err, t('book.sendFailed'))) ?? null);
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
        <Appbar.Content
          title={bizName ? t('book.titleWithBusiness', { business: bizName }) : t('book.title')}
        />
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
      ) : entitlement === 'disabled' ? (
        <View style={styles.center}>
          <Text variant="titleMedium" style={{ fontWeight: '700', textAlign: 'center' }}>
            {t('book.notTaking.title')}
          </Text>
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 8 }}
          >
            {t('book.notTaking.body', { business: bizName ?? t('book.notTaking.thisBusiness') })}
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
                  mode={active ? 'flat' : 'outlined'}
                  icon={complete ? 'check' : undefined}
                  selected={active}
                  showSelectedCheck={false}
                  disabled={!reachable}
                  onPress={() => goToStep(i)}
                  selectedColor={active ? theme.colors.onPrimary : undefined}
                  style={[styles.tab, active && { backgroundColor: theme.colors.primary }]}
                  textStyle={[styles.tabText, active ? { color: theme.colors.onPrimary, fontWeight: '700' } : null]}
                >
                  {t('book.stepLabel', { number: i + 1, label: t(`book.steps.${label}`) })}
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
                      {t('book.location')}
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
                          {selectedLocation?.name ?? t('book.selectLocation')}
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

                {/* Provider-first entry: pick a barber to see only their services. */}
                {(allProviders.data?.length ?? 0) > 0 ? (
                  <View style={styles.filterBlock}>
                    <Text
                      variant="bodySmall"
                      style={{ color: theme.colors.onSurfaceVariant, marginBottom: 6 }}
                    >
                      {t('book.browseByBarber')}
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.filterRow}
                    >
                      <SelectableChip
                        selected={!serviceFilterProvider}
                        onPress={() => onChangeFilter(null)}
                        style={styles.filterChip}
                      >
                        {t('book.anyBarber')}
                      </SelectableChip>
                      {(allProviders.data ?? []).map((p) => (
                        <SelectableChip
                          key={p.id}
                          selected={serviceFilterProvider === p.id}
                          onPress={() => onChangeFilter(p.id)}
                          style={styles.filterChip}
                        >
                          {p.name}
                        </SelectableChip>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}

                <Text variant="titleMedium" style={styles.stepTitle}>
                  {t('book.serviceTitle')}
                </Text>
                {serviceFilterProvider && services.length === 0 ? (
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {t('book.noServicesForBarber')}
                  </Text>
                ) : null}
                {services.map((s) => (
                  <ChoiceCard
                    key={s.id}
                    selected={s.id === serviceId}
                    title={s.name}
                    subtitle={
                      s.description
                        ? t('book.priceDurationDescription', {
                            price: f.price(s.price),
                            duration: f.duration(s.duration),
                            description: s.description,
                          })
                        : t('book.priceDuration', {
                            price: f.price(s.price),
                            duration: f.duration(s.duration),
                          })
                    }
                    onPress={() => {
                      setServiceId(s.id);
                      // Pre-select the filtered barber as provider; else pick in step 2.
                      const pre = serviceFilterProvider ?? null;
                      setProviderId(pre);
                      setWhen(null);
                      setValidationError(null);
                      // Auto-advance: a barber chosen via the filter already fixes
                      // the provider → skip straight to Time; otherwise → Provider.
                      setStep(pre ? 2 : 1);
                    }}
                  />
                ))}

              </>
            ) : null}

            {/* -------------------------------------------------- STEP 2 · Provider */}
            {step === 1 ? (
              <>
                <Text variant="titleMedium" style={styles.stepTitle}>
                  {t('book.providerTitle')}
                </Text>
                {selectedService ? (
                  <Text
                    variant="bodySmall"
                    style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}
                  >
                    {t('book.forService', { service: selectedService.name })}
                  </Text>
                ) : null}
                {providers.length === 0 ? (
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {t('book.noProviders')}
                  </Text>
                ) : (
                  <>
                    <ChoiceCard
                      selected={anyProvider}
                      title={t('book.anyAvailable')}
                      subtitle={t('book.anyAvailableSubtitle')}
                      leading={<Avatar.Icon size={40} icon="account-multiple" />}
                      onPress={() => {
                        setProviderId(ANY_PROVIDER_ID);
                        setWhen(null);
                        setValidationError(null);
                        setStep(2); // → Time
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
                          setValidationError(null);
                          setStep(2); // → Time
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
                  {t('book.timeTitle')}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
                  {selectedService?.name}
                  {anyProvider
                    ? ` · ${t('book.anyProvider')}`
                    : selectedProvider
                      ? ` · ${selectedProvider.name}`
                      : ''}
                </Text>
                <SlotPicker
                  businessId={businessId}
                  employeeId={anyProvider ? null : providerId}
                  anyProvider={anyProvider}
                  durationMinutes={selectedService?.duration}
                  serviceId={serviceId ?? undefined}
                  value={when}
                  onChange={(d) => {
                    setWhen(d);
                    // Auto-advance to Confirm once a time is chosen.
                    if (d) {
                      setValidationError(null);
                      setStep(3);
                    }
                  }}
                  minDate={new Date()}
                />
              </>
            ) : null}

            {/* -------------------------------------------------- STEP 4 · Confirm */}
            {step === 3 ? (
              <>
                <Text variant="titleMedium" style={styles.stepTitle}>
                  {t('book.confirmTitle')}
                </Text>

                <Card mode="outlined" style={styles.review}>
                  <Card.Content>
                    <SummaryRow label={t('book.summary.service')} value={selectedService?.name ?? '—'} />
                    {selectedService ? (
                      <SummaryRow
                        label={t('book.summary.price')}
                        value={t('book.priceDuration', {
                          price: f.price(selectedService.price),
                          duration: f.duration(selectedService.duration),
                        })}
                      />
                    ) : null}
                    <SummaryRow
                      label={t('book.summary.provider')}
                      value={anyProvider ? t('book.anyAvailable') : selectedProvider?.name ?? '—'}
                    />
                    {selectedLocation ? (
                      <SummaryRow label={t('book.summary.location')} value={selectedLocation.name} />
                    ) : null}
                    <SummaryRow
                      label={t('book.summary.when')}
                      value={when ? f.date(when, 'weekdayDateTime') : '—'}
                    />
                  </Card.Content>
                </Card>

                {/* Notes live on the final page now. */}
                <TextInput
                  label={t('book.notesLabel')}
                  mode="outlined"
                  multiline
                  numberOfLines={3}
                  value={notes}
                  onChangeText={setNotes}
                  style={{ marginTop: 16 }}
                  placeholder={t('book.notesPlaceholder')}
                />

                <Card style={styles.review} mode="contained">
                  <Card.Content>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      {t('book.requestExplainer')}
                    </Text>
                  </Card.Content>
                </Card>

                {smsPrompt !== 'hidden' ? (
                  <Card style={styles.review} mode="outlined">
                    <Card.Content>
                      <View style={styles.policyHead}>
                        <Icon source="message-text-outline" size={16} color={theme.colors.primary} />
                        <Text variant="labelLarge">{t('book.sms.title')}</Text>
                      </View>
                      {smsPrompt === 'already' ? (
                        <Text variant="bodySmall" style={styles.policyLine}>
                          {t('book.sms.already', { phone: smsStatus?.phone_e164 ?? '' })}
                        </Text>
                      ) : (
                        <>
                          <Text variant="bodySmall" style={styles.policyLine}>
                            {t('book.sms.intro')}
                          </Text>
                          <Checkbox.Item
                            label={SMS_CONSENT_CHECKBOX_LABEL}
                            status={smsOptIn ? 'checked' : 'unchecked'}
                            onPress={() => setSmsOptIn((v) => !v)}
                            position="leading"
                            labelStyle={{ textAlign: 'left' }}
                            style={{ paddingHorizontal: 0 }}
                          />
                          {smsOptIn && smsNeedsPhone ? (
                            <TextInput
                              mode="outlined"
                              dense
                              label={t('book.sms.phoneLabel')}
                              value={smsPhone}
                              onChangeText={setSmsPhone}
                              keyboardType="phone-pad"
                              autoComplete="tel"
                              textContentType="telephoneNumber"
                              placeholder="(610) 555-0123"
                              error={smsPhone.trim().length > 0 && !toE164US(smsPhone)}
                              style={{ marginTop: 4 }}
                            />
                          ) : null}
                          {/* Always visible beside the unticked box — the carriers
                              want the disclosure readable before consent, not after. */}
                          {consentInEnglishOnly ? (
                            <Text variant="bodySmall" style={styles.policyLine}>
                              {t('inbox:sms.legalNote')}
                            </Text>
                          ) : null}
                          <Text variant="bodySmall" style={[styles.policyLine, { color: theme.colors.onSurfaceVariant }]}>
                            {SMS_CONSENT_CTA}
                          </Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginLeft: -8 }}>
                            <Button
                              compact
                              mode="text"
                              onPress={() => router.push({ pathname: '/(app)/legal/[doc]', params: { doc: 'terms' } })}
                            >
                              {t('book.sms.terms')}
                            </Button>
                            <Button
                              compact
                              mode="text"
                              onPress={() => router.push({ pathname: '/(app)/legal/[doc]', params: { doc: 'privacy' } })}
                            >
                              {t('book.sms.privacy')}
                            </Button>
                          </View>
                        </>
                      )}
                    </Card.Content>
                  </Card>
                ) : null}

                {consentPrompt !== 'hidden' ? (
                  <Card style={styles.review} mode="outlined">
                    <Card.Content>
                      <View style={styles.policyHead}>
                        <Icon source="camera-account" size={16} color={theme.colors.primary} />
                        <Text variant="labelLarge">{t('book.photos.title')}</Text>
                      </View>
                      {consentPrompt === 'already' ? (
                        <Text variant="bodySmall" style={styles.policyLine}>
                          {t('book.photos.already')}
                        </Text>
                      ) : (
                        <>
                          <Text variant="bodySmall" style={styles.policyLine}>
                            {t('book.photos.intro')}
                          </Text>
                          {consentInEnglishOnly ? (
                            <Text variant="bodySmall" style={styles.policyLine}>
                              {t('photos:consent.legalNote')}
                            </Text>
                          ) : null}
                          <Checkbox.Item
                            label={photoConsentSentence(bizName)}
                            status={photoConsent ? 'checked' : 'unchecked'}
                            onPress={() => setPhotoConsent((v) => !v)}
                            position="leading"
                            labelStyle={{ textAlign: 'left' }}
                            style={{ paddingHorizontal: 0 }}
                          />
                          <Button
                            compact
                            mode="text"
                            onPress={() => router.push({ pathname: '/(app)/legal/[doc]', params: { doc: 'privacy' } })}
                            style={{ alignSelf: 'flex-start' }}
                          >
                            {t('book.photos.howHandled')}
                          </Button>
                        </>
                      )}
                    </Card.Content>
                  </Card>
                ) : null}

                {depositApplies ? (
                  <Card style={styles.review} mode="outlined">
                    <Card.Content>
                      <View style={styles.policyHead}>
                        <Icon source="cash-lock" size={16} color={theme.colors.primary} />
                        <Text variant="labelLarge">
                          {depositRequired ? t('book.deposit.titleRequired') : t('book.deposit.title')}
                        </Text>
                      </View>
                      <Text variant="bodySmall" style={styles.policyLine}>
                        {depositCents != null
                          ? t(depositRequired ? 'book.deposit.requiredWithAmount' : 'book.deposit.optionalWithAmount', {
                              amount: f.money(depositCents),
                            })
                          : t(depositRequired ? 'book.deposit.required' : 'book.deposit.optional')}
                      </Text>
                    </Card.Content>
                  </Card>
                ) : null}

                {info?.policy && hasPolicy(info.policy) ? (
                  <Card style={styles.review} mode="outlined">
                    <Card.Content>
                      <View style={styles.policyHead}>
                        <Icon source="information-outline" size={16} color={theme.colors.primary} />
                        <Text variant="labelLarge">{t('book.policy.title')}</Text>
                      </View>
                      {info.policy.cancellation_window_hours ? (
                        <Text variant="bodySmall" style={styles.policyLine}>
                          {t('book.policy.window', { count: info.policy.cancellation_window_hours })}
                        </Text>
                      ) : null}
                      {info.policy.no_show_fee > 0 ? (
                        <Text variant="bodySmall" style={styles.policyLine}>
                          {t('book.policy.noShowFee', { amount: f.price(info.policy.no_show_fee) })}
                        </Text>
                      ) : null}
                      {info.policy.late_cancel_fee > 0 ? (
                        <Text variant="bodySmall" style={styles.policyLine}>
                          {t('book.policy.lateCancelFee', {
                            amount: f.price(info.policy.late_cancel_fee),
                          })}
                        </Text>
                      ) : null}
                      {info.policy.cancellation_policy ? (
                        <Text variant="bodySmall" style={styles.policyLine}>
                          {info.policy.cancellation_policy}
                        </Text>
                      ) : null}
                      <Checkbox.Item
                        label={t('book.policy.acknowledge')}
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
              {step === 0 ? t('common:actions.cancel') : t('common:actions.back')}
            </Button>
            <Button
              mode="contained"
              onPress={goNext}
              disabled={!canContinue || requestBooking.isPending}
              loading={requestBooking.isPending}
            >
              {step === STEPS.length - 1 ? t('book.requestAppointment') : t('book.next')}
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
  filterBlock: { marginBottom: 12 },
  filterRow: { gap: 8, paddingRight: 8 },
  filterChip: { marginRight: 0 },
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
