import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Dialog, List, Portal, RadioButton, Text, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { deviceLocale } from '@/lib/i18n';
import { LanguagePref, useLanguagePref } from '@/lib/localeSync';

// Settings — a hub, laid out like the business app's: sectioned rows that
// each open their own screen. The forms themselves live on the sub-screens
// (settings-notifications, settings-photos, settings-account). Language is
// the one choice made right here, in a dialog.
function SettingsScreen() {
  const theme = useTheme();
  const { t } = useTranslation(['account', 'common']);
  const version = Constants.expoConfig?.version;
  const { pref, setPref } = useLanguagePref();
  const [languageOpen, setLanguageOpen] = useState(false);

  const languageLabel =
    pref === 'system'
      ? t('common:language.systemWithValue', { language: t(`common:language.${deviceLocale()}`) })
      : t(`common:language.${pref}`);

  const choose = (p: LanguagePref) => {
    setLanguageOpen(false);
    setPref(p);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={t('settings.title')} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={{ paddingVertical: 8 }}>
        <List.Section>
          <List.Subheader>{t('settings.preferences')}</List.Subheader>
          <List.Item
            title={t('settings.notifications')}
            description={t('settings.notificationsDescription')}
            left={(p) => <List.Icon {...p} icon="bell-outline" />}
            right={(p) => <List.Icon {...p} icon="chevron-right" />}
            onPress={() => router.push('/(app)/settings-notifications')}
          />
          {/* Mirror photo consent (0167): one switch per salon. */}
          <List.Item
            title={t('settings.mirrorPhotos')}
            description={t('settings.mirrorPhotosDescription')}
            left={(p) => <List.Icon {...p} icon="camera-account" />}
            right={(p) => <List.Icon {...p} icon="chevron-right" />}
            onPress={() => router.push('/(app)/settings-photos')}
          />
          <List.Item
            title={t('common:language.title')}
            description={languageLabel}
            left={(p) => <List.Icon {...p} icon="translate" />}
            right={(p) => <List.Icon {...p} icon="chevron-right" />}
            onPress={() => setLanguageOpen(true)}
          />
        </List.Section>

        <List.Section>
          <List.Subheader>{t('settings.account')}</List.Subheader>
          <List.Item
            title={t('settings.accountSignIn')}
            description={t('settings.accountSignInDescription')}
            left={(p) => <List.Icon {...p} icon="account-circle-outline" />}
            right={(p) => <List.Icon {...p} icon="chevron-right" />}
            onPress={() => router.push('/(app)/settings-account')}
          />
          <List.Item
            title={t('settings.privacyPolicy')}
            left={(p) => <List.Icon {...p} icon="shield-account-outline" />}
            right={(p) => <List.Icon {...p} icon="chevron-right" />}
            onPress={() => router.push('/(app)/legal/privacy')}
          />
          <List.Item
            title={t('settings.termsOfService')}
            left={(p) => <List.Icon {...p} icon="file-document-outline" />}
            right={(p) => <List.Icon {...p} icon="chevron-right" />}
            onPress={() => router.push('/(app)/legal/terms')}
          />
        </List.Section>

        <View style={styles.footer}>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
            LUX Booking{version ? ` · v${version}` : ''}
          </Text>
        </View>
      </ScrollView>

      <Portal>
        <Dialog visible={languageOpen} onDismiss={() => setLanguageOpen(false)}>
          <Dialog.Title>{t('common:language.title')}</Dialog.Title>
          <Dialog.Content>
            <RadioButton.Group value={pref} onValueChange={(v) => choose(v as LanguagePref)}>
              <RadioButton.Item
                value="system"
                label={t('common:language.systemWithValue', {
                  language: t(`common:language.${deviceLocale()}`),
                })}
              />
              {/* Each language is named in itself, so it's findable from either. */}
              <RadioButton.Item value="en" label={t('common:language.en')} />
              <RadioButton.Item value="es" label={t('common:language.es')} />
            </RadioButton.Group>
          </Dialog.Content>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
});

export default withScreenErrorBoundary(SettingsScreen);
