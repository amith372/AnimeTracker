// The taste-profile model proxy — plan 1 step 6. Holds GROQ_API_KEY and nothing else of substance:
// it takes three lists of titles the client already assembled, asks the model to describe the
// reader, and hands back the answer. It decides nothing about taste and makes no MAL call.
//
// Three things it is deliberately NOT:
//
//  - **Not a second home for domain logic** (CLAUDE.md's Edge Function convention). Which series
//    land in which bucket is src/domain/tasteProfile.ts's call, made client-side; this function
//    never sees a Series, a status or a MAL id, only the strings. The narrow exception the import
//    and monthly-sync functions hold doesn't apply here — there is no cron caller and no closure to
//    expand, so there was never a reason to duplicate anything.
//  - **Not a MAL proxy.** No MAL response ever reaches the model, which is the whole basis of the
//    PRD's reading of MAL agreement §3(a)(vii): the API and the model are never connected, our own
//    database sits between them. The MAL helpers are not imported, and must not be.
//  - **Not the writer of the taste_profiles row.** The client upserts it under its own RLS
//    (TasteProfileRepository.ts), so the stored profile and the fingerprint it was generated from
//    are written together by the one party that knows both.
//
// It does hold one piece of real enforcement: the consent check. buildTastePayload already refuses
// client-side, but a client-side gate is a promise and this is the thing actually holding the key,
// so consent is re-read from Postgres here. Either gate alone failing cannot leak a library.
import { supabaseAdmin, getRequestUserId } from '../_shared/supabaseAdmin.ts';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { describeError } from '../_shared/errors.ts';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// A current GroqCloud production chat model (console.groq.com/docs/models), not a preview one —
// preview ids are retired without notice, and this is a user-facing button. If Groq ever retires
// it the symptom is a 404 from the call below, which degrades to "couldn't generate" rather than
// breaking the screen; change it here, in one place.
//
// It happened: `llama-3.3-70b-versatile` was decommissioned and the card started reporting a 404
// (2026-10-15). Chosen by asking Groq's own /models endpoint what it still serves rather than
// from memory, and the whole request was run against the real prompt before changing anything.
const GROQ_MODEL = 'openai/gpt-oss-120b';

// gpt-oss is a *reasoning* model, which changes two things about the call below and is the reason
// this constant exists at all. Its reasoning tokens are spent out of the same completion budget as
// the answer, so at the old 700-token ceiling the model reasoned past the limit and Groq returned
// `json_validate_failed: max completion tokens reached before generating a valid document` —
// observed, not predicted. 'low' keeps the thinking proportionate to a four-field reply; the
// measured cost of this prompt is ~250 completion tokens all in.
const GROQ_REASONING_EFFORT = 'low';

// Low but not zero. The profile should be a reading of the library rather than a different guess
// each press — but the regenerate button exists so the user can reject a bad one, and at
// temperature 0 pressing it on an unchanged library would return the same words forever, which
// makes the button a lie.
const GROQ_TEMPERATURE = 0.4;

// A profile is four short fields, and a measured call spends ~250 tokens including its reasoning.
// The headroom is for the reasoning rather than the answer (see GROQ_REASONING_EFFORT): a
// truncated response here is not a short profile, it is no profile at all, because the JSON never
// closes. Still far below anything that could bill the free tier for lines nobody reads.
const GROQ_MAX_TOKENS = 1500;

const SYSTEM_PROMPT = [
  'You describe a person\'s taste in anime from three lists of titles they have watched or dropped.',
  'You are given only titles. You have no other information about this person, and must not guess at any.',
  'Infer what they seek out, what they merely tolerate, and what they avoid.',
  'The "liked" list is the strongest signal; "dropped" tells you what they bail on.',
  'Describe tone, pacing, structure and subject matter - not just genre labels, which the app already knows.',
  'Be specific and willing to commit to a reading. Generic filler ("enjoys a variety of genres") is useless.',
  'Never mention specific titles in the summary; describe the taste, not the library.',
  'Reply with JSON only, matching exactly:',
  '{"summary": "one or two sentences, second person", "seeksOut": ["..."], "tolerates": ["..."], "avoids": ["..."]}',
  'Each list holds 2-6 short phrases. Use an empty list if the input says nothing about it.',
].join('\n');

