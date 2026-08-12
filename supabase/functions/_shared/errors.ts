// Turns anything thrown inside an Edge Function into a useful message string.
//
// Exists because `e instanceof Error ? e.message : '<generic>'` silently discards the most common
// non-Error thrown in this codebase: a PostgrestError from supabaseAdmin.rpc()/.from() (see
// malAuth.ts's getValidMalAccessToken). In the esm.sh Deno build of supabase-js, that's a plain
// `{message, details, hint, code}` object rather than an Error subclass, so the instanceof check
// fails and the caller gets a generic "<function> failed" with the actual cause thrown away. That
// cost a long debugging session on 2026-08-12 where the client only ever showed "mal-import
// failed" and the real Postgres error was never visible anywhere.
export function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object') {
    // PostgrestError shape — include code/details/hint, which are usually what actually identifies
    // a Postgres-side failure (missing function, permission denied, extension not enabled...).
    const err = e as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
    if (typeof err.message === 'string') {
      const extras = [
        typeof err.code === 'string' ? `code=${err.code}` : null,
        typeof err.details === 'string' && err.details ? `details=${err.details}` : null,
        typeof err.hint === 'string' && err.hint ? `hint=${err.hint}` : null,
      ].filter(Boolean);
      return extras.length > 0 ? `${err.message} (${extras.join(', ')})` : err.message;
    }
    try {
      return JSON.stringify(e);
    } catch {
      // Circular or otherwise unserializable — fall through.
    }
  }
  return String(e);
}
