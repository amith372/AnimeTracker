// Orchestrates the MAL login flow — the RN equivalent of the old AuthRepository.kt. One real
// difference from the Kotlin version: Android's Custom Tab flow could kill and relaunch the whole
// Activity while the browser was open, so the code verifier/state had to survive that via
// EncryptedSharedPreferences ("pending auth"). Here, `WebBrowser.openAuthSessionAsync` is a single
// awaited call within one JS function — the verifier/state just live in local variables for its
// duration, no persistence needed.
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import {
  exchangeAuthorizationCode,
  refreshAccessToken as refreshAccessTokenApi,
  TokenRequestError,
} from '@/api/malAuthApi';
import { buildAuthorizeUrl, generateCodeVerifier, generateOAuthState } from '@/domain/pkce';
import * as tokenStore from './tokenStore';

const CLIENT_ID = process.env.EXPO_PUBLIC_MAL_CLIENT_ID ?? '';

export type AuthResult = { success: true } | { success: false; message: string };

/** Opens MAL's login page in an in-app browser tab and waits for the animetracker://auth redirect. */
export async function login(): Promise<AuthResult> {
  const redirectUri = Linking.createURL('auth');
  const codeVerifier = generateCodeVerifier();
  const state = generateOAuthState();
  const authorizeUrl = buildAuthorizeUrl({ clientId: CLIENT_ID, codeVerifier, state, redirectUri });

  const result = await WebBrowser.openAuthSessionAsync(authorizeUrl, redirectUri);
  if (result.type !== 'success') {
    return { success: false, message: 'Login was cancelled.' };
  }

  const { queryParams } = Linking.parse(result.url);
  const error = queryParams?.error;
  const code = queryParams?.code;
  const returnedState = queryParams?.state;
  if (error) {
    return { success: false, message: `MAL rejected the login (${error}).` };
  }
  if (typeof code !== 'string' || returnedState !== state) {
    return { success: false, message: 'Login response was invalid or tampered with.' };
  }

  try {
    const token = await exchangeAuthorizationCode({ clientId: CLIENT_ID, code, codeVerifier, redirectUri });
    await tokenStore.saveTokens(token.access_token, token.refresh_token, token.expires_in);
    // A real login supersedes guest browsing — without this, index.tsx's gate would still see
    // guest mode set and never route a freshly-logged-in user into onboarding/reconcile.
    await tokenStore.setGuestMode(false);
    return { success: true };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : 'Login failed.' };
  }
}

/** "Continue without an account" — see tokenStore.setGuestMode for what this gates. */
export async function continueAsGuest(): Promise<void> {
  await tokenStore.setGuestMode(true);
}

// How long before the stored expiry we stop trusting the access token. MAL's tokens last ~31 days,
// so this costs a refresh a few minutes early at most, and it means a request can't be issued with
// a token that expires while it's in flight.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

// Every refresh in the app funnels through this one slot. It matters because the fetch layer runs
// 6-8 requests concurrently (Discover, Import, Recommendations all use mapWithConcurrency): without
// it, an expired token means eight simultaneous refresh calls, and since MAL *rotates* the refresh
// token on every use, seven of those race on a value the eighth has already invalidated — turning a
// routine refresh into a forced logout. With it, the first caller refreshes and the rest await the
// same promise.
let inFlightRefresh: Promise<AuthResult> | null = null;

/**
 * Refreshes the access token — call this proactively before any authenticated API batch (e.g. the
 * monthly sync). Concurrency-safe: overlapping callers share one underlying token request.
 */
export function refreshAccessToken(): Promise<AuthResult> {
  if (inFlightRefresh) return inFlightRefresh;
  const refresh = doRefresh().finally(() => {
    inFlightRefresh = null;
  });
  inFlightRefresh = refresh;
  return refresh;
}

async function doRefresh(): Promise<AuthResult> {
  const refreshToken = await tokenStore.getRefreshToken();
  if (!refreshToken) return { success: false, message: 'Not logged in.' };
  try {
    const token = await refreshAccessTokenApi({ clientId: CLIENT_ID, refreshToken });
    await tokenStore.saveTokens(token.access_token, token.refresh_token, token.expires_in);
    return { success: true };
  } catch (e) {
    // A refresh token MAL has rejected outright will never work again, so keeping it only produces
    // a screen that looks logged in and fails every request. Clearing it sends the user back
    // through the login gate in app/index.tsx, which is the only thing that can actually fix it.
    // A 5xx or a network error is left alone deliberately — being offline must not log anyone out.
    if (isDeadRefreshToken(e)) {
      await tokenStore.clearTokens();
      return { success: false, message: 'Your MyAnimeList session expired. Please log in again.' };
    }
    return { success: false, message: e instanceof Error ? e.message : 'Token refresh failed.' };
  }
}

function isDeadRefreshToken(e: unknown): boolean {
  return e instanceof TokenRequestError && (e.status === 400 || e.status === 401);
}

/**
 * The access token every authenticated MAL call should use — refreshed first if it's expired or
 * about to be. This exists because the expiry written at login was previously never read back:
 * `isLoggedIn()` only checks that *some* token is stored, so roughly a month after logging in the
 * app still presented itself as signed in while every MAL request failed with a 401, and the only
 * way out was a manual log out and back in. Returns null when there's nothing usable, which
 * surfaces as the same "Not logged in." error the fetch layer already threw.
 *
 * An unknown expiry is treated as usable rather than stale: authFetch's 401 retry is the backstop.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const expiry = await tokenStore.getAccessTokenExpiryEpochMillis();
  if (expiry !== null && Date.now() >= expiry - REFRESH_MARGIN_MS) {
    const result = await refreshAccessToken();
    if (!result.success) return null;
  }
  return tokenStore.getAccessToken();
}

export async function logout(): Promise<void> {
  await tokenStore.clearTokens();
}

export const isLoggedIn = tokenStore.isLoggedIn;

/**
 * React hook wrapper around `isLoggedIn()`. Not a true live query like Drizzle's `useLiveQuery` —
 * SecureStore has no change-notification API — so this only checks once on mount; screens must
 * call the returned `refresh()` themselves right after login/logout complete.
 */
export function useIsLoggedIn(): [boolean | null, () => void] {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const refresh = useCallback(() => {
    tokenStore.isLoggedIn().then(setLoggedIn);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return [loggedIn, refresh];
}

/** Same one-shot-plus-manual-refresh shape as useIsLoggedIn, for the "continue without an
 * account" flag — see tokenStore.setGuestMode. */
export function useIsGuest(): [boolean | null, () => void] {
  const [guest, setGuest] = useState<boolean | null>(null);
  const refresh = useCallback(() => {
    tokenStore.isGuestMode().then(setGuest);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return [guest, refresh];
}
