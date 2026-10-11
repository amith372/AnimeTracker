// The candidate-generator model proxy — plan 1 step 7. Takes the taste profile the model wrote in
// step 6 plus the titles the user already tracks, and hands back a list of titles to go and look
// up. It decides nothing about recommendations and makes no MAL call.
//
// The same three things taste-profile is deliberately not, for the same reasons:
//
//  - **Not a second home for domain logic** (CLAUDE.md's Edge Function convention). Which
//    suggestions are worth resolving, whether a MAL search result really is the show that was
//    named, and whether it is obscure enough to show are all src/domain/candidateGenerator.ts's
//    calls, made client-side. This function never sees a Series, a MAL id or a search result.
//  - **Not a MAL proxy.** No MAL API response reaches the model, which is the whole basis of the
//    PRD's reading of MAL agreement §3(a)(vii): the API and the model are never connected, our own
//    database sits between them. The titles below were read out of our Postgres. The returned
//    titles are then searched on MAL by the client, which is functionally a user typing into
//    Discover's search box. The MAL helpers are not imported, and must not be.
//  - **Not the authority on what gets shown.** It returns strings; every one of them has to survive
//    the resolution gate, the obscurity ceiling and the pipeline's own exclusions before it can
//    reach a card, and none of the model's words ever appear on one (success criterion 5).
//
// It holds two pieces of real enforcement: the consent re-check (see taste-profile's header for why
// a client-side gate is not enough on its own) and the daily call ceiling, which is the only thing
// standing between a key this function holds and a client that can call it with the anon key every
// bundle carries. Guest mode is on, so that client need not even have an email address.
import { supabaseAdmin, getRequestUserId } from '../_shared/supabaseAdmin.ts';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { describeError } from '../_shared/errors.ts';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// The same production model id taste-profile uses, and for the same reason — a preview id is
// retired without notice and this is a user-facing refresh. Kept as a separate constant rather
// than shared: if one of the two calls ever wants a different model, that is a change to one line
// here, not a change that silently moves the other.
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// Higher than taste-profile's 0.4, deliberately. That call is a reading of a fixed library and
// should be close to reproducible; this one is asked for suggestions, and the user presses refresh
// precisely to get different ones. At a low temperature a refresh on an unchanged library would
// return the same twelve shows forever, which is the narrowness this whole plan exists to fix.
const GROQ_TEMPERATURE = 0.9;

// Twelve short titles plus JSON scaffolding. Generous enough that a truncated response is a real
// failure rather than routine, tight enough that a runaway generation cannot bill the free tier
// for a thousand lines nobody reads.
const GROQ_MAX_TOKENS = 500;

// How many model calls one account gets per UTC day, enforced by model_call_consume in Postgres
// (supabase/migrations/20261011020000_model_call_quota.sql).
//
// 25 is set against ordinary use, not against cost: the Recommendations screen generates once per
// load, so this is roughly "two dozen visits a day", which a real session does not reach and a
// loop reaches in seconds. Hitting it is not an error — the client falls back to the deterministic
// list with its one-line notice, which is the same degrade path a provider outage takes.
const DAILY_CALL_CEILING = 25;

// How many titles to ask for. The client caps what it acts on at MAX_GENERATED_TITLES (12) anyway;
// asking for a few more costs nothing and leaves room for the ones its resolution gate throws out.
const REQUESTED_TITLES = 15;

const SYSTEM_PROMPT = [
  'You suggest anime for one person to watch next, from a description of their taste.',
  'The description was written from the shows they have loved, watched and dropped.',
  'You are also given every title they already track. Never suggest any of those.',
  'Suggest lesser-known shows. Do not suggest anything with a very large audience:',
  'no top-100-by-popularity titles, nothing most anime watchers would already have seen.',
  'That is the whole point of the request - a famous show is a wasted suggestion.',
  'Prefer things that fit what they seek out, and avoid what the description says they bail on.',
  'Give the real, full title of each show as MyAnimeList lists it, English title where there is one.',
  'Do not invent titles. Only name anime you are confident exist.',
  'Strongest suggestions first.',
  'Reply with JSON only, matching exactly:',
  `{"titles": ["...", "..."]}`,
  `Give ${REQUESTED_TITLES} titles. No commentary, no reasons, no other fields.`,
].join('\n');

/** The profile, exactly as src/domain/tasteProfile.ts's TasteProfile holds it. */
interface TasteProfileBody {
  summary: string;
  seeksOut: string[];
  tolerates: string[];
  avoids: string[];
}

/** The request body, exactly as src/domain/candidateGenerator.ts's buildGeneratorPayload builds it. */
interface GeneratorPayload {
  profile: TasteProfileBody;
  exclude: string[];
}

/** Non-empty strings only, or null if the value isn't a list of strings at all. */
function readStringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (value.some((v) => typeof v !== 'string')) return null;
  return (value as string[]).filter((v) => v.trim().length > 0);
}

/**
 * Whether the request body is the payload we expect, and only that. A wrong shape is rejected
 * before the key is spent, and — more to the point — this is what stops anything other than a
 * profile and a list of titles being forwarded to a third party. A client that tried to attach a
 * user id, an email or a whole MAL response alongside the titles would fail here rather than have
 * it relayed, which is the same rule taste-profile's readPayload enforces and the same reason.
 */
