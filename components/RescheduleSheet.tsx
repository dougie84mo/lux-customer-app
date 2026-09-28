import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Modal, Portal, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useFormat } from '@/lib/format';
import { SlotPicker } from './SlotPicker';

// Reusable "pick a new time" sheet. Drives the existing SlotPicker against a
// provider (or any provider) for a given service duration, then hands the chosen
// Date back to the caller, which owns the actual reschedule mutation (client vs
// staff). Selection resets every time the sheet opens.
export function RescheduleSheet({
  visible,
  businessId,
  employeeId,
  anyProvider = false,
  durationMinutes,
  currentStart,
  submitting = false,
  onDismiss,
  onConfirm,
}: {
  visible: boolean;
  businessId?: string;
  employeeId?: string | null;
  anyProvider?: boolean;
  durationMinutes?: number;
  currentStart?: string | null;
  submitting?: boolean;
  onDismiss: () => void;
  onConfirm: (start: Date) => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation(['booking', 'common']);
  const f = useFormat();
  const [picked, setPicked] = useState<Date | null>(null);

  useEffect(() => {
    if (visible) setPicked(null);
  }, [visible]);

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[styles.sheet, { backgroundColor: theme.colors.surface }]}
      >
        <Text variant="titleLarge" style={{ marginBottom: 2 }}>
          {t('reschedule.title')}
        </Text>
        {currentStart ? (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
            {t('reschedule.currently', { when: f.date(currentStart, 'weekdayDateTime') })}
          </Text>
        ) : null}

        <ScrollView style={{ maxHeight: 420 }}>
          <SlotPicker
            businessId={businessId}
            employeeId={employeeId}
            anyProvider={anyProvider}
            durationMinutes={durationMinutes}
            value={picked}
            onChange={setPicked}
          />
        </ScrollView>

        <View style={styles.actions}>
          <Button onPress={onDismiss} disabled={submitting}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            mode="contained"
            disabled={!picked || submitting}
            loading={submitting}
            onPress={() => picked && onConfirm(picked)}
          >
            {t('reschedule.confirm')}
          </Button>
        </View>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  sheet: { margin: 16, borderRadius: 20, padding: 20, maxHeight: '85%' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
});
