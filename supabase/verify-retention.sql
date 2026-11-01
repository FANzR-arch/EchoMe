-- Run only on the new PersonalAI project before production. All writes roll back.
begin;
do $$
declare n integer; rid uuid;
begin
  update public.pai_settings set retention_days=7 where id=true;
  insert into public.pai_conversations(id,last_active) values
    ('pai-test-old',now()-interval '8 days'),('pai-test-new',now()-interval '6 days'),('pai-test-active',now()-interval '8 days');
  insert into public.pai_runs(conversation,value,review) values('pai-test-old','{"status":"complete"}','{"note":"also deleted"}');
  insert into public.pai_runs(conversation,value,lease_until) values('pai-test-active','{"status":"running"}',now()+interval '1 minute');
  perform public.pai_cleanup();
  if exists(select 1 from public.pai_conversations where id='pai-test-old') then raise exception 'old conversation retained'; end if;
  if exists(select 1 from public.pai_runs where conversation='pai-test-old') then raise exception 'orphaned run or review'; end if;
  select count(*) into n from public.pai_conversations where id in ('pai-test-new','pai-test-active');
  if n<>2 then raise exception 'recent or active conversation removed'; end if;
  update public.pai_settings set retention_days=0 where id=true;
  insert into public.pai_conversations(id,last_active) values('pai-test-keep',now()-interval '100 days');
  perform public.pai_cleanup();
  if not exists(select 1 from public.pai_conversations where id='pai-test-keep') then raise exception 'retention off ignored'; end if;
  -- A request and its retries share the conversation, while daily limits survive deletion.
  update public.pai_settings set daily_limit=1 where id=true;
  rid:=public.pai_start('pai-test-quota','{"status":"running"}');
  perform public.pai_finish(rid,'{"status":"complete","response":"test"}');
  delete from public.pai_conversations where id='pai-test-quota';
  begin
    perform public.pai_start('pai-test-quota','{"status":"running"}');
    raise exception 'daily quota not enforced';
  exception when others then
    if sqlerrm<>'DAILY_LIMIT' then raise; end if;
  end;
  if has_table_privilege('anon','public.pai_runs','select') or has_function_privilege('anon','public.pai_cleanup()','execute') then raise exception 'public access granted'; end if;
end $$;
rollback;
