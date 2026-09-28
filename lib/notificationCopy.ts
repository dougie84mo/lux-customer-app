import i18n, { AppLocale } from './i18n';
import { formatDate, formatMoney } from './format';
import type { EnResources } from '@/locales';

// In-app inbox copy in the app language. Rows in public.notifications are
// written in ENGLISH by Postgres (app/supabase/migrations: 0033 triggers +
// reschedule_appointment, 0034 reminders, 0051 message_customer, 0053
// waitlist, 0141 deposit refunds). For the client-facing types we rebuild the
// title / body from `type` + `data`, plus the names the server wrote into the
// English text (the business / service name is not in `data`), matched
// against the exact server template. Anything that doesn't match — an unknown
// type, a changed template, missing data — shows the stored English as-is.
//
// Server literals below (templates + placeholder names like 'the shop') are
// DATA to match against, not display copy. Keep them in step with the SQL.

export type NotificationCopyInput = {
  type: string;
  title: string;
  body: string | null;
  data: unknown;
};

export type NotificationCopy = { title: string; body: string | null };

type Placeholder = keyof EnResources['inbox']['copy']['placeholders'];

const asRecord = (d: unknown): Record<string, unknown> =>
  d && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, unknown>) : {};

const isoTime = (v: unknown): string | null =>
  typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null;

export function notificationCopy(n: NotificationCopyInput, locale: AppLocale): NotificationCopy {
  const t = i18n.getFixedT(locale, 'inbox');
  const data = asRecord(n.data);
  const stored: NotificationCopy = { title: n.title, body: n.body };
  const body = n.body ?? '';

  // A name the SQL wrote, or the SQL's own fallback for a missing name.
  const name = (value: string, serverPlaceholder: string, key: Placeholder) =>
    value === serverPlaceholder ? t(`copy.placeholders.${key}`) : value;

  // Translate a static title only when it is exactly the server's.
  const title = (english: string, translated: string) => (n.title === english ? translated : n.title);

  switch (n.type) {
    case 'booking_confirmed': {
      // 0033: coalesce(biz,'Your booking') || ' confirmed your appointment' || coalesce(' · ' || svc, '')
      const m = /^(.+?) confirmed your appointment(?: · (.+))?$/s.exec(body);
      if (!m || m[1] === 'Your booking') {
        return { title: title('Booking confirmed', t('copy.bookingConfirmed.title')), body: n.body };
      }
      return {
        title: title('Booking confirmed', t('copy.bookingConfirmed.title')),
        body: m[2]
          ? t('copy.bookingConfirmed.bodyWithService', { shop: m[1], service: m[2] })
          : t('copy.bookingConfirmed.body', { shop: m[1] }),
      };
    }

    case 'booking_declined': {
      // 0033: coalesce(biz,'A business') || ' couldn''t take that time — try another.'
      const m = /^(.+) couldn't take that time — try another\.$/s.exec(body);
      return {
        title: title('Booking declined', t('copy.bookingDeclined.title')),
        body: m ? t('copy.bookingDeclined.body', { shop: name(m[1], 'A business', 'aBusiness') }) : n.body,
      };
    }

    case 'appointment_cancelled':
      // 0033 notify_appointment_inapp: static text.
      return {
        title: title('Appointment cancelled', t('copy.appointmentCancelled.title')),
        body:
          body === 'Your appointment was cancelled by the shop.' ? t('copy.appointmentCancelled.body') : n.body,
      };

    case 'appointment_rescheduled': {
      // 0033 reschedule_appointment: static text, data.start = the new time.
      const start = isoTime(data.start);
      const known = body === 'The shop moved your appointment to a new time.';
      return {
        title: title('Appointment rescheduled', t('copy.appointmentRescheduled.title')),
        body: !known
          ? n.body
          : start
            ? t('copy.appointmentRescheduled.bodyWithTime', { when: formatDate(start, 'weekdayDateTime', locale) })
            : t('copy.appointmentRescheduled.body'),
      };
    }

    case 'reminder': {
      // 0034: 'Reminder: ' || coalesce(svc,'your appointment') || ' at ' || coalesce(biz,'the shop')
      //       || ' ' || phrase || ' (' || local time || ')'; data.window '24h'|'2h', data.start.
      const m = /^Reminder: (.+?) at (.+) (is coming up tomorrow|starts in about 2 hours) \(.+\)$/s.exec(body);
      const start = isoTime(data.start);
      const reminderTitle = title('Appointment reminder', t('copy.reminder.title'));
      if (!m || !start) return { title: reminderTitle, body: n.body };
      const vars = {
        service: name(m[1], 'your appointment', 'yourAppointment'),
        shop: name(m[2], 'the shop', 'theShop'),
        when: formatDate(start, 'weekdayDateTime', locale),
      };
      return {
        title: reminderTitle,
        body:
          m[3] === 'is coming up tomorrow' ? t('copy.reminder.body24h', vars) : t('copy.reminder.body2h', vars),
      };
    }

    case 'message': {
      // 0051: title 'Message from ' || coalesce(biz,'your salon'); body = the salon's own words.
      const m = /^Message from (.+)$/s.exec(n.title);
      return {
        title: m ? t('copy.message.title', { shop: name(m[1], 'your salon', 'yourSalon') }) : n.title,
        body: n.body,
      };
    }

    case 'waitlist': {
      // 0053 notify_waitlist_entry: coalesce(biz,'Your salon') || ' has an opening — book soon to grab it.'
      const m = /^(.+) has an opening — book soon to grab it\.$/s.exec(body);
      return {
        title: title('A spot may be opening up', t('copy.waitlist.title')),
        body: m ? t('copy.waitlist.body', { shop: name(m[1], 'Your salon', 'yourSalonStart') }) : n.body,
      };
    }

    case 'booking':
      // 0053 promote_waitlist_entry. The body's time was rendered by the
      // server (UTC, no year) and data has no start, so only the title is
      // translated; the body stays as stored.
      return { title: title("You're booked!", t('copy.waitlistBooked.title')), body: n.body };

    case 'deposit_refunded': {
      // 0141 record_deposit_refund: data.amount_cents.
      const cents = data.amount_cents;
      const known = body.endsWith(' has been refunded to your card. It usually lands in 5-10 days.');
      return {
        title: title('Your deposit is on its way back', t('copy.depositRefunded.title')),
        body:
          known && typeof cents === 'number' && Number.isFinite(cents)
            ? t('copy.depositRefunded.body', { amount: formatMoney(cents, 'usd', locale) })
            : n.body,
      };
    }

    default:
      // Staff-facing types (review_received, payout_blocked, booking_*_by_client,
      // client_checked_in, …) and anything new: as stored.
      return stored;
  }
}
