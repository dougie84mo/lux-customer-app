import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, IconButton, Modal, Portal, Text, useTheme } from 'react-native-paper';
import { addMonths, endOfMonth, format, isBefore, startOfMonth } from 'date-fns';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function ymd(d: Date) {
  return format(d, 'yyyy-MM-dd');
}
function atMidnight(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Range-capable month picker. First tap sets the start; second tap sets the end
// (a tap before the start resets the start). Confirming with only a start picked
// yields a single day (start === end). No native datetime module.
export function DateRangePickerModal({
  visible,
  initialStart,
  initialEnd,
  minDate,
  onDismiss,
  onConfirm,
}: {
  visible: boolean;
  initialStart?: Date | null;
  initialEnd?: Date | null;
  minDate?: Date;
  onDismiss: () => void;
  onConfirm: (range: { start: string; end: string }) => void;
}) {
  const theme = useTheme();
  const [month, setMonth] = useState<Date>(startOfMonth(initialStart ?? new Date()));
  const [start, setStart] = useState<Date | null>(initialStart ? atMidnight(initialStart) : null);
  const [end, setEnd] = useState<Date | null>(initialEnd ? atMidnight(initialEnd) : null);

  useEffect(() => {
    if (visible) {
      setMonth(startOfMonth(initialStart ?? new Date()));
      setStart(initialStart ? atMidnight(initialStart) : null);
      setEnd(initialEnd ? atMidnight(initialEnd) : null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const minDay = minDate ? atMidnight(minDate) : null;
  const first = startOfMonth(month);
  const daysInMonth = endOfMonth(month).getDate();
  const lead = first.getDay();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);

  const onTap = (d: Date) => {
    if (!start || (start && end)) {
      setStart(d);
      setEnd(null);
    } else if (isBefore(d, start)) {
      setStart(d);
    } else {
      setEnd(d);
    }
  };

  const inRange = (d: Date) =>
    start && end && !isBefore(d, start) && !isBefore(end, d);
  const isEdge = (d: Date) =>
    (start && d.getTime() === start.getTime()) || (end && d.getTime() === end.getTime());

  const label =
    start && end
      ? `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`
      : start
        ? `${format(start, 'MMM d, yyyy')} (single day)`
        : 'Tap a day, then an end day for a range';

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[styles.sheet, { backgroundColor: theme.colors.surface }]}
      >
        <Text variant="titleMedium">Choose dates</Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
          {label}
        </Text>
        <View style={styles.header}>
          <IconButton icon="chevron-left" onPress={() => setMonth(addMonths(month, -1))} />
          <Text variant="titleMedium" style={{ flex: 1, textAlign: 'center' }}>
            {format(month, 'MMMM yyyy')}
          </Text>
          <IconButton icon="chevron-right" onPress={() => setMonth(addMonths(month, 1))} />
        </View>
        <View style={styles.weekRow}>
          {WEEKDAYS.map((w, i) => (
            <Text key={i} variant="labelSmall" style={[styles.weekday, { color: theme.colors.onSurfaceVariant }]}>
              {w}
            </Text>
          ))}
        </View>
        <View style={styles.grid}>
          {cells.map((d, i) =>
            d === null ? (
              <View key={i} style={styles.cell} />
            ) : (
              <Pressable
                key={i}
                style={styles.cell}
                disabled={minDay ? isBefore(d, minDay) : false}
                onPress={() => onTap(d)}
              >
                <View
                  style={[
                    styles.day,
                    inRange(d) && !isEdge(d) ? { backgroundColor: theme.colors.primaryContainer } : null,
                    isEdge(d) ? { backgroundColor: theme.colors.primary } : null,
                  ]}
                >
                  <Text
                    style={{
                      color: isEdge(d)
                        ? theme.colors.onPrimary
                        : minDay && isBefore(d, minDay)
                          ? theme.colors.onSurfaceDisabled
                          : theme.colors.onSurface,
                    }}
                  >
                    {d.getDate()}
                  </Text>
                </View>
              </Pressable>
            ),
          )}
        </View>
        <View style={styles.actions}>
          <Button onPress={onDismiss}>Cancel</Button>
          <Button
            mode="contained"
            disabled={!start}
            onPress={() => start && onConfirm({ start: ymd(start), end: ymd(end ?? start) })}
          >
            Select
          </Button>
        </View>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  sheet: { margin: 16, borderRadius: 20, padding: 16, maxHeight: '85%' },
  header: { flexDirection: 'row', alignItems: 'center' },
  weekRow: { flexDirection: 'row' },
  weekday: { flexBasis: '14.28%', textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  cell: { flexBasis: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  day: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
});
