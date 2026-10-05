-- Retention after closure, calendar boundaries, retry and client privileges.
begin;
insert into auth.users (id, email) values
  ('13100000-0000-4000-8000-000000000001', 'retention-active@test.local'),
  ('13100000-0000-4000-8000-000000000002', 'retention-suspended@test.local'),
  ('13100000-0000-4000-8000-000000000003', 'retention-recent@test.local'),
  ('13100000-0000-4000-8000-000000000004', 'retention-expired@test.local'),
  ('13100000-0000-4000-8000-000000000005', 'retention-boundary@test.local'),
  ('13100000-0000-4000-8000-000000000006', 'retention-unknown-date@test.local');
insert into profiles (id, display_name)
  select id, 'Retention fixture' from auth.users where id::text like '13100000-%'
  on conflict (id) do nothing;
insert into zabelie_kyc_submissions (user_id, status, decided_at)
  select id, 'approved', now() - interval '10 years' from profiles where id::text like '13100000-%';
insert into zabelie_kyc_documents (user_id, kind, storage_path)
  select id, 'cin', id::text || '/fixture.jpg' from profiles where id::text like '13100000-%';

update profiles set suspended_reason = 'moderation', suspended_at = now() - interval '10 years'
  where id = '13100000-0000-4000-8000-000000000002';
update profiles set suspended_reason = 'account_closed', suspended_at = now()
  where id = '13100000-0000-4000-8000-000000000003';
update profiles set suspended_reason = 'account_closed', suspended_at = now() - interval '6 years'
  where id = '13100000-0000-4000-8000-000000000004';
-- Calendar five-year boundary, including leap days: no expiry at equality.
update profiles set suspended_reason = 'account_closed', suspended_at = now() - interval '5 years'
  where id = '13100000-0000-4000-8000-000000000005';
-- Historical closure marker without proof of its date: no invented expiry.
update profiles set suspended_reason = 'account_closed', suspended_at = null
  where id = '13100000-0000-4000-8000-000000000006';

do $$
declare v_n integer; v_at timestamptz;
begin
  if (select count(*) from zabelie_kyc_docs_expires() where storage_path like '13100000-%') <> 1
     or not exists (select 1 from zabelie_kyc_docs_expires() where storage_path like '13100000-0000-4000-8000-000000000004/%') then
    raise exception 'R1: active, suspended, recent or equality-boundary dossier expired';
  end if;
  -- An arbitrary list passed to the RPC cannot delete active documents.
  v_n := zabelie_purge_kyc_documents(array(select id from zabelie_kyc_documents where user_id in
    ('13100000-0000-4000-8000-000000000001','13100000-0000-4000-8000-000000000002','13100000-0000-4000-8000-000000000003','13100000-0000-4000-8000-000000000005')));
  if v_n <> 0 then raise exception 'R2: unexpired metadata deleted'; end if;
  select suspended_at into v_at from profiles where id = '13100000-0000-4000-8000-000000000004';
  update profiles set suspended_at = now() where id = '13100000-0000-4000-8000-000000000004';
  if (select suspended_at from profiles where id = '13100000-0000-4000-8000-000000000004') is distinct from v_at then
    raise exception 'R3: closure retry restarted retention';
  end if;
  begin
    update profiles set suspended_at = null, suspended_reason = null where id = '13100000-0000-4000-8000-000000000004';
    raise exception 'R3: admin restored an anonymized account';
  exception when sqlstate 'ZB131' then null;
  end;
  begin
    update profiles set suspended_reason = null where id = '13100000-0000-4000-8000-000000000006';
    raise exception 'R3: restored historical closed account without a date';
  exception when sqlstate 'ZB131' then null;
  end;
  if date '2020-02-29' + make_interval(years => (select retention_annees from zabelie_kyc_config)) <> timestamp '2025-02-28' then
    raise exception 'R3: leap-day period is not five calendar years';
  end if;
  -- Decision and even absence of a dossier do not change the account clock.
  delete from zabelie_kyc_submissions where user_id = '13100000-0000-4000-8000-000000000004';
  v_n := zabelie_purge_kyc_documents(array(select id from zabelie_kyc_documents where user_id = '13100000-0000-4000-8000-000000000004'));
  if v_n <> 1 then raise exception 'R4: expired closed-account document not deleted'; end if;
  if (select count(*) from zabelie_kyc_documents where user_id::text like '13100000-%') <> 5 then
    raise exception 'R4: unexpected metadata loss';
  end if;
  raise notice 'R1-R4 OK: closed-account calendar period only; retry and deletion guard';
end $$;

-- Authenticated clients cannot forge the closure date through profile UPDATE.
set local role authenticated;
set local request.jwt.claim.sub = '13100000-0000-4000-8000-000000000001';
update profiles set suspended_reason = 'account_closed', suspended_at = now() - interval '10 years'
  where id = '13100000-0000-4000-8000-000000000001';
reset role;
do $$
begin
  if (select suspended_at from profiles where id = '13100000-0000-4000-8000-000000000001') is not null then
    raise exception 'R5: client forged closure';
  end if;
  if has_function_privilege('anon','zabelie_kyc_docs_expires()','execute')
     or has_function_privilege('authenticated','zabelie_kyc_docs_expires()','execute')
     or has_function_privilege('anon','zabelie_purge_kyc_documents(uuid[])','execute')
     or has_function_privilege('authenticated','zabelie_purge_kyc_documents(uuid[])','execute') then
    raise exception 'R5: client can read or purge private document metadata';
  end if;
end $$;
set local role service_role;
select count(*) from zabelie_kyc_docs_expires();
select zabelie_purge_kyc_documents('{}');
reset role;
rollback;
