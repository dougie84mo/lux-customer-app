// Type-safe translation keys: t('booking:…') only accepts keys that exist in
// the English JSON. A typo or a key removed from en.json fails `tsc`.
import 'i18next';
import type { EnResources } from '@/locales';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: EnResources;
  }
}
