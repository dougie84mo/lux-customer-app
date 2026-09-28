import { format as dfFormat, formatDistanceToNow, parseISO } from 'date-fns';
import { enUS, es } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { AppLocale, currentLocale } from './i18n';

// Every date, time, money and duration the app shows goes through here, so
// it follows the app language (docs/i18n.md). Never call date-fns `format`
// with a display pattern or build `$` strings in a screen — add a style here.
// (date-fns `format(d, 'yyyy-MM-dd')` for query keys / RPC args is fine:
// that is data, not display.)

const DATE_FNS_LOCALE = { en: enUS, es } as const;

const INTL_TAG: Record<AppLocale, string> = { en: 'en-US', es: 'es-US' };

/** Named display styles. en / es patterns differ in order, not just words. */
const PATTERNS = {
  time: { en: 'h:mm a', es: 'H:mm' }, //                     2:30 PM · 14:30
  date: { en: 'MMM d, yyyy', es: "d 'de' MMM 'de' yyyy" }, // Sep 30, 2026 · 30 de sept de 2026
  dateShort: { en: 'MMM d', es: "d 'de' MMM" }, //           Sep 30 · 30 de sept
  dateLong: { en: 'EEEE, MMMM d, yyyy', es: "EEEE, d 'de' MMMM 'de' yyyy" },
  dateFull: { en: 'MMMM d, yyyy', es: "d 'de' MMMM 'de' yyyy" }, // September 7, 2026
  weekdayDateYear: { en: 'EEE, MMM d, yyyy', es: "EEE d 'de' MMM 'de' yyyy" },
  weekdayDate: { en: 'EEE, MMM d', es: "EEE d 'de' MMM" }, // Tue, Sep 30 · mar 30 de sept
  weekdayDateLong: { en: 'EEEE, MMMM d', es: "EEEE d 'de' MMMM" },
  monthYear: { en: 'MMMM yyyy', es: "MMMM 'de' yyyy" },
  weekday: { en: 'EEE', es: 'EEE' },
  weekdayLong: { en: 'EEEE', es: 'EEEE' },
  monthShort: { en: 'MMM', es: 'MMM' },
  dayOfMonth: { en: 'd', es: 'd' },
} as const;

export type DateStyle = keyof typeof PATTERNS | 'dateTime' | 'weekdayDateTime' | 'weekdayDateYearTime';

type DateInput = Date | string | number;
const toDate = (d: DateInput) => (typeof d === 'string' ? parseISO(d) : new Date(d));

export function formatDate(d: DateInput, style: DateStyle, locale: AppLocale = currentLocale()): string {
  const date = toDate(d);
  if (style === 'dateTime') return `${formatDate(date, 'date', locale)} · ${formatDate(date, 'time', locale)}`;
  if (style === 'weekdayDateTime') {
    return `${formatDate(date, 'weekdayDate', locale)} · ${formatDate(date, 'time', locale)}`;
  }
  if (style === 'weekdayDateYearTime') {
    return `${formatDate(date, 'weekdayDateYear', locale)} · ${formatDate(date, 'time', locale)}`;
  }
  return dfFormat(date, PATTERNS[style][locale], { locale: DATE_FNS_LOCALE[locale] });
}

/** "5 minutes ago" / "hace 5 minutos". */
export function fromNow(d: DateInput, locale: AppLocale = currentLocale()): string {
  return formatDistanceToNow(toDate(d), { addSuffix: true, locale: DATE_FNS_LOCALE[locale] });
}

/** Minor units → "$1,234.56". */
export function formatMoney(cents: number, currency = 'usd', locale: AppLocale = currentLocale()): string {
  return new Intl.NumberFormat(INTL_TAG[locale], {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

/** A catalogue price: "$25" when whole, "$25.50" otherwise. Takes dollars,
 *  the unit services / policy fees are stored in. Charges, receipts and
 *  anything summed use formatMoney (always two decimals). */
export function formatPrice(dollars: number, currency = 'usd', locale: AppLocale = currentLocale()): string {
  const cents = Math.round(dollars * 100);
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat(INTL_TAG[locale], {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(cents / 100);
}

/** 45 → "45 min"; 90 → "1 hr 30 min" / "1 h 30 min". */
export function formatDuration(minutes: number, locale: AppLocale = currentLocale()): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hr = locale === 'es' ? 'h' : 'hr';
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} ${hr}` : `${h} ${hr} ${m} min`;
}

/** The formatters bound to the current language. Using the hook (rather than
 *  the bare functions) re-renders the component when the language changes. */
export function useFormat() {
  const { i18n } = useTranslation();
  const locale = (i18n.language === 'es' ? 'es' : 'en') as AppLocale;
  return {
    locale,
    date: (d: DateInput, style: DateStyle) => formatDate(d, style, locale),
    fromNow: (d: DateInput) => fromNow(d, locale),
    money: (cents: number, currency?: string) => formatMoney(cents, currency, locale),
    price: (dollars: number, currency?: string) => formatPrice(dollars, currency, locale),
    duration: (minutes: number) => formatDuration(minutes, locale),
  };
}
