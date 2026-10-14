// Plan 6 step 3's resolution order. Every expectation is derived from the four rules in
// prd/3-welcome-greeting.md, not from running the implementation.
import { resolveDisplayName } from '../src/domain/displayName';

const none = { isAnonymous: false, malUsername: null, email: null };

describe('resolveDisplayName', () => {
  it('prefers the MAL username — the name the user actually chose', () => {
    expect(resolveDisplayName({ ...none, malUsername: 'amith372', email: 'amith9435@gmail.com' })).toBe('amith372');
  });

  // Settled 2026-10-14. Once MAL is linked the session is identifiable, and of two true answers
  // the name is the informative one.
  it('greets a guest who linked MAL by name, not as "Guest"', () => {
    expect(resolveDisplayName({ isAnonymous: true, malUsername: 'amith372', email: null })).toBe('amith372');
  });

  it('falls back to the email local-part', () => {
    expect(resolveDisplayName({ ...none, email: 'amith9435@gmail.com' })).toBe('amith9435');
  });

  // The whole point of the feature: this address is a placeholder minted by mal-oauth-callback
  // because MAL exposes no email. Showing it would be worse than showing nothing.
  it('never shows the synthetic MAL placeholder address', () => {
    expect(resolveDisplayName({ ...none, email: 'mal-123456@mal-users.animetracker.app' })).toBeNull();
  });

  it('still says "Guest" for an anonymous session carrying that placeholder', () => {
    expect(
      resolveDisplayName({ isAnonymous: true, malUsername: null, email: 'mal-999@mal-users.animetracker.app' }),
    ).toBe('Guest');
  });

  it('says "Guest" for a plain anonymous session', () => {
    expect(resolveDisplayName({ isAnonymous: true, malUsername: null, email: null })).toBe('Guest');
  });

  // Not "Guest": that would be a lie about a permanent account. The caller renders "Welcome back".
  it('returns null for a real account with no usable name', () => {
    expect(resolveDisplayName(none)).toBeNull();
  });

  it('treats blank and whitespace-only values as absent', () => {
    expect(resolveDisplayName({ ...none, malUsername: '   ', email: 'amith@x.com' })).toBe('amith');
    expect(resolveDisplayName({ isAnonymous: true, malUsername: '', email: '  ' })).toBe('Guest');
    expect(resolveDisplayName({ ...none, email: '@nolocal.com' })).toBeNull();
  });

  it('trims a padded MAL username rather than rendering the padding', () => {
    expect(resolveDisplayName({ ...none, malUsername: '  amith372  ' })).toBe('amith372');
  });
});
