// A plain (non-admin) client, used only by mal-session-exchange to call auth.verifyOtp — that
// call needs to run as a normal client, not the service role, so it produces a real user session
// rather than an admin-privileged one. SUPABASE_ANON_KEY is auto-injected, same as SUPABASE_URL.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const supabaseAnon = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_ANON_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
