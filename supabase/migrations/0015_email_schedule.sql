-- SST · turn on scheduled emails: the cron secret's fingerprint + an hourly job.
-- Run once in Supabase SQL Editor (after 0014).
-- The secret itself lives only in Vercel (CRON_SECRET); this stores its sha256.

insert into public.app_settings (key, value)
values ('cron_token_hash', to_jsonb('f5f0902b0421cc6c9191ab172ff77adff39928ad882d0028efe25d7d3fa8198c'::text))
on conflict (key) do update set value = excluded.value, updated_at = now();

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Every hour at :05, call the site. It decides what is due (20:00 reminders,
-- settlement reminders on the 4th/6th) and sends each email once.
select cron.unschedule('sst-hourly') where exists (select 1 from cron.job where jobname = 'sst-hourly');
select cron.schedule(
  'sst-hourly',
  '5 * * * *',
  $$ select net.http_get(url := 'https://sst-indol-delta.vercel.app/api/cron/hourly', timeout_milliseconds := 30000) $$
);
