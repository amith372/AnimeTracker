// Encrypted local storage for OAuth tokens — the RN equivalent of the old TokenStore.kt's
// EncryptedSharedPreferences wrapper. expo-secure-store is backed by Android Keystore / iOS
// Keychain, so tokens never touch plain storage. Unlike SharedPreferences, SecureStore has no
// synchronous read, so every call here is async — callers must await it.
import * as SecureStore from 'expo-secure-store';

const KEY_ACCESS_TOKEN = 'mal_access_token';
const KEY_REFRESH_TOKEN = 'mal_refresh_token';
const KEY_EXPIRY_EPOCH_MILLIS = 'mal_access_token_expiry_epoch_millis';
const KEY_GUEST_MODE = 'guest_mode_enabled';

/** Persists a fresh token pair plus a computed expiry, after either login or a refresh. */
export async function saveTokens(accessToken: string, refreshToken: string, expiresInSeconds: number): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(KEY_ACCESS_TOKEN, accessToken),
    SecureStore.setItemAsync(KEY_REFRESH_TOKEN, refreshToken),
    SecureStore.setItemAsync(KEY_EXPIRY_EPOCH_MILLIS, String(Date.now() + expiresInSeconds * 1000)),
  ]);
}

export function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_ACCESS_TOKEN);
}

export function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_REFRESH_TOKEN);
}

/**
 * When the stored access token stops being accepted, as epoch millis — `null` when unknown, which
 * covers both "not logged in" and a token pair saved before this value was ever read (it has been
 * *written* since Phase 2, just never consulted). Callers must treat `null` as "can't tell", not as
 * "expired": the 401-retry path in authFetch is what covers that case.
 */
export async function getAccessTokenExpiryEpochMillis(): Promise<number | null> {
  const raw = await SecureStore.getItemAsync(KEY_EXPIRY_EPOCH_MILLIS);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function isLoggedIn(): Promise<boolean> {
  return (await getAccessToken()) !== null;
}

/** Wipes all stored auth state — used by logout. */
export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEY_ACCESS_TOKEN),
    SecureStore.deleteItemAsync(KEY_REFRESH_TOKEN),
    SecureStore.deleteItemAsync(KEY_EXPIRY_EPOCH_MILLIS),
  ]);
}

/**
 * "Continue without an account" — lets the Library gate in app/index.tsx skip straight to an
 * empty local library instead of forcing MAL login. Stored the same way as the tokens themselves
 * (SecureStore, not a DB row) so it survives independently of whatever's in the SQLite library.
 */
export async function setGuestMode(enabled: boolean): Promise<void> {
  if (enabled) await SecureStore.setItemAsync(KEY_GUEST_MODE, '1');
  else await SecureStore.deleteItemAsync(KEY_GUEST_MODE);
}

export async function isGuestMode(): Promise<boolean> {
  return (await SecureStore.getItemAsync(KEY_GUEST_MODE)) !== null;
}
