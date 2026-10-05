-- Real PostgreSQL proof of 0133: one initial declaration, two immutable
-- receipts. No browser session is needed for the Auth INSERT transaction.
begin;

insert into auth.users (id,email,raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000133001','initial@test.local',
   '{"display_name":"Initial", "legal_acceptance":{"conditions_version":"cgu-v1","conditions_accepted":true,"confidentialite_version":"confidentialite-v1","confidentialite_read":true}}'),
  ('00000000-0000-0000-0000-000000133002','oauth@test.local','{"full_name":"OAuth Person"}'),
  ('00000000-0000-0000-0000-000000133003','peer@test.local','{}'),
  ('00000000-0000-0000-0000-000000133004','atomic@test.local','{}'),
  ('00000000-0000-0000-0000-000000133005','suspended@test.local','{}');

do $$
declare v_first timestamptz; v_bad jsonb;
begin
  if auth.uid() is not null then raise exception 'LA1 fixture must have no browser session'; end if;
  if (select count(*) from zabelie_policy_acceptances where user_id='00000000-0000-0000-0000-000000133001') <> 2 then
    raise exception 'LA1 initial Auth INSERT without session must record both receipts';
  end if;
  if exists (select 1 from zabelie_policy_acceptances where user_id='00000000-0000-0000-0000-000000133002') then
    raise exception 'LA2 absent OAuth declaration must never be inferred';
  end if;
  if (select display_name from profiles where id='00000000-0000-0000-0000-000000133002') <> 'OAuth Person' then
    raise exception 'LA2 OAuth name fallback from 0095 lost';
  end if;

  select min(accepted_at) into v_first from zabelie_policy_acceptances where user_id='00000000-0000-0000-0000-000000133001';
  update auth.users set raw_user_meta_data='{"legal_acceptance":{"conditions_version":"cgu-v99","confidentialite_version":"confidentialite-v99"}}'
    where id='00000000-0000-0000-0000-000000133001';
  update auth.users set raw_user_meta_data='{"legal_acceptance":{"conditions_version":"cgu-v1","conditions_accepted":true,"confidentialite_version":"confidentialite-v1","confidentialite_read":true}}'
    where id='00000000-0000-0000-0000-000000133002';
  if (select count(*) from zabelie_policy_acceptances where user_id='00000000-0000-0000-0000-000000133001') <> 2
    or (select min(accepted_at) from zabelie_policy_acceptances where user_id='00000000-0000-0000-0000-000000133001') is distinct from v_first
    or exists (select 1 from zabelie_policy_acceptances where user_id='00000000-0000-0000-0000-000000133001' and policy_version not in ('cgu-v1','confidentialite-v1'))
    or exists (select 1 from zabelie_policy_acceptances where user_id='00000000-0000-0000-0000-000000133002') then
    raise exception 'LA3 mutable metadata created or rewrote acceptance evidence';
  end if;

  foreach v_bad in array array[
    'null'::jsonb,
    '{}'::jsonb,
    '{"conditions_version":"cgu-v1","conditions_accepted":false,"confidentialite_version":"confidentialite-v1","confidentialite_read":true}'::jsonb,
    '{"conditions_version":"cgu-v1","conditions_accepted":"true","confidentialite_version":"confidentialite-v1","confidentialite_read":true}'::jsonb,
    '{"conditions_version":"cgu-v99","conditions_accepted":true,"confidentialite_version":"confidentialite-v1","confidentialite_read":true}'::jsonb,
    '{"conditions_version":"cgu-v1","conditions_accepted":true,"confidentialite_version":"confidentialite-v1","confidentialite_read":null}'::jsonb
  ] loop
    begin
      insert into auth.users (id,email,raw_user_meta_data)
        values ('00000000-0000-0000-0000-000000133099','invalid@test.local',jsonb_build_object('legal_acceptance',v_bad));
      raise exception 'LA4 malformed declaration allowed';
    exception when sqlstate 'ZB133' then null; end;
    if exists(select 1 from auth.users where id='00000000-0000-0000-0000-000000133099')
      or exists(select 1 from profiles where id='00000000-0000-0000-0000-000000133099') then
      raise exception 'LA4 invalid declaration left an Auth/profile partial signup';
    end if;
  end loop;

  if has_function_privilege('anon','zabelie_accept_account_legal(text,text,boolean,boolean)','execute')
    or not has_function_privilege('authenticated','zabelie_accept_account_legal(text,text,boolean,boolean)','execute')
    or has_function_privilege('authenticated','zabelie_handle_new_user()','execute') then
    raise exception 'LA5 incorrect RPC/trigger ACL';
  end if;
  raise notice 'OK LA1-LA5: no-session initial receipts, absent declarations, immutable initial metadata, all-or-nothing invalid signup, ACL';
