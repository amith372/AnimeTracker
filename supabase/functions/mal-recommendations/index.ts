// Proxies MAL's `?fields=recommendations` read — public, same reasoning as mal-anime-detail.
import { malGetPublic } from '../_shared/malProxy.ts';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();
  try {
    const { id } = await req.json();
    if (typeof id !== 'number') return jsonResponse({ error: 'id must be a number' }, 400);
    const data = await malGetPublic(`anime/${id}`, { fields: 'recommendations' });
    return jsonResponse(data);
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'mal-recommendations failed' }, 500);
  }
});
