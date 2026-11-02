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
