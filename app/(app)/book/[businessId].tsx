import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Avatar,
  Button,
  Card,
  Divider,
  HelperText,
  Icon,
  Menu,
  Snackbar,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { SlotPicker } from '@/components/SlotPicker';
import { avatarUrl, initialsOf } from '@/lib/avatars';
import { BookingPolicy, useBusinessBookingInfo, useRequestBooking } from '@/lib/booking';

// Whether a policy has anything worth showing the client.
function hasPolicy(p: BookingPolicy): boolean {
  return (
    !!p.cancellation_window_hours ||
    p.no_show_fee > 0 ||
    p.late_cancel_fee > 0 ||
    !!p.cancellation_policy
  );
}
import {
  ANY_PROVIDER_ID,
  useBookableProviders,
  useBookableProvidersForService,
} from '@/lib/schedules';

function BookScreen() {
  const theme = useTheme();
  const { businessId, name, serviceId: initialServiceId } = useLocalSearchParams<{
    businessId: string;
    name?: string;
    serviceId?: string;
  }>();
  const { data: info, isLoading, error } = useBusinessBookingInfo(businessId);
  const requestBooking = useRequestBooking();

  const [locationId, setLocationId] = useState<string | null>(null);
  // May be preselected when arriving from the business profile's service menu.
  const [serviceId, setServiceId] = useState<string | null>(initialServiceId ?? null);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [locationMenu, setLocationMenu] = useState(false);
  const [serviceMenu, setServiceMenu] = useState(false);
  const [providerMenu, setProviderMenu] = useState(false);
  const [when, setWhen] = useState<Date | null>(null);
  const [notes, setNotes] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Provider list narrows to those who can do the chosen service (capabilities,
  // migration 0037); before a service is picked, show all bookable providers.
  const allProviders = useBookableProviders(businessId);
  const serviceProviders = useBookableProvidersForService(businessId, serviceId ?? undefined);
  const providers = serviceId ? serviceProviders.data : allProviders.data;

  // Auto-select the only location when there's just one.
  const locations = info?.locations ?? [];
  const services = info?.services ?? [];
  const effectiveLocationId = locationId ?? (locations.length === 1 ? locations[0].id : null);
  const selectedLocation = locations.find((l) => l.id === effectiveLocationId);
  const selectedService = services.find((s) => s.id === serviceId);
  const anyProvider = providerId === ANY_PROVIDER_ID;
  const selectedProvider = (providers ?? []).find((p) => p.id === providerId);
  const providerLabel = anyProvider
    ? 'Any available'
    : selectedProvider?.name ??
      ((providers ?? []).length === 0 ? 'No providers available' : 'Select provider');

  // Render a provider's photo (or initials) at a given size — used as the
  // leading icon of each provider menu item and on the selected-provider button.
  const providerAvatar =
    (avatar_path?: string | null, name?: string) =>
    ({ size }: { size: number }) => {
      const uri = avatarUrl(avatar_path);
      return uri ? (
        <Avatar.Image size={size} source={{ uri }} />
      ) : (
        <Avatar.Text size={size} label={initialsOf(name)} />
      );
    };

  const onSubmit = async () => {
    setValidationError(null);
    if (!businessId) return;
    if (!effectiveLocationId) return setValidationError('Choose a location.');
    if (!serviceId) return setValidationError('Choose a service.');
    if (!providerId) return setValidationError('Choose a provider.');
    if (!when) return setValidationError('Pick an available time.');
    try {
      await requestBooking.mutateAsync({
        businessId,
        locationId: effectiveLocationId,
        serviceId,
        requestedStart: when.toISOString(),
        notes: notes || undefined,
        // "Any available" → no preferred provider; staff assigns at confirm.
        employeeId: anyProvider ? undefined : providerId,
      });
      router.replace('/(app)/my-bookings');
    } catch (err: any) {
      setFeedback(err?.message ?? 'Could not send your request');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={name ? `Book · ${name}` : 'Book appointment'} />
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
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            {/* Location */}
            <Text variant="labelLarge" style={styles.label}>
              Location
            </Text>
            <Menu
              visible={locationMenu}
              onDismiss={() => setLocationMenu(false)}
              anchor={
                <Button
                  mode="outlined"
                  icon="map-marker"
                  contentStyle={{ justifyContent: 'flex-start' }}
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

            {/* Service */}
            <Text variant="labelLarge" style={styles.label}>
              Service
            </Text>
            <Menu
              visible={serviceMenu}
              onDismiss={() => setServiceMenu(false)}
              anchor={
                <Button
                  mode="outlined"
                  icon="content-cut"
                  contentStyle={{ justifyContent: 'flex-start' }}
                  onPress={() => setServiceMenu(true)}
                >
                  {selectedService?.name ?? 'Select service'}
                </Button>
              }
            >
              {services.map((s) => (
                <Menu.Item
                  key={s.id}
                  title={`${s.name} · $${s.price.toFixed(0)} · ${s.duration}m`}
                  onPress={() => {
                    setServiceId(s.id);
                    // Capable providers + availability change with the service.
                    setProviderId(null);
                    setWhen(null);
                    setServiceMenu(false);
                  }}
                />
              ))}
            </Menu>

            {/* Provider */}
            <Text variant="labelLarge" style={styles.label}>
              Provider
            </Text>
            <Menu
              visible={providerMenu}
              onDismiss={() => setProviderMenu(false)}
              anchor={
                <Button
                  mode="outlined"
                  icon={
                    selectedProvider
                      ? providerAvatar(selectedProvider.avatar_path, selectedProvider.name)
                      : 'account'
                  }
                  contentStyle={{ justifyContent: 'flex-start' }}
                  onPress={() => setProviderMenu(true)}
                  disabled={(providers ?? []).length === 0}
                >
                  {providerLabel}
                </Button>
              }
            >
              <Menu.Item
                title="Any available"
                leadingIcon="account-multiple"
                onPress={() => {
                  setProviderId(ANY_PROVIDER_ID);
                  setWhen(null); // availability changes with the provider
                  setProviderMenu(false);
                }}
              />
              {(providers ?? []).map((p) => (
                <Menu.Item
                  key={p.id}
                  title={p.name}
                  leadingIcon={providerAvatar(p.avatar_path, p.name)}
                  onPress={() => {
                    setProviderId(p.id);
                    setWhen(null); // availability changes with the provider
                    setProviderMenu(false);
                  }}
                />
              ))}
            </Menu>

            <Divider style={{ marginVertical: 16 }} />

            {/* Date + time slots */}
            <Text variant="labelLarge" style={styles.label}>
              Pick a time
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

            {/* Notes */}
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

            <HelperText type="error" visible={!!validationError}>
              {validationError}
            </HelperText>

            <Card style={styles.summary} mode="contained">
              <Card.Content>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  You&apos;re requesting an appointment. The business confirms a final time —
                  you&apos;ll see the status under Bookings.
                </Text>
              </Card.Content>
            </Card>

            {info?.policy && hasPolicy(info.policy) ? (
              <Card style={styles.summary} mode="outlined">
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
                </Card.Content>
              </Card>
            ) : null}

            <Button
              mode="contained"
              style={{ marginTop: 16 }}
              loading={requestBooking.isPending}
              disabled={requestBooking.isPending}
              onPress={onSubmit}
            >
              Request appointment
            </Button>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      <Snackbar visible={!!feedback} onDismiss={() => setFeedback(null)} duration={4000}>
        {feedback ?? ''}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16 },
  label: { marginTop: 12, marginBottom: 8 },
  summary: { marginTop: 16 },
  policyHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  policyLine: { marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
});

export default withScreenErrorBoundary(BookScreen);
