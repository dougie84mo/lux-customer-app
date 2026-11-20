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

  it('translates a live-stream consent request, with and without a stylist name', () => {
    const data = { kind: 'live_consent', sessionId: 's1' };
    expect(
      notificationCopy(
        {
          type: 'live_consent',
          title: 'Studio Nine wants to go live',
          body: 'Ana would like to stream your appointment live from the mirror. Tap to allow or decline.',
          data,
        },
        'es',
      ),
    ).toEqual({
      title: 'Studio Nine quiere transmitir en vivo',
      body: 'Ana quiere transmitir tu cita en vivo desde el espejo. Toca para permitir o rechazar.',
    });
    expect(
      notificationCopy(
        {
          type: 'live_consent',
          title: 'Studio Nine wants to go live',
          body: 'Your stylist would like to stream your appointment live from the mirror. Tap to allow or decline.',
          data,
        },
        'es',
      ).body,
    ).toBe('Tu estilista quiere transmitir tu cita en vivo desde el espejo. Toca para permitir o rechazar.');
  });

  it('translates the three walk-in answers (0244), including the server placeholder name', () => {
    const data = { walk_in_request_id: 'w1', business_id: 'b1', wait_minutes: 15 };
    expect(
      notificationCopy(
        {
          type: 'walk_in_accepted',
          title: "You're in",
          body: 'Studio Nine accepted your walk-in. Estimated wait: 15 min.',
          data,
        },
        'es',
      ),
    ).toEqual({
      title: 'Tienes lugar',
      body: 'Studio Nine aceptó tu solicitud sin cita. Espera estimada: 15 min.',
    });
    expect(
      notificationCopy(
        {
          type: 'walk_in_declined',
          title: 'Walk-in declined',
          body: 'The shop cannot take your walk-in right now.',
          data,
        },
        'es',
      ),
    ).toEqual({
      title: 'Solicitud sin cita rechazada',
      body: 'El salón no puede atenderte sin cita en este momento.',
    });
    expect(
      notificationCopy(
        {
          type: 'walk_in_expired',
          title: 'Walk-in request expired',
          body: 'Studio Nine did not answer your walk-in request in time.',
          data,
        },
        'es',
      ),
    ).toEqual({
      title: 'Solicitud sin cita vencida',
      body: 'Studio Nine no respondió a tu solicitud sin cita a tiempo.',
    });
  });

  it('keeps a walk-in answer as stored in English and when the template changed', () => {
    const accepted = {
      type: 'walk_in_accepted',
      title: "You're in",
      body: 'Studio Nine accepted your walk-in. Estimated wait: 0 min.',
      data: {},
    };
    expect(notificationCopy(accepted, 'en')).toEqual({ title: accepted.title, body: accepted.body });
    expect(
      notificationCopy({ type: 'walk_in_declined', title: 'Walk-in declined', body: 'Reworded by the server.', data: {} }, 'es'),
    ).toEqual({ title: 'Solicitud sin cita rechazada', body: 'Reworded by the server.' });
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
