import { notificationCopy } from '@/lib/notificationCopy';
import { formatDate } from '@/lib/format';

// Server rows are English (0033 / 0034 / 0051 / 0053 / 0141); the inbox
// rebuilds client-facing ones in the app language and shows anything it
// doesn't recognise as stored.
describe('notificationCopy', () => {
  it('translates a reminder into Spanish, keeping names and localising the time', () => {
    const start = '2026-09-30T18:30:00+00:00';
    const copy = notificationCopy(
      {
        type: 'reminder',
        title: 'Appointment reminder',
        body: 'Reminder: Haircut at Studio Nine is coming up tomorrow (Wed Sep 30, 02:30 PM)',
        data: { appointment_id: 'a1', business_id: 'b1', window: '24h', start },
      },
      'es',
    );
    expect(copy.title).toBe('Recordatorio de cita');
    expect(copy.body).toBe(
      `Recordatorio: Haircut en Studio Nine es mañana (${formatDate(start, 'weekdayDateTime', 'es')})`,
    );
  });

  it('translates a declined booking and the server placeholder name', () => {
    const copy = notificationCopy(
      {
        type: 'booking_declined',
        title: 'Booking declined',
        body: "A business couldn't take that time — try another.",
        data: { request_id: 'r1', business_id: 'b1' },
      },
      'es',
    );
    expect(copy).toEqual({
      title: 'Reserva rechazada',
      body: 'Un negocio no pudo tomar esa hora. Prueba con otra.',
    });
  });

  it('falls back to the stored English for unknown types', () => {
    const row = { type: 'payout_blocked', title: 'Your payout is waiting', body: 'Finish setup.', data: {} };
    expect(notificationCopy(row, 'es')).toEqual({ title: row.title, body: row.body });
  });

  it('falls back to the stored body when the template or data does not match', () => {
    const copy = notificationCopy(
      { type: 'reminder', title: 'Appointment reminder', body: 'Something new from the server', data: {} },
      'es',
    );
    expect(copy).toEqual({ title: 'Recordatorio de cita', body: 'Something new from the server' });
  });

  it('leaves English copy as the server wrote it', () => {
    const copy = notificationCopy(
      {
        type: 'booking_confirmed',
        title: 'Booking confirmed',
        body: 'Studio Nine confirmed your appointment · Haircut',
        data: {},
      },
      'en',
    );
    expect(copy).toEqual({ title: 'Booking confirmed', body: 'Studio Nine confirmed your appointment · Haircut' });
  });
});
