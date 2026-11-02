-- Chat limits come from the server (PAI_DAILY_LIMIT, PAI_PER_MINUTE_LIMIT, PAI_CONCURRENT_LIMIT), so every
-- function instance and the database enforce the same numbers. pai_settings.daily_limit is no longer read.
-- Called with only two arguments (a server from before this change), the old built-in limits apply.
begin;
drop function if exists public.pai_start(text,jsonb);
create or replace function public.pai_start(p_conversation text,p_value jsonb,p_daily integer default 30,p_per_minute integer default 6,p_concurrent integer default 2)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_day date := (now() at time zone 'UTC')::date; v_count integer; v_recent timestamptz[]; v_id uuid;
begin
  -- One shared lock across all function instances. Failed DB calls never allow model use.
  perform 1 from pai_settings where id=true for update;
  if length(p_conversation) not between 1 and 80 or p_conversation !~ '^[a-zA-Z0-9_-]+$' or octet_length(p_value::text)>200000
    or p_daily not between 1 and 100000 or p_per_minute not between 1 and 600 or p_concurrent not between 1 and 50 then raise exception 'INPUT_LIMIT'; end if;
  insert into pai_usage(day) values(v_day) on conflict do nothing;
  select requests into v_count from pai_usage where day=v_day;
  select coalesce(array_agg(t),'{}') into v_recent from pai_usage u cross join lateral unnest(u.recent) t where t>now()-interval '1 minute';
  if v_count>=p_daily then raise exception 'DAILY_LIMIT'; end if;
  if cardinality(v_recent)>=p_per_minute then raise exception 'RATE_LIMIT'; end if;
  if (select count(*) from pai_runs where lease_until>now())>=p_concurrent then raise exception 'CONCURRENCY_LIMIT'; end if;
  update pai_usage set requests=requests+1,recent=array_append(v_recent,now()) where day=v_day;
  -- Clear yesterday's copied minute window; keep its daily count for accounting.
  update pai_usage set recent='{}' where day<>v_day;
  insert into pai_conversations(id) values(p_conversation) on conflict(id) do update set last_active=now();
  insert into pai_runs(conversation,value,lease_until) values(p_conversation,p_value,now()+interval '60 seconds') returning id into v_id;
  return v_id;
end $$;
revoke all on function public.pai_start(text,jsonb,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.pai_start(text,jsonb,integer,integer,integer) to service_role;
commit;
