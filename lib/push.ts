import { useEffect } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { useAuth } from './auth';
import { supabase } from './supabase';

// IMPORTANT: do NOT statically `import 'expo-notifications'`. Merely importing
// it runs DevicePushTokenAutoRegistration, which throws in Expo Go on SDK 53+
// ("remote notifications removed from Expo Go"). Push is a dev-build-only
// feature, so we detect Expo Go and lazy-require the module only when we're in
// a real build.
function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

function platformTag(): 'ios' | 'android' | 'web' | 'unknown' {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'web') return 'web';
  return 'unknown';
}

// EAS project id — Expo push tokens are project-scoped. Populated when the EAS
// project is created at the dev-build step; until then registration no-ops.
function easProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as any).easConfig?.projectId
  );
}

/**
 * Acquire an Expo push token and upsert it for the signed-in user. Returns the
 * token, or null if registration couldn't complete (Expo Go, simulator, denied
 * permission, no project id yet, etc.). Never throws — push is best-effort.
 */
export async function registerForPushNotifications(userId: string): Promise<string | null> {
  try {
    // Expo Go can't do remote push (SDK 53+). Bail before touching the module.
    if (isExpoGo()) return null;
    if (!Device.isDevice) return null;

    // Lazy-load only outside Expo Go so the auto-registration side-effect never
    // runs in Expo Go.
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return null;

    const projectId = easProjectId();
    if (!projectId) return null; // no EAS project yet (pre dev-build)

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResponse.data;
    if (!token) return null;

    const { error } = await supabase.from('user_push_tokens').upsert(
      {
        user_id: userId,
        token,
        platform: platformTag(),
        device_name: Device.deviceName ?? null,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'token' },
    );
    if (error) {
      console.warn('push token upsert failed', error.message);
      return null;
    }

    return token;
  } catch (err) {
    console.warn('push registration skipped', err);
    return null;
  }
}

/**
 * Clear the OS notification shade + app-icon badge. On Android the launcher
 * badge is tray-driven (it counts the cards in the notification shade), so
 * dismissing delivered notifications is what actually clears the icon badge;
 * setBadgeCountAsync(0) is belt-and-suspenders for OEMs that honour it. Call
 * when the user views their notifications in-app. No-ops in Expo Go.
 */
export async function clearDeliveredNotifications(): Promise<void> {
  try {
    if (isExpoGo() || !Device.isDevice) return;
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');
    await Notifications.dismissAllNotificationsAsync();
    await Notifications.setBadgeCountAsync(0);
  } catch (err) {
    console.warn('clear notifications skipped', err);
  }
}

/**
 * Registers for push whenever there's an authenticated session. No-ops in Expo
 * Go and until the EAS project exists. Mount once near the authenticated root.
 */
export function usePushNotifications() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const qc = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    registerForPushNotifications(userId);

    // Consume incoming push (Dev Client only; no-ops in Expo Go). A received
    // notification refreshes the in-app feed; tapping one opens the notification
    // center. The same lifecycle events also land as in-app rows via DB triggers
    // (migration 0033), so the feed is correct even without push delivery.
    if (isExpoGo() || !Device.isDevice) return;
    let receivedSub: { remove: () => void } | undefined;
    let responseSub: { remove: () => void } | undefined;
    try {
      const Notifications = require('expo-notifications') as typeof import('expo-notifications');
      const refresh = () => {
        qc.invalidateQueries({ queryKey: ['notifications', userId] });
        qc.invalidateQueries({ queryKey: ['notifications-unread', userId] });
      };
      receivedSub = Notifications.addNotificationReceivedListener(refresh);
      responseSub = Notifications.addNotificationResponseReceivedListener(() => {
        refresh();
        router.push('/(app)/notifications');
      });
    } catch (err) {
      console.warn('push listeners skipped', err);
    }
    return () => {
      receivedSub?.remove();
      responseSub?.remove();
    };
  }, [userId, qc]);
}
