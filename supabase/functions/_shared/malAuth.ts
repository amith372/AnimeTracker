// MAL token exchange + the server-side "get me a valid access token for this user" choke point —
// the Deno equivalent of src/api/malAuthApi.ts + src/auth/authRepository.ts's getValidAccessToken,
// now centralized here since every MAL-proxying function needs it. Concurrency safety against
// MAL's refresh-token rotation lives in Postgres (mal_refresh_token_if_needed, see the Phase 8
// migration), not in this process — this file just calls that RPC.
import { supabaseAdmin } from './supabaseAdmin.ts';

const MAL_TOKEN_URL = 'https://myanimelist.net/v1/oauth2/token';
export const MAL_CLIENT_ID = Deno.env.get('MAL_CLIENT_ID')!;

export interface MalTokenResponse {
  token_type: string;
  expires_in: number;
  access_token: string;
  refresh_token: string;
}

async function postToken(body: Record<string, string>): Promise<MalTokenResponse> {
  const response = await fetch(MAL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  if (!response.ok) throw new Error(`MAL token request failed (HTTP ${response.status})`);
  return response.json();
}

/** First-time exchange of the authorization code from the OAuth redirect — used by mal-oauth-callback. */
export function exchangeAuthorizationCode(params: { code: string; codeVerifier: string; redirectUri: string }): Promise<MalTokenResponse> {
  return postToken({
    client_id: MAL_CLIENT_ID,
    grant_type: 'authorization_code',
    code: params.code,
    code_verifier: params.codeVerifier,
    redirect_uri: params.redirectUri,
  });
}

/**
 * The access token every MAL-proxying function should use for a given user — refreshes server-side
 * (via the DB-locked RPC) if needed, or returns null if the user has no MAL link at all, or if the
 * link is dead and was just cleared (see mal_refresh_token_if_needed's 400/401 handling).
 */
export async function getValidMalAccessToken(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.rpc('mal_refresh_token_if_needed', {
    p_user_id: userId,
    p_client_id: MAL_CLIENT_ID,
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row || !row.mal_linked) return null;
  return row.access_token;
}