function readPayload(body: unknown): GeneratorPayload | null {
  if (!body || typeof body !== 'object') return null;
  const obj = body as Record<string, unknown>;
  if (Object.keys(obj).some((key) => key !== 'profile' && key !== 'exclude')) return null;

  const rawProfile = obj.profile;
  if (!rawProfile || typeof rawProfile !== 'object') return null;
  const profileObj = rawProfile as Record<string, unknown>;
  const profileKeys = ['summary', 'seeksOut', 'tolerates', 'avoids'] as const;
  if (Object.keys(profileObj).some((key) => !profileKeys.includes(key as (typeof profileKeys)[number]))) {
    return null;
  }
  if (typeof profileObj.summary !== 'string' || profileObj.summary.trim().length === 0) return null;
  const seeksOut = readStringList(profileObj.seeksOut ?? []);
  const tolerates = readStringList(profileObj.tolerates ?? []);
  const avoids = readStringList(profileObj.avoids ?? []);
  if (!seeksOut || !tolerates || !avoids) return null;

  const exclude = readStringList(obj.exclude ?? []);
  if (!exclude) return null;

  return {
    profile: { summary: profileObj.summary.trim(), seeksOut, tolerates, avoids },
    exclude,
  };
}

/** The user prompt: the profile, then the do-not-suggest list. Nothing else — see this file's header. */
function buildUserPrompt(payload: GeneratorPayload): string {
  const list = (label: string, values: string[]) =>
    values.length > 0 ? `${label}: ${values.join('; ')}` : `${label}: (nothing recorded)`;
  return [
    `Their taste: ${payload.profile.summary}`,
    list('Seeks out', payload.profile.seeksOut),
    list('Tolerates', payload.profile.tolerates),
    list('Avoids', payload.profile.avoids),
    '',
    payload.exclude.length > 0
      ? `Already tracked - never suggest these:\n${payload.exclude.map((t) => `- ${t}`).join('\n')}`
      : 'Already tracked: (nothing)',
  ].join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();
  try {
    const userId = await getRequestUserId(req);
    if (!userId) return jsonResponse({ error: 'Not signed in.' }, 401);

    const apiKey = Deno.env.get('GROQ_API_KEY');
    // A plain, named failure rather than a crash: the client's degrade path turns this into the
    // deterministic list plus one line of notice, and it can only do that if it can tell this
    // apart from a network blip. Also the exact state this step's check asks the user to produce
    // by revoking the key.
    if (!apiKey) {
      return jsonResponse({ error: 'Fresh picks are unavailable: no model key is configured.' }, 503);
    }

    // The server-side half of the consent gate — buildGeneratorPayload already refuses
    // client-side, but that gate is a promise and this is the thing holding the key.
    const { data: meta, error: metaError } = await supabaseAdmin
      .from('user_library_meta')
      .select('privacy_consented_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (metaError) return jsonResponse({ error: `Couldn’t check consent: ${metaError.message}` }, 500);
    if (!meta?.privacy_consented_at) {
      return jsonResponse({ error: 'The privacy notice has not been accepted for this account.' }, 403);
    }

    const payload = readPayload(await req.json().catch(() => null));
    if (!payload) return jsonResponse({ error: 'Expected a taste profile and a list of titles.' }, 400);

    // Spent *before* the model call, not after. A provider that is failing is exactly when a
    // client is most likely to retry in a loop, so a ceiling that only counts successes is no
    // ceiling at all in the case it most needs to be one. The cost is that an outage can consume
    // a day's allowance, which costs the user nothing they would have got anyway.
    const { data: allowed, error: quotaError } = await supabaseAdmin.rpc('model_call_consume', {
      p_user_id: userId,
      p_limit: DAILY_CALL_CEILING,
    });
    if (quotaError) return jsonResponse({ error: `Couldn’t check the daily limit: ${quotaError.message}` }, 500);
    if (allowed !== true) {
      return jsonResponse(
        { error: `That is today’s limit of ${DAILY_CALL_CEILING} fresh-pick requests. It resets at midnight UTC.` },
        429,
      );
    }

    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: GROQ_TEMPERATURE,
        max_tokens: GROQ_MAX_TOKENS,
        // Asks the provider to constrain the output to parseable JSON, so a stray sentence of
        // preamble can't cost a generation. The client still validates every title through the
        // resolution gate — this narrows what arrives, it doesn't make it trustworthy.
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(payload) },
        ],
      }),
    });

    if (!response.ok) {
      // The provider's own body is usually the only thing that says *why* (bad model id, rate
      // limit, revoked key), and it holds no user data — the request carried titles and nothing
      // else. Its status is passed through rather than flattened to 500 so a 429 stays
      // recognisably a rate limit, the one failure here a later retry genuinely fixes.
      const detail = await response.text().catch(() => '');
      return jsonResponse(
        { error: `The model provider refused the request (${response.status}). ${detail}`.trim() },
        response.status === 429 ? 429 : 502,
      );
    }

    const body = await response.json();
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return jsonResponse({ error: 'The model returned no suggestions.' }, 502);

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return jsonResponse({ error: 'The model returned something that was not a list of titles.' }, 502);
    }

    // Narrowed to strings here only so the response has a stable shape; what the titles *mean* is
    // decided entirely by the client's resolution gate.
    const titles = readStringList((parsed as Record<string, unknown> | null)?.titles) ?? [];
    return jsonResponse({ titles });
  } catch (e) {
    return jsonResponse({ error: `taste-candidates failed: ${describeError(e)}` }, 500);
  }
});
