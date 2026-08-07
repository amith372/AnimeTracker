// Fetch wrapper for MAL's OAuth2 token endpoint — the RN equivalent of the old MalAuthApi.kt
// Retrofit interface. Both calls (initial exchange, refresh) hit the same endpoint with a
// different grant_type, so they share one form-encoded POST helper.
const MAL_TOKEN_URL = 'https://myanimelist.net/v1/oauth2/token';

/** Mirrors MAL's token response JSON shape exactly (snake_case, as MAL sends it over the wire). */
export interface TokenResponseDto {
  token_type: string;
  expires_in: number;
  access_token: string;
  refresh_token: string;
}

/**
 * Carries MAL's HTTP status alongside the message, because the caller has to tell two very
 * different failures apart: a 400/401 means the refresh token itself is dead (revoked, or already
 * rotated away) and the user genuinely has to log in again, whereas a 5xx or a network throw is
 * transient and must not cost anyone their session. See isDeadRefreshToken in authRepository.
 */
export class TokenRequestError extends Error {
  constructor(readonly status: number) {
    super(`MAL token request failed (HTTP ${status})`);
    this.name = 'TokenRequestError';
  }
}

async function postToken(body: Record<string, string>): Promise<TokenResponseDto> {
  const response = await fetch(MAL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: Object.entries(body)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&'),
  });
  if (!response.ok) {
    throw new TokenRequestError(response.status);
  }
  return response.json();
}

/** Exchanges the authorization code + PKCE verifier from the login redirect for tokens. */
export function exchangeAuthorizationCode(params: {
  clientId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<TokenResponseDto> {
  return postToken({
    client_id: params.clientId,
    grant_type: 'authorization_code',
    code: params.code,
    code_verifier: params.codeVerifier,
    redirect_uri: params.redirectUri,
  });
}

/** Exchanges a stored refresh token for a fresh access/refresh token pair. */
export function refreshAccessToken(params: { clientId: string; refreshToken: string }): Promise<TokenResponseDto> {
  return postToken({
    client_id: params.clientId,
    grant_type: 'refresh_token',
    refresh_token: params.refreshToken,
  });
}
