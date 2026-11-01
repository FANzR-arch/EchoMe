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
