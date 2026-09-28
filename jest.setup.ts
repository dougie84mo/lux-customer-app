// Tests render in English with the real dictionaries, so assertions like
// getByText('Pay now') keep testing the copy users see. Resources are
// bundled, so changeLanguage applies synchronously.
import i18n from '@/lib/i18n';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

i18n.changeLanguage('en');
