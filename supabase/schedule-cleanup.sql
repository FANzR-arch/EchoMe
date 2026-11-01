-- Run after the migration. Hourly cleanup works even when no visitor opens the site.
-- Enable Supabase Cron (pg_cron) first in Integrations if this extension is unavailable.
create extension if not exists pg_cron;
select cron.schedule('personalai-retention-cleanup','17 * * * *','select public.pai_cleanup()');
