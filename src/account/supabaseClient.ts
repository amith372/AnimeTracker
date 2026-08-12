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
//
// createClient throws synchronously ("supabaseUrl is required") on a blank URL — which would
// crash the whole module graph before app/_layout.tsx's isSupabaseConfigured gate ever gets a
// chance to render its "backend not configured" screen. A syntactically valid placeholder host
// keeps construction from throwing; isSupabaseConfigured (above) is what actually gates whether
// this client is ever called, so the placeholder is never dialed. (Hit for real, 2026-08-12: a
// Render deploy without EXPO_PUBLIC_SUPABASE_URL/EXPO_PUBLIC_SUPABASE_ANON_KEY set as *build-time*
// environment variables — not just present in the gitignored local .env — reproduced exactly this
// crash. Expo bakes EXPO_PUBLIC_ vars into the bundle at build time, so they must be set in
// Render's own dashboard env config too, not only locally.)
export const supabase = createClient(SUPABASE_URL || 'https://placeholder.supabase.co', SUPABASE_ANON_KEY || 'placeholder-anon-key', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
