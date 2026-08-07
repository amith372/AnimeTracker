// Service-role Supabase client for Edge Functions — bypasses RLS, so this must never be exposed
// to a client. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically into every
// Edge Function's environment by Supabase (no need to set them as custom secrets).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

/**
 * Resolves the calling user's id from the request's `Authorization: Bearer <supabase jwt>` header,
 * or null if absent/invalid. Used by mal-oauth-start to tell the linking variant (a signed-in user
 * adding MAL) from the sign-in variant (no session yet — "Continue with MyAnimeList" itself).
 */
export async function getRequestUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length);
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}
