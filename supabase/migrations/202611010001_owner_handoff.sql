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
