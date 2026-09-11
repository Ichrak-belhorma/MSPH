import * as SecureStore from "expo-secure-store";

/**
 * Refresh-token persistence — `expo-secure-store` (iOS Keychain / Android
 * Keystore), the mobile equivalent of the desktop's Electron `safeStorage`
 * bridge (see CONTEXT.md, apps/desktop/electron/secureStorage.cts).
 * Deliberately not AsyncStorage: that's plain unencrypted on-device
 * storage, the wrong place for a long-lived credential.
 */
const REFRESH_TOKEN_KEY = "msph.refreshToken";

export async function loadRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function saveRefreshToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
  } catch {
    // Best-effort: a device without secure storage support just won't
    // resume a session across app restarts — it can still log in fresh.
  }
}

export async function clearRefreshToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    // Ignore — nothing to clean up either way.
  }
}
