// Bundled translations. One JSON per namespace per language; en is the
// source of truth for keys (and types, see i18next.d.ts), es must match it
// key for key (`npm run i18n:check`). Conventions: docs/i18n.md.
import enAccount from './en/account.json';
import enAuth from './en/auth.json';
import enBooking from './en/booking.json';
import enCommon from './en/common.json';
import enDiscover from './en/discover.json';
import enInbox from './en/inbox.json';
import enPayments from './en/payments.json';
import enPhotos from './en/photos.json';
import esAccount from './es/account.json';
import esAuth from './es/auth.json';
import esBooking from './es/booking.json';
import esCommon from './es/common.json';
import esDiscover from './es/discover.json';
import esInbox from './es/inbox.json';
import esPayments from './es/payments.json';
import esPhotos from './es/photos.json';

export const NAMESPACES = ['common', 'auth', 'discover', 'booking', 'payments', 'account', 'inbox', 'photos'] as const;

const en = {
  common: enCommon,
  auth: enAuth,
  discover: enDiscover,
  booking: enBooking,
  payments: enPayments,
  account: enAccount,
  inbox: enInbox,
  photos: enPhotos,
};

// Typed against en so a missing Spanish namespace fails the type check;
// missing keys inside one are caught by the parity script.
const es: Record<keyof typeof en, object> = {
  common: esCommon,
  auth: esAuth,
  discover: esDiscover,
  booking: esBooking,
  payments: esPayments,
  account: esAccount,
  inbox: esInbox,
  photos: esPhotos,
};

export const resources = { en, es };
export type EnResources = typeof en;
