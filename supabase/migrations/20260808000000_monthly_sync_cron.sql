-- Phase 11: schedules mal-monthly-sync (supabase/functions/mal-monthly-sync) to run once a month
-- for every MAL-linked account, via pg_cron calling the function over HTTP (pg_net). This replaces
-- the old per-device expo-background-task registration entirely — see SyncRepository.ts.
--
-- *** Before running this migration ***
-- 1. Pick your own random secret string and set it as an Edge Function secret:
--      supabase secrets set CRON_SECRET=<your-own-random-value> --project-ref <your-project-ref>
--    (or via the Dashboard's Edge Functions -> Secrets page). Never share this value — it's what
--    lets mal-monthly-sync tell "a legitimate scheduled run" from "anyone who found the URL".
-- 2. Replace both placeholders below with your actual project URL, anon key, and the *same* secret
--    value you just set — cron.schedule's command is stored in the `cron.job` table, readable by
--    project admins, same trust level as any other server-side config in this project.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'monthly-mal-sync',
  '0 6 1 * *', -- 06:00 UTC on the 1st of every month
  $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/mal-monthly-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer YOUR-ANON-KEY',
      'x-cron-secret', 'YOUR-CRON-SECRET',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
