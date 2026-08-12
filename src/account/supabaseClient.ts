// Supabase client singleton — the app's one and only data backend (direct-Postgres cutover: there
// is no local SQLite mirror anymore, see CLAUDE.md's "What this is"). Both env vars are safe to
// expose in the client bundle: RLS policies, not key secrecy, are what protect a user's rows (see
// CLAUDE.md Setup/secrets) — unlike the MAL Client ID, which stays server-only.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// True once the project has real Supabase credentials filled in .env — lets callers (and the
// login screen) treat "no backend configured yet" as a distinct, expected state during Phase 7
// rather than crashing on an empty URL.
export const isSupabaseConfigured = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;

// AsyncStorage, not expo-secure-store: a Supabase session (access + refresh JWT + user metadata)
// can run a few KB, past SecureStore's ~2048-byte per-item limit on some Android versions. This is
// Supabase's own documented recommendation for React Native. It's a materially lower-value secret
// than the MAL refresh token anyway — MAL custody moves fully server-side in Phase 8, and Supabase
// sessions are short-lived and rotate via refresh, same trust level as any other web session token.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
