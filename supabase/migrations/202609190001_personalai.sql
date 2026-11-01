-- PersonalAI-only tables. Existing project tables are not modified.
begin;
create table if not exists public.pai_settings (
  id boolean primary key default true check(id),
  retention_days integer not null default 7 check(retention_days in (0,7,30,90)),
  daily_limit integer not null default 30 check(daily_limit between 1 and 1000)
);
insert into public.pai_settings(id) values(true) on conflict do nothing;
create table if not exists public.pai_conversations (
  id text primary key,
  last_active timestamptz not null default now()
);
create table if not exists public.pai_runs (
  id uuid primary key default gen_random_uuid(),
  conversation text not null references public.pai_conversations(id) on delete cascade,
  created timestamptz not null default now(),
  lease_until timestamptz,
  value jsonb not null,
  review jsonb not null default '{}'
);
create index if not exists pai_runs_conversation on public.pai_runs(conversation,created desc);
create index if not exists pai_conversations_activity on public.pai_conversations(last_active);
create table if not exists public.pai_usage (
  day date primary key,
  requests integer not null default 0,
  recent timestamptz[] not null default '{}'
);
alter table public.pai_settings enable row level security;
alter table public.pai_conversations enable row level security;
alter table public.pai_runs enable row level security;
alter table public.pai_usage enable row level security;
revoke all on public.pai_settings,public.pai_conversations,public.pai_runs,public.pai_usage from anon,authenticated;
grant all on public.pai_settings,public.pai_conversations,public.pai_runs,public.pai_usage to service_role;

-- One shared lock across all function instances. Failed DB calls never allow model use.
create or replace function public.pai_start(p_conversation text,p_value jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_day date := (now() at time zone 'UTC')::date; v_limit integer; v_count integer; v_recent timestamptz[]; v_id uuid;
begin
  select daily_limit into v_limit from pai_settings where id=true for update;
  if length(p_conversation) not between 1 and 80 or p_conversation !~ '^[a-zA-Z0-9_-]+$' or octet_length(p_value::text)>200000 then raise exception 'INPUT_LIMIT'; end if;
  insert into pai_usage(day) values(v_day) on conflict do nothing;
  select requests into v_count from pai_usage where day=v_day;
  select coalesce(array_agg(t),'{}') into v_recent from pai_usage u cross join lateral unnest(u.recent) t where t>now()-interval '1 minute';
  if v_count>=v_limit then raise exception 'DAILY_LIMIT'; end if;
  if cardinality(v_recent)>=6 then raise exception 'RATE_LIMIT'; end if;
  if (select count(*) from pai_runs where lease_until>now())>=2 then raise exception 'CONCURRENCY_LIMIT'; end if;
  update pai_usage set requests=requests+1,recent=array_append(v_recent,now()) where day=v_day;
  -- Clear yesterday's copied minute window; keep its daily count for accounting.
  update pai_usage set recent='{}' where day<>v_day;
  insert into pai_conversations(id) values(p_conversation) on conflict(id) do update set last_active=now();
  insert into pai_runs(conversation,value,lease_until) values(p_conversation,p_value,now()+interval '60 seconds') returning id into v_id;
  return v_id;
end $$;

create or replace function public.pai_finish(p_id uuid,p_value jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if octet_length(p_value::text)>500000 then raise exception 'INPUT_LIMIT'; end if;
  update pai_runs set value=p_value,lease_until=null where id=p_id;
  update pai_conversations set last_active=now() where id=(select conversation from pai_runs where id=p_id);
end $$;

create or replace function public.pai_cleanup()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_days integer; v_deleted integer := 0;
begin
  select retention_days into v_days from pai_settings where id=true for update;
  update pai_runs set value=jsonb_set(value,'{status}','"interrupted"'),lease_until=null
    where lease_until<now() and value->>'status'='running';
  if v_days>0 then
    delete from pai_conversations where last_active<now()-make_interval(days=>v_days)
      and not exists(select 1 from pai_runs where conversation=pai_conversations.id and lease_until>now());
    get diagnostics v_deleted=row_count;
  end if;
  delete from pai_usage where day<(now() at time zone 'UTC')::date-32;
  return v_deleted;
end $$;
revoke all on function public.pai_start(text,jsonb),public.pai_finish(uuid,jsonb),public.pai_cleanup() from public,anon,authenticated;
grant execute on function public.pai_start(text,jsonb),public.pai_finish(uuid,jsonb),public.pai_cleanup() to service_role;
commit;
