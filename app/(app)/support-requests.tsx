import { useCallback } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Appbar, Badge, Button, Card, Chip, Text, useTheme } from 'react-native-paper';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { useManualRefresh } from '@/hooks/use-manual-refresh';
import { useAuth } from '@/lib/auth';
import { useFormat } from '@/lib/format';
import { tMessage } from '@/lib/i18n';
import { SUPPORT_CATEGORIES, SupportCategory } from '@/lib/schemas';
import { SupportRequestState, SupportThreadSummary, useMySupportThreads } from '@/lib/support';

const isKnownCategory = (c: string): c is SupportCategory =>
  (SUPPORT_CATEGORIES as readonly string[]).includes(c);

// My requests — the messages this person sent to LUX support, where each one
// stands, and whether LUX Support has replied since they last looked
// (my_support_threads, 0268). Tapping one opens the conversation
// (support-thread). Identical in both apps.
function SupportRequestsScreen() {
  const theme = useTheme();
  const { t } = useTranslation(['account', 'common']);
  const f = useFormat();
  const { session } = useAuth();
  const { data, isLoading, error, refetch } = useMySupportThreads(session?.user.id);
  const { refreshing, onRefresh } = useManualRefresh(refetch);

  // Tab screens stay mounted: a reply since the last visit has to show
  // without a pull.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const stateColor: Record<SupportRequestState, string> = {
    new: theme.colors.primary,
    answered: theme.dark ? '#66bb6a' : '#2e7d32',
    resolved: theme.colors.onSurfaceVariant,
  };

  const renderItem = ({ item }: { item: SupportThreadSummary }) => {
    const color = stateColor[item.state];
    return (
      <Card
        style={styles.card}
        onPress={() => router.push({ pathname: '/(app)/support-thread', params: { id: item.id } })}
      >
        <Card.Content>
          <View style={styles.headerRow}>
            {item.unread && <Badge size={10} style={styles.dot} />}
            <Text variant="titleSmall" style={styles.category} numberOfLines={1}>
              {isKnownCategory(item.category)
                ? t(`support.categories.${item.category}`)
                : t('support.categories.general')}
            </Text>
            <Chip compact textStyle={{ color, fontSize: 12 }} style={{ backgroundColor: color + '22' }}>
              {t(`support.requests.state.${item.state}`)}
            </Chip>
          </View>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {t('support.requests.sent', { when: f.date(item.created_at, 'dateTime') })}
          </Text>
          <Text variant="bodyMedium" style={styles.message} numberOfLines={2}>
            {item.message}
          </Text>
          <Text
            variant="bodySmall"
            style={[
              styles.hint,
              { color: item.unread ? theme.colors.primary : theme.colors.onSurfaceVariant },
            ]}
          >
            {item.unread
              ? t('support.requests.hint.unread')
              : item.reply_count > 0
                ? t('support.requests.hint.replies', { count: item.reply_count })
                : t(`support.requests.hint.${item.state}`)}
          </Text>
        </Card.Content>
      </Card>
    );
  };

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={t('support.requests.title')} />
      </Appbar.Header>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text variant="bodyMedium" style={{ color: theme.colors.error, textAlign: 'center' }}>
            {tMessage(error.message)}
          </Text>
          <Button mode="text" onPress={() => refetch()} style={styles.action}>
            {t('common:actions.retry')}
          </Button>
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(r) => r.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text
                variant="bodyMedium"
                style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}
              >
                {t('support.requests.empty')}
              </Text>
              <Button
                mode="contained"
                icon="email-outline"
                onPress={() => router.push('/(app)/support')}
                style={styles.action}
              >
                {t('support.contact')}
              </Button>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: 16, gap: 8, flexGrow: 1 },
  card: { marginBottom: 0 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  dot: { alignSelf: 'center' },
  category: { fontWeight: '700', flex: 1 },
  message: { marginTop: 8 },
  hint: { marginTop: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  action: { marginTop: 16 },
});

export default withScreenErrorBoundary(SupportRequestsScreen);