end $$;

set local role anon;
do $$ begin
  begin
    perform zabelie_accept_account_legal('cgu-v1','confidentialite-v1',true,true);
    raise exception 'LA6 anon called authenticated RPC';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000133002';
set local request.jwt.claim.role='authenticated';
do $$
declare v_case integer; v_first timestamptz;
begin
  for v_case in 1..4 loop
    begin
      perform zabelie_accept_account_legal(
        case when v_case=1 then 'cgu-v99' else 'cgu-v1' end,
        case when v_case=2 then 'confidentialite-v99' else 'confidentialite-v1' end,
        case when v_case=3 then false else true end,
        case when v_case=4 then null else true end);
      raise exception 'LA7 RPC accepted a missing/wrong declaration';
    exception when sqlstate 'ZB133' then null; end;
  end loop;
  perform zabelie_accept_account_legal('cgu-v1','confidentialite-v1',true,true);
  select min(accepted_at) into v_first from zabelie_policy_acceptances;
  perform zabelie_accept_account_legal('cgu-v1','confidentialite-v1',true,true);
  if (select count(*) from zabelie_policy_acceptances) <> 2
    or (select min(accepted_at) from zabelie_policy_acceptances) is distinct from v_first then
    raise exception 'LA8 own fresh act must be idempotent and self-readable';
  end if;
  begin
    insert into zabelie_policy_acceptances (user_id,policy_version) values ('00000000-0000-0000-0000-000000133003','cgu-v1');
    raise exception 'LA8 client inserted a peer receipt';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local request.jwt.claim.sub='';
set local request.jwt.claim.role='service_role';
do $$ begin
  if exists(select 1 from zabelie_policy_acceptances where user_id='00000000-0000-0000-0000-000000133003') then
    raise exception 'LA8 authenticated caller wrote another user receipt';
  end if;
  update profiles set suspended_at=now(), suspended_reason='moderation' where id='00000000-0000-0000-0000-000000133005';
end $$;

-- Inject a failure on the second receipt. The first must also roll back.
create function public.zabelie_test_legal_second_receipt_failure()
returns trigger language plpgsql as $$ begin
  if new.user_id='00000000-0000-0000-0000-000000133004' and new.policy_version='confidentialite-v1' then
    raise exception 'synthetic second receipt failure' using errcode='ZB134';
  end if;
  return new;
end $$;
create trigger zabelie_test_legal_second_receipt_failure before insert on zabelie_policy_acceptances
for each row execute function public.zabelie_test_legal_second_receipt_failure();

set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000133004';
set local request.jwt.claim.role='authenticated';
do $$ begin
  begin
    perform zabelie_accept_account_legal('cgu-v1','confidentialite-v1',true,true);
    raise exception 'LA9 synthetic failure did not occur';
  exception when sqlstate 'ZB134' then null; end;
  if exists(select 1 from zabelie_policy_acceptances) then raise exception 'LA9 partial pair survived RPC failure'; end if;
end $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000133005';
do $$ begin
  begin
    perform zabelie_accept_account_legal('cgu-v1','confidentialite-v1',true,true);
    raise exception 'LA10 suspended account accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local request.jwt.claim.sub='';
set local request.jwt.claim.role='service_role';

do $$ begin
  begin
    update zabelie_policy_acceptances set policy_version='cgu-v2' where user_id='00000000-0000-0000-0000-000000133001';
    raise exception 'LA11 receipt update allowed';
  exception when sqlstate 'ZB046' then null; end;
  begin
    delete from auth.users where id='00000000-0000-0000-0000-000000133001';
    raise exception 'LA11 Auth cascade erased immutable receipts';
  exception when sqlstate 'ZB046' then null; end;
  raise notice 'OK LA6-LA11: anon denied, explicit self act, idempotence, peer denied, atomic pair, suspension denied, append-only cascade protected';
end $$;
rollback;
