import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, IconButton, Modal, Portal, Text, useTheme } from 'react-native-paper';
import { addMonths, endOfMonth, format, isBefore, startOfMonth } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useFormat } from '@/lib/format';

// Weekday header dates: a known Sunday (2026-01-04) + 0…6, formatted in the
// app language. The grid starts on Sunday.
const WEEK_DATES = Array.from({ length: 7 }, (_, i) => new Date(2026, 0, 4 + i));

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Lightweight month-grid date picker (pure JS — no native datetime module, so it
// works on fast-refresh without a rebuild). Returns a 'YYYY-MM-DD' key.
export function DatePickerModal({
  visible,
  initialDate,
  minDate,
  title,
  onDismiss,
  onConfirm,
}: {
  visible: boolean;
  initialDate?: Date | null;
  minDate?: Date;
  title?: string;
  onDismiss: () => void;
  onConfirm: (dateKey: string) => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation(['booking', 'common']);
  const f = useFormat();
  const [month, setMonth] = useState<Date>(startOfMonth(initialDate ?? new Date()));
  const [selected, setSelected] = useState<Date | null>(initialDate ?? null);

  useEffect(() => {
    if (visible) {
      setMonth(startOfMonth(initialDate ?? new Date()));
      setSelected(initialDate ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const first = startOfMonth(month);
  const daysInMonth = endOfMonth(month).getDate();
  const lead = first.getDay(); // 0 = Sunday
  const cells: (Date | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);

  const minDay = minDate
    ? new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate())
    : null;
  const isDisabled = (d: Date) => (minDay ? isBefore(d, minDay) : false);

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[styles.sheet, { backgroundColor: theme.colors.surface }]}
      >
        <Text variant="titleMedium" style={{ marginBottom: 4 }}>
          {title ?? t('datePicker.title')}
        </Text>
        <View style={styles.header}>
          <IconButton icon="chevron-left" onPress={() => setMonth(addMonths(month, -1))} />
          <Text variant="titleMedium" style={{ flex: 1, textAlign: 'center' }}>
            {f.date(month, 'monthYear')}
          </Text>
          <IconButton icon="chevron-right" onPress={() => setMonth(addMonths(month, 1))} />
        </View>
        <View style={styles.weekRow}>
          {WEEK_DATES.map((w, i) => (
            <Text
              key={i}
              variant="labelSmall"
              style={[styles.weekday, { color: theme.colors.onSurfaceVariant }]}
            >
              {f.date(w, 'weekday')}
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
                disabled={isDisabled(d)}
                onPress={() => setSelected(d)}
              >
                <View
                  style={[
                    styles.day,
                    selected && sameDay(d, selected) ? { backgroundColor: theme.colors.primary } : null,
                  ]}
                >
                  <Text
                    style={{
                      color:
                        selected && sameDay(d, selected)
                          ? theme.colors.onPrimary
                          : isDisabled(d)
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
          <Button onPress={onDismiss}>{t('common:actions.cancel')}</Button>
          <Button
            mode="contained"
            disabled={!selected}
            onPress={() => selected && onConfirm(format(selected, 'yyyy-MM-dd'))}
          >
            {t('datePicker.select')}
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