/** The three buckets, exactly as src/domain/tasteProfile.ts's TastePayload builds them. */
interface TastePayload {
  liked: string[];
  watchedNeutral: string[];
  dropped: string[];
}

/**
 * Whether the request body is the payload we expect, and only that. A wrong shape is rejected
 * before the key is spent, and — more to the point — this is what stops anything other than three
 * lists of strings being forwarded to a third party. A client that tried to send an id, an email
 * or a whole MAL response alongside the titles would fail here rather than have it relayed.
 */
function readPayload(body: unknown): TastePayload | null {
  if (!body || typeof body !== 'object') return null;
  const obj = body as Record<string, unknown>;
  const buckets = ['liked', 'watchedNeutral', 'dropped'] as const;
  if (Object.keys(obj).some((key) => !buckets.includes(key as (typeof buckets)[number]))) return null;
  const out: TastePayload = { liked: [], watchedNeutral: [], dropped: [] };
  for (const bucket of buckets) {
    const value = obj[bucket];
    if (value === undefined) continue;
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) return null;
    out[bucket] = value as string[];
  }
  return out;
}

/** The user prompt: the three lists, labelled. Nothing else — see this file's header. */
function buildUserPrompt(payload: TastePayload): string {
  const section = (label: string, titles: string[]) =>
    titles.length > 0 ? `${label}:\n${titles.map((t) => `- ${t}`).join('\n')}` : `${label}: (none)`;
  return [
    section('Loved', payload.liked),
    section('Watched but did not mark as loved', payload.watchedNeutral),
    section('Dropped', payload.dropped),
  ].join('\n\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();
  try {
    const userId = await getRequestUserId(req);
    if (!userId) return jsonResponse({ error: 'Not signed in.' }, 401);

    const apiKey = Deno.env.get('GROQ_API_KEY');
    // A plain, named failure rather than a crash: the PRD's degrade path turns this into the
    // deterministic list plus one line of notice, and it can only do that if it can tell this
    // apart from a network blip. Also the exact state step 7's check asks the user to produce by
    // revoking the key.
    if (!apiKey) return jsonResponse({ error: 'The taste profile is unavailable: no model key is configured.' }, 503);

    // The server-side half of the consent gate. Read as service_role against the owning user's own
    // row — see this file's header for why it is re-checked here at all.
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
    if (!payload) return jsonResponse({ error: 'Expected three lists of titles.' }, 400);

    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: GROQ_TEMPERATURE,
        max_tokens: GROQ_MAX_TOKENS,
        reasoning_effort: GROQ_REASONING_EFFORT,
        // Asks the provider to constrain the output to parseable JSON, so a stray sentence of
        // preamble can't cost a generation. parseTasteProfile still validates the shape
        // client-side — this narrows what arrives, it doesn't make it trustworthy.
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(payload) },
        ],
      }),
    });

    if (!response.ok) {
      // The provider's own body is usually the only thing that says *why* (bad model id, rate
      // limit, revoked key), and it holds no user data — the request carried only titles. It is
      // logged rather than returned: this sentence is now shown to the user verbatim (see
      // src/repositories/errorMessage.ts's isUserFacingEdgeStatus), and Groq's body is JSON
      // written for a developer. The status stays in the sentence, which is what distinguishes a
      // 429 from a revoked key, and is passed through rather than flattened to 500 so a 429 stays
      // recognisably a rate limit — the one failure here that a later retry genuinely fixes.
      const detail = await response.text().catch(() => '');
      console.error(`taste-profile: provider returned ${response.status}: ${detail}`);
      return jsonResponse(
        { error: `The model provider refused the request (${response.status}).` },
        response.status === 429 ? 429 : 502,
      );
    }

    const body = await response.json();
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return jsonResponse({ error: 'The model returned no profile.' }, 502);

    // Parsed here only to fail fast on a non-JSON body; the authoritative narrowing is
    // parseTasteProfile client-side, where the type that the UI renders actually lives.
    let profile: unknown;
    try {
      profile = JSON.parse(content);
    } catch {
      return jsonResponse({ error: 'The model returned something that was not a profile.' }, 502);
    }

    return jsonResponse({ profile });
  } catch (e) {
    return jsonResponse({ error: `taste-profile failed: ${describeError(e)}` }, 500);
  }
});
