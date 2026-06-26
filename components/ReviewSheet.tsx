import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Button,
  Dialog,
  HelperText,
  IconButton,
  Portal,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { supabase } from '@/lib/supabase';
import { useSubmitReview } from '@/lib/reviews';
import type { MyBookingRequest } from '@/lib/booking';

// Star-picker + optional comment for reviewing a completed booking. The review
// is keyed by the appointment; we read the appointment id from the caller's own
// booking_requests row (RLS: booking_requests_select_own). submit_review enforces
// COMPLETED status server-side, so it's safe to attempt on any past booking.
export function ReviewSheet({
  booking,
  onClose,
  onDone,
}: {
  booking: MyBookingRequest | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const theme = useTheme();
  const submit = useSubmitReview();
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Reset whenever a different booking is opened. Keyed on the id alone (the
  // only thing the reset depends on), which also satisfies exhaustive-deps.
  const bookingId = booking?.id;
  useEffect(() => {
    if (bookingId) {
      setRating(0);
      setBody('');
      setError(null);
    }
  }, [bookingId]);

  const onSubmit = async () => {
    if (!booking) return;
    if (rating < 1) {
      setError('Pick a star rating.');
      return;
    }
    if (!booking.employee_id) {
      setError('There is no barber on this booking to review.');
      return;
    }
    setError(null);
    try {
      const { data, error: aerr } = await supabase
        .from('booking_requests')
        .select('appointment_id')
        .eq('id', booking.id)
        .maybeSingle();
      if (aerr) throw aerr;
      const appointmentId = (data as { appointment_id: string | null } | null)?.appointment_id;
      if (!appointmentId) {
        setError("This booking can't be reviewed yet.");
        return;
      }
      await submit.mutateAsync({
        appointmentId,
        rating,
        body: body.trim() || null,
        businessId: booking.business_id,
        memberId: booking.employee_id,
      });
      onDone('Thanks for your review!');
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Could not submit your review.');
    }
  };

  return (
    <Portal>
      <Dialog visible={!!booking} onDismiss={onClose}>
        <Dialog.Title>Leave a review</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            How was your visit{booking?.business_name ? ` at ${booking.business_name}` : ''}?
          </Text>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((i) => (
              <IconButton
                key={i}
                icon={rating >= i ? 'star' : 'star-outline'}
                iconColor={theme.colors.primary}
                size={32}
                onPress={() => setRating(i)}
                style={styles.star}
              />
            ))}
          </View>
          <TextInput
            label="Comments (optional)"
            mode="outlined"
            multiline
            numberOfLines={3}
            value={body}
            onChangeText={setBody}
          />
          <HelperText type="error" visible={!!error}>
            {error}
          </HelperText>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onClose}>Cancel</Button>
          <Button
            mode="contained"
            loading={submit.isPending}
            disabled={submit.isPending}
            onPress={onSubmit}
          >
            Submit
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  stars: { flexDirection: 'row', justifyContent: 'center', marginVertical: 8 },
  star: { margin: 0 },
});
