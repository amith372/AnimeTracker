import { buildAuthorizeUrl, generateCodeVerifier, generateOAuthState, type RandomBytes } from '@/domain/pkce';

// jest-expo mocks the native crypto module with all-zero bytes, so tests that care about
// distinctness inject a real (Node-backed) random source instead, mirroring how the Kotlin
// version's tests passed an explicit `SecureRandom()` instance.
const nodeRandomBytes: RandomBytes = (length) => {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
};

describe('generateCodeVerifier', () => {
  test("is within MAL's required 43 to 128 char range", () => {
    const verifier = generateCodeVerifier(nodeRandomBytes);
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });
});

describe('generateOAuthState', () => {
  test('two generated states are not equal', () => {
    expect(generateOAuthState(nodeRandomBytes)).not.toBe(generateOAuthState(nodeRandomBytes));
  });
});

describe('buildAuthorizeUrl', () => {
  test('uses the plain PKCE method with code_challenge equal to the verifier', () => {
    const url = buildAuthorizeUrl({
      clientId: 'abc123',
      codeVerifier: 'verifier-value',
      state: 'state-value',
      redirectUri: 'animetracker://auth',
    });

    expect(url.startsWith('https://myanimelist.net/v1/oauth2/authorize?')).toBe(true);
    expect(url).toContain('code_challenge=verifier-value');
    expect(url).toContain('code_challenge_method=plain');
    expect(url).toContain('client_id=abc123');
    expect(url).toContain('state=state-value');
    expect(url).toContain('redirect_uri=animetracker%3A%2F%2Fauth');
  });
});
