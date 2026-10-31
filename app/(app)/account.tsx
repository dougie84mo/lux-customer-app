import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Avatar, Dialog, List, Portal, RadioButton, Text, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { NotificationBell } from '@/components/NotificationBell';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useMyProfile } from '@/lib/clientProfile';
import { useMyMemberships } from '@/lib/businesses';
import { openBusinessApp } from '@/lib/companionApp';
import { avatarUrl, initialsOf } from '@/lib/avatars';
import { deviceLocale } from '@/lib/i18n';
import { LanguagePref, useLanguagePref } from '@/lib/localeSync';

// Account — the one hub, laid out like the business app's Settings tab: flat
// sectioned rows on the background, each opening its own screen. The former
// second-level Settings screen was folded in here (2026-10-30). Language is
// the one choice made right here, in a dialog.
function AccountScreen() {
  const theme = useTheme();
  const { t } = useTranslation(['account', 'common']);
  const { session } = useAuth();
  const userId = session?.user.id;
  const { data: profile } = useMyProfile(userId);
  // Only users who also belong to a business see the "open business app" link.
  const { data: memberships } = useMyMemberships(userId);
  const isBusinessUser = (memberships?.length ?? 0) > 0;
  const version = Constants.expoConfig?.version;
  const { pref, setPref } = useLanguagePref();
  const [languageOpen, setLanguageOpen] = useState(false);

  const languageLabel =
    pref === 'system'
      ? t('common:language.systemWithValue', { language: t(`common:language.${deviceLocale()}`) })
      : t(`common:language.${pref}`);

  const chooseLanguage = (p: LanguagePref) => {
    setLanguageOpen(false);
    setPref(p);
  };

  const avatar = avatarUrl(profile?.avatar_path);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header mode="small" elevated>
        <Appbar.Content title={t('hub.title')} />
        <NotificationBell />
      </Appbar.Header>

      <ScrollView contentContainerStyle={{ paddingVertical: 8 }}>
        <List.Section>
          {/* Per-person: the subheader names the signed-in client, the way the
              business app's names the active business. */}
          <List.Subheader numberOfLines={1}>{profile?.name ?? t('hub.yourAccount')}</List.Subheader>
          <List.Item
            title={t('hub.profile')}
            description={profile?.email ?? t('hub.profileDescription')}
            left={() => (
              <View style={styles.avatarSlot}>
                {avatar ? (
                  <Avatar.Image size={40} source={{ uri: avatar }} />
                ) : (
                  <Avatar.Text size={40} label={initialsOf(profile?.name)} />
                )}
              </View>
            )}
            right={(p) => <List.Icon {...p} icon="chevron-right" />}
            onPress={() => router.push('/(app)/profile')}
          />
          <List.Item
            title={t('hub.favorites')}
            description={t('hub.favoritesDescription')}
            left={(p) => <List.Icon {...p} icon="heart-outline" />}
            right={(p) => <List.Icon {...p} icon="chevron-right" />}
            onPress={() => router.push('/(app)/favorites')}
          />
          <List.Item
            title={t('hub.payments')}
            description={t('hub.paymentsDescription')}
            left={(p) => <List.Icon {...p} icon="receipt" />}
            right={(p) => <List.Icon {...p} icon="chevron-right" />}
            onPress={() => router.push('/(app)/receipts')}
          />
          <List.Item
            title={t('hub.myPhotos')}
            description={t('hub.myPhotosDescription')}
            left={(p) => <List.Icon {...p} icon="image-multiple-outline" />}
            right={(p) => <List.Icon {...p} icon="chevron-right" />}
            onPress={() => router.push('/(app)/my-photos')}
          />
        </List.Section>

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
          {isBusinessUser && (
            <List.Item
              title={t('hub.businessApp')}
              description={t('hub.businessAppDescription')}
              left={(p) => <List.Icon {...p} icon="briefcase-outline" />}
              right={(p) => <List.Icon {...p} icon="open-in-new" />}
              onPress={openBusinessApp}
            />
          )}
        </List.Section>

        <List.Section>
          <List.Item
            title={t('hub.signOut')}
            titleStyle={{ color: theme.colors.error }}
            left={(p) => <List.Icon {...p} icon="logout" color={theme.colors.error} />}
            onPress={() => supabase.auth.signOut()}
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
            <RadioButton.Group value={pref} onValueChange={(v) => chooseLanguage(v as LanguagePref)}>
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
  // Same footprint as List.Icon (40 wide, 16 left margin, centred) so the
  // avatar row lines up with the icon rows beneath it.
  avatarSlot: { width: 40, marginLeft: 16, alignItems: 'center', justifyContent: 'center' },
  footer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
});

export default withScreenErrorBoundary(AccountScreen);
