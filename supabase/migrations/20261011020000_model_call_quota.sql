-- Plan 1 step 7: a per-user daily ceiling on model calls.
--
-- Why it exists at all, when the generator is already one request per refresh: guest mode is on
-- (CLAUDE.md Feature specs §1), so anyone who can open the app can reach a paid third-party API
-- holding our key. One request per refresh caps a *well-behaved* client; it caps nothing about a
-- client that calls the Edge Function in a loop with the anon key every bundle already carries.
-- The ceiling is the only thing between that and the key's rate limit.
--
-- Why Postgres rather than in-memory counting in the function: Edge Function instances are
-- ephemeral and there are several of them, so a counter in one process is not a ceiling. This also
-- makes the limit survive a deploy, which an in-memory one would reset.
create table if not exists public.model_call_quota (
  user_id uuid not null references auth.users(id) on delete cascade,
  -- UTC, not the user's local day. A local day needs a timezone we don't store, and a ceiling
  -- whose reset moment moves with travel is harder to reason about than one that is simply "06:00
  -- for me, always".
  day date not null,
  calls integer not null default 0,
  -- One row per account per day. Old rows are left to accumulate rather than pruned: a row is
  -- ~40 bytes, a heavy account writes 365 a year, and the `on delete cascade` above clears them
  -- all when the account goes (supabase/functions/delete-account sweeps the table explicitly too).
  primary key (user_id, day)
);

alter table public.model_call_quota enable row level security;

-- Deliberately no policy, which under RLS means deny-all to every client role — the same shape
-- mal_accounts uses (20260807000002_mal_accounts.sql). A client that could update this row could
-- lift its own ceiling, which is the one thing the table exists to prevent. Only service_role,
-- i.e. the Edge Function, touches it.
grant select, insert, update, delete on public.model_call_quota to service_role;

-- Increments today's count and reports whether the call is allowed, in one statement.
--
-- The atomicity is the whole point. Read-then-write from the Edge Function would let a phone and a
-- browser tab refreshing at the same moment both read "24 of 25" and both proceed — the same race
-- `mal_refresh_token_if_needed` exists to close for token refresh, and the same answer: put the
-- decision inside the statement that does the write.
--
-- The `where` on the conflict branch is what makes it a ceiling rather than a counter: over the
-- limit, the update matches no row, RETURNING yields nothing, and v_calls stays null. The insert
-- branch has no such guard, so the first call of a day is always allowed — hence the explicit
-- p_limit <= 0 check, without which a ceiling of zero would still permit one call a day.
create or replace function public.model_call_consume(p_user_id uuid, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_calls integer;
begin
  if p_limit <= 0 then
    return false;
  end if;

  insert into public.model_call_quota as q (user_id, day, calls)
  values (p_user_id, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update
    set calls = q.calls + 1
    where q.calls < p_limit
  returning q.calls into v_calls;

  return v_calls is not null;
end;
$$;

-- security definer, so the grant is the access control: only the Edge Function's role may spend a
-- call. Without the revoke, `public` keeps the default execute grant and any client could burn
-- another account's quota by passing its id.
revoke all on function public.model_call_consume(uuid, integer) from public;
revoke all on function public.model_call_consume(uuid, integer) from anon;
revoke all on function public.model_call_consume(uuid, integer) from authenticated;
grant execute on function public.model_call_consume(uuid, integer) to service_role;
