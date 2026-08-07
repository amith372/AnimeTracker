// Shared CORS headers — every function needs these since the web client (Phase 12) calls these
// from a browser origin, and Supabase's own function gateway doesn't add CORS headers for you.
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Every function starts its handler with `if (req.method === 'OPTIONS') return handleOptions();`. */
export function handleOptions(): Response {
  return new Response('ok', { headers: corsHeaders });
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
