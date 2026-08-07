-- Phase 10: two pieces of server-side support for full bidirectional sync.
--
-- 1. replace_library(payload) — a single-round-trip, single-transaction bulk seed of the calling
--    user's whole series/series_entries, called only from the onboarding reconcile screen's
--    replaceAllSeries (see AnimeRepository.ts). This is deliberately NOT the same path as Phase
--    9's outbox: replaceAllSeries's wipe-and-reinsert semantics would look like "delete
--    everything" to a concurrently-pulling second device if it went through N individual outbox
--    upserts, and a single RPC call is far faster than one round trip per series/entry for a
--    freshly-imported ~150-row library. `security invoker` (the plpgsql default) is correct here,
--    not `security definer` — this runs with the calling user's own JWT/RLS context, same as any
--    other client-side write, so a caller can only ever wipe and reseed their own rows.
create or replace function public.replace_library(payload jsonb)
returns void
language plpgsql
as $$
declare
  item jsonb;
  entry jsonb;
  new_series_id uuid;
begin
  if auth.uid() is null then
    raise exception 'replace_library requires an authenticated caller';
  end if;

  delete from public.series_entries where user_id = auth.uid();
  delete from public.series where user_id = auth.uid();

  for item in select * from jsonb_array_elements(payload)
  loop
    insert into public.series (
      user_id, title, cover_url, genres, root_mal_id, type, manual_status,
      new_season_available, new_season_aired_at, liked, updated_by_device_id
    ) values (
      auth.uid(),
      item->>'title',
      item->>'cover_url',
      coalesce(item->'genres', '[]'::jsonb),
      (item->>'root_mal_id')::bigint,
      item->>'type',
      item->>'manual_status',
      coalesce((item->>'new_season_available')::boolean, false),
      (item->>'new_season_aired_at')::timestamptz,
      coalesce((item->>'liked')::boolean, false),
      (item->>'updated_by_device_id')::uuid
    )
    returning id into new_series_id;

    for entry in select * from jsonb_array_elements(coalesce(item->'entries', '[]'::jsonb))
    loop
      insert into public.series_entries (
        series_id, user_id, mal_id, kind, order_index, title, episode_count,
        watch_state, airing_status, watched_arc_keys, updated_by_device_id
      ) values (
        new_series_id,
        auth.uid(),
        (entry->>'mal_id')::bigint,
        entry->>'kind',
        (entry->>'order_index')::integer,
        entry->>'title',
        coalesce((entry->>'episode_count')::integer, 0),
        coalesce(entry->>'watch_state', 'UNWATCHED'),
        entry->>'airing_status',
        entry->'watched_arc_keys',
        (item->>'updated_by_device_id')::uuid
      );
    end loop;
  end loop;
end;
$$;

grant execute on function public.replace_library(jsonb) to authenticated;

-- 2. Realtime: postgres_changes only fires for tables added to the supabase_realtime publication
-- (every Supabase project has this publication by default, just with no tables in it yet).
-- src/sync/pull.ts subscribes to both, filtered server-side to the caller's own rows by RLS.
alter publication supabase_realtime add table public.series;
alter publication supabase_realtime add table public.series_entries;
