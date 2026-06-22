import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  SegmentedButtons,
  Surface,
  Text,
  useTheme,
} from 'react-native-paper';
import { format, parseISO } from 'date-fns';
import {
  useAvailableDays,
  useAvailableDaysAny,
  useAvailableSlots,
  useAvailableSlotsAny,
} from '@/lib/schedules';

// How far ahead we offer days. Matches the RPC's default window.
const LOOKAHEAD_DAYS = 30;

// Date + available-slot picker driven by a provider's weekly schedule (minus
// already-booked time). Instead of a free calendar where the user can land on a
// day off and see nothing, we show a horizontal strip of ONLY the upcoming days
// that actually have an open slot, auto-select the first, then show that day's
// times. Changing the day clears the current time selection (onChange(null)).
export function SlotPicker({
  businessId,
  employeeId,
  anyProvider = false,
  durationMinutes,
  serviceId,
  value,
  onChange,
  minDate,
}: {
  businessId?: string;
  employeeId?: string | null;
  /** When true, offer slots free for ANY provider (union), ignoring employeeId. */
  anyProvider?: boolean;
  durationMinutes?: number;
  /** Filters the ANY-provider union to providers who can do this service (0037). */
  serviceId?: string;
  value: Date | null;
  onChange: (d: Date | null) => void;
  minDate?: Date;
}) {
  const theme = useTheme();
  const ready = (anyProvider || !!employeeId) && !!durationMinutes;
  const provider = !anyProvider && ready ? employeeId ?? undefined : undefined;

  const fromKey = format(minDate ?? new Date(), 'yyyy-MM-dd');

  // One mode is active at a time; the inactive hook is disabled via its enabled
  // guard (undefined args), so only one RPC fires.
  const specificDays = useAvailableDays(
    businessId,
    provider,
    durationMinutes,
    !anyProvider && ready ? fromKey : undefined,
    LOOKAHEAD_DAYS,
  );
  const anyDays = useAvailableDaysAny(
    businessId,
    durationMinutes,
    anyProvider && ready ? fromKey : undefined,
    LOOKAHEAD_DAYS,
    serviceId,
  );
  const days = anyProvider ? anyDays.data : specificDays.data;
  const daysLoading = anyProvider ? anyDays.isLoading : specificDays.isLoading;

  const [selectedDay, setSelectedDay] = useState<string | null>(
    value ? format(value, 'yyyy-MM-dd') : null,
  );

  // Default to the first available day once availability loads, and recover if
  // the current pick is no longer offered (e.g. the provider changed).
  useEffect(() => {
    if (!days || days.length === 0) return;
    setSelectedDay((cur) => (cur && days.includes(cur) ? cur : days[0]));
  }, [days]);

  // Only query slots for a day we know is in the current availability set —
  // avoids a flash of "no open times" while a stale day settles.
  const effectiveDay = selectedDay && days?.includes(selectedDay) ? selectedDay : undefined;
  const specificSlots = useAvailableSlots(
    businessId,
    provider,
    !anyProvider ? effectiveDay : undefined,
    durationMinutes,
  );
  const anySlots = useAvailableSlotsAny(
    businessId,
    anyProvider ? effectiveDay : undefined,
    durationMinutes,
    serviceId,
  );
  const slots = anyProvider ? anySlots.data : specificSlots.data;
  const slotsLoading = anyProvider ? anySlots.isLoading : specificSlots.isLoading;

  // Split the day's open times into morning / afternoon so the list reads
  // clearly. A segmented toggle slides between them; default to the half holding
  // the current (else earliest) slot.
  const amSlots = useMemo(() => (slots ?? []).filter((s) => s.getHours() < 12), [slots]);
  const pmSlots = useMemo(() => (slots ?? []).filter((s) => s.getHours() >= 12), [slots]);
  const [period, setPeriod] = useState<'AM' | 'PM'>('AM');
  useEffect(() => {
    if (!slots || slots.length === 0) return;
    if (value && slots.some((s) => s.getTime() === value.getTime())) {
      setPeriod(value.getHours() < 12 ? 'AM' : 'PM');
    } else {
      setPeriod(amSlots.length > 0 ? 'AM' : 'PM');
    }
    // Re-evaluate only when the slot set changes, not on every value tap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);
  const visibleSlots = period === 'AM' ? amSlots : pmSlots;

  if (!ready) {
    return (
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
        Pick a provider and service to see available times.
      </Text>
    );
  }

  if (daysLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!days || days.length === 0) {
    return (
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
        No availability in the next {LOOKAHEAD_DAYS} days
        {anyProvider ? '.' : ' for this provider.'}
      </Text>
    );
  }

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dayStrip}
      >
        {days.map((key) => {
          const d = parseISO(key);
          const selected = key === selectedDay;
          const fg = selected ? theme.colors.onPrimary : theme.colors.onSurfaceVariant;
          return (
            <Pressable
              key={key}
              onPress={() => {
                setSelectedDay(key);
                onChange(null); // selection no longer valid for the new day
              }}
            >
              <Surface
                style={[
                  styles.dayChip,
                  {
                    backgroundColor: selected
                      ? theme.colors.primary
                      : theme.colors.surfaceVariant,
                  },
                ]}
                elevation={0}
              >
                <Text variant="labelSmall" style={{ color: fg }}>
                  {format(d, 'EEE')}
                </Text>
                <Text
                  variant="titleMedium"
                  style={{
                    color: selected ? theme.colors.onPrimary : theme.colors.onSurface,
                    fontWeight: '700',
                  }}
                >
                  {format(d, 'd')}
                </Text>
                <Text variant="labelSmall" style={{ color: fg }}>
                  {format(d, 'MMM')}
                </Text>
              </Surface>
            </Pressable>
          );
        })}
      </ScrollView>

      {slotsLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : slots && slots.length > 0 ? (
        <View>
          <SegmentedButtons
            value={period}
            onValueChange={(v) => setPeriod(v as 'AM' | 'PM')}
            density="small"
            style={styles.period}
            buttons={[
              {
                value: 'AM',
                label: amSlots.length > 0 ? `AM · ${amSlots.length}` : 'AM',
                icon: 'weather-sunny',
                disabled: amSlots.length === 0,
              },
              {
                value: 'PM',
                label: pmSlots.length > 0 ? `PM · ${pmSlots.length}` : 'PM',
                icon: 'weather-sunset',
                disabled: pmSlots.length === 0,
              },
            ]}
          />
          <View style={styles.grid}>
            {visibleSlots.map((s) => {
              const selected = value?.getTime() === s.getTime();
              return (
                <Button
                  key={s.toISOString()}
                  compact
                  mode={selected ? 'contained' : 'outlined'}
                  onPress={() => onChange(s)}
                  style={styles.slot}
                  labelStyle={styles.slotLabel}
                >
                  {format(s, 'h:mm a')}
                </Button>
              );
            })}
          </View>
        </View>
      ) : (
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 12 }}>
          No open times left on this day.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: 24, alignItems: 'center' },
  dayStrip: { gap: 8, paddingVertical: 12, paddingRight: 4 },
  dayChip: {
    width: 56,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
    gap: 2,
  },
  period: { marginTop: 8, marginBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  slot: { marginBottom: 0, minWidth: 84 },
  slotLabel: { marginHorizontal: 8 },
});
