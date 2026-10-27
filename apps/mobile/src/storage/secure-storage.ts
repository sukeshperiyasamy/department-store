/**
 * Platform-secure storage abstraction for mobile credentials.
 *
 * Uses Expo SecureStore on native iOS Keychain & Android KeyStore.
 * Falls back safely to an in-memory storage driver in web and unit test environments.
 *
 * Security Rules:
 * - Never log secrets, passwords, or session tokens.
 * - Clear all stored credentials explicitly on logout or session revocation.
 */

let SecureStore: typeof import("expo-secure-store") | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  SecureStore = require("expo-secure-store");
} catch {
  SecureStore = null;
}

const memoryStore = new Map<string, string>();

export const STORAGE_KEYS = {
  SESSION_SID: "ds_mobile_sid",
  USER_ID: "ds_mobile_user_id",
  ACTIVE_TENANT_ID: "ds_mobile_active_tenant_id",
} as const;

export async function setSecureItem(key: string, value: string): Promise<void> {
  if (SecureStore && typeof SecureStore.setItemAsync === "function") {
    try {
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      return;
    } catch {
      // Fall through to memory store if hardware keystore fails or in mock mode
    }
  }
  memoryStore.set(key, value);
}

export async function getSecureItem(key: string): Promise<string | null> {
  if (SecureStore && typeof SecureStore.getItemAsync === "function") {
    try {
      const val = await SecureStore.getItemAsync(key);
      if (val !== null) return val;
    } catch {
      // Fall through to memory store
    }
  }
  return memoryStore.get(key) ?? null;
}

export async function deleteSecureItem(key: string): Promise<void> {
  if (SecureStore && typeof SecureStore.deleteItemAsync === "function") {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Ignore
    }
  }
  memoryStore.delete(key);
}

export async function clearAllSecureCredentials(): Promise<void> {
  await Promise.all([
    deleteSecureItem(STORAGE_KEYS.SESSION_SID),
    deleteSecureItem(STORAGE_KEYS.USER_ID),
    deleteSecureItem(STORAGE_KEYS.ACTIVE_TENANT_ID),
  ]);
  memoryStore.clear();
}
