-- EchoMe database setup: paste all of this into the Supabase SQL Editor and click Run. Safe to run again.
-- Generated from supabase/migrations by `npm run setup:sql -- --write`; edit the migrations, not this file.

-- 202609190001_personalai.sql
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

-- 202611010001_owner_handoff.sql
-- Owner hand-off: replies the owner sends through their agent, and notes visitors leave for the owner.
-- Deleted together with the conversation by the existing retention cleanup.
begin;
create table if not exists public.pai_owner_messages (
  id uuid primary key default gen_random_uuid(),
  conversation text not null references public.pai_conversations(id) on delete cascade,
  created timestamptz not null default now(),
  role text not null check (role in ('owner','visitor_note')),
  text text not null check (length(text) between 1 and 4000)
);
create index if not exists pai_owner_messages_conversation on public.pai_owner_messages(conversation,created);
create index if not exists pai_owner_messages_recent on public.pai_owner_messages(created desc);
alter table public.pai_owner_messages enable row level security;
revoke all on public.pai_owner_messages from anon,authenticated;
grant all on public.pai_owner_messages to service_role;

create or replace function public.pai_owner_add(p_conversation text,p_role text,p_text text)
returns public.pai_owner_messages language plpgsql security definer set search_path=public,pg_temp as $$
declare v_row pai_owner_messages;
begin
  if length(p_conversation) not between 8 and 80 or p_conversation !~ '^[a-zA-Z0-9_-]+$' or p_role not in ('owner','visitor_note') or length(p_text) not between 1 and 4000 then raise exception 'INPUT_LIMIT'; end if;
  insert into pai_conversations(id) values(p_conversation) on conflict(id) do update set last_active=now();
  insert into pai_owner_messages(conversation,role,text) values(p_conversation,p_role,p_text) returning * into v_row;
  return v_row;
end $$;
revoke all on function public.pai_owner_add(text,text,text) from public,anon,authenticated;
grant execute on function public.pai_owner_add(text,text,text) to service_role;
commit;

-- 202611020001_saved_answers.sql
-- Answers the owner gave once and chose to keep, reused for similar visitor questions.
-- Not tied to a conversation's lifetime: retention cleanup does not delete them.
begin;
create table if not exists public.pai_saved_answers (
  id uuid primary key default gen_random_uuid(),
  created timestamptz not null default now(),
  question text not null check (length(question) between 1 and 500),
  answer text not null check (length(answer) between 1 and 2000),
  conversation text
);
create index if not exists pai_saved_answers_recent on public.pai_saved_answers(created desc);
alter table public.pai_saved_answers enable row level security;
revoke all on public.pai_saved_answers from anon,authenticated;
grant all on public.pai_saved_answers to service_role;
commit;

-- 202611030001_configurable_limits.sql
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

-- 202611040001_knowledge_edits.sql
-- Online knowledge edits from the owner page and the owner's agent. Live rows sit on top of the published knowledge;
-- drafts wait for the owner's approval. Not tied to conversations: retention cleanup does not touch them.
begin;
create table if not exists public.pai_knowledge (
  id uuid primary key default gen_random_uuid(),
  target text not null check (length(target) between 1 and 200),
  status text not null check (status in ('live','draft')),
  value jsonb not null check (octet_length(value::text) <= 200000),
  source text not null default 'owner' check (source in ('owner','agent','upload')),
  note text check (note is null or length(note) <= 2000),
  updated timestamptz not null default now()
);
create unique index if not exists pai_knowledge_live on public.pai_knowledge(target) where status='live';
create index if not exists pai_knowledge_updated on public.pai_knowledge(updated desc);
alter table public.pai_knowledge enable row level security;
revoke all on public.pai_knowledge from anon,authenticated;
grant all on public.pai_knowledge to service_role;

-- Replace a target's live edit in one step.
create or replace function public.pai_knowledge_put(p_target text,p_value jsonb,p_source text)
returns public.pai_knowledge language plpgsql security definer set search_path=public,pg_temp as $$
declare v_row pai_knowledge;
begin
  delete from pai_knowledge where target=p_target and status='live';
  insert into pai_knowledge(target,status,value,source) values(p_target,'live',p_value,p_source) returning * into v_row;
  return v_row;
end $$;

-- Turn a draft into its target's live edit, optionally with the owner's changes. Returns nothing if it was already handled.
create or replace function public.pai_knowledge_approve(p_id uuid,p_value jsonb)
returns setof public.pai_knowledge language plpgsql security definer set search_path=public,pg_temp as $$
declare v_draft pai_knowledge;
begin
  delete from pai_knowledge where id=p_id and status='draft' returning * into v_draft;
  if v_draft.id is null then return; end if;
  delete from pai_knowledge where target=v_draft.target and status='live';
  return query insert into pai_knowledge(target,status,value,source) values(v_draft.target,'live',coalesce(p_value,v_draft.value),v_draft.source) returning *;
end $$;
revoke all on function public.pai_knowledge_put(text,jsonb,text),public.pai_knowledge_approve(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pai_knowledge_put(text,jsonb,text),public.pai_knowledge_approve(uuid,jsonb) to service_role;
commit;
