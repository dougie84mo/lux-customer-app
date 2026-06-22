import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

// Cross-platform key/value storage used for non-secret app preferences
// (current business selection, future user prefs).
//
// SecureStore on native (encrypted, always available in Expo Go), AsyncStorage
// on web (SecureStore isn't a web API). Mirrors the same conditional in
// supabase.ts that holds the auth session, so we don't depend on the
// AsyncStorage native module on native — its 3.x package version is
// incompatible with the version bundled into Expo SDK 54 / Expo Go and
// throws "Native module is null, cannot access legacy storage" on read.
//
// SecureStore key constraint: only `[A-Za-z0-9._-]` are allowed. Use
// dot-separated keys (e.g. `lux.currentBusinessId`), not colon-separated.
type Kv = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

export const kvStorage: Kv =
  Platform.OS === 'web'
    ? {
        getItem: (k) => AsyncStorage.getItem(k),
        setItem: (k, v) => AsyncStorage.setItem(k, v),
        removeItem: (k) => AsyncStorage.removeItem(k),
      }
    : {
        getItem: (k) => SecureStore.getItemAsync(k),
        setItem: (k, v) => SecureStore.setItemAsync(k, v),
        removeItem: (k) => SecureStore.deleteItemAsync(k),
      };
