#!/usr/bin/env bash
# Real Postgres sessions: a decision/closure and a registration must serialize.
# Uses only synthetic accounts in the disposable SQL CI database.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL requis}"
PSQL=(psql -v ON_ERROR_STOP=1 -q "$DATABASE_URL")
"${PSQL[@]}" <<'SQL'
insert into auth.users(id,email) select
  ('13010000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'kyc-concurrent-' || n || '@test.local' from generate_series(1,3) n;
insert into zabelie_kyc_submissions(user_id,submitted_at)
values('13010000-0000-4000-8000-000000000001','2026-10-05T10:00:00Z');
SQL

# The marker is acquired AFTER the competing write/registration. Waiting for
# it avoids mistaking a sequential test for a concurrency test.
wait_marker() {
  for _ in {1..100}; do
    if [[ $("${PSQL[@]}" -Atc "select exists(select 1 from pg_locks where locktype='advisory' and objid=$1 and granted)") == t ]]; then return; fi
    sleep 0.02
  done
  echo "KYC concurrency marker $1 was not reached" >&2
  return 1
}

"${PSQL[@]}" <<'SQL' &
begin;
update zabelie_kyc_submissions set status='approved',decided_at=clock_timestamp(),
  decided_by=user_id where user_id='13010000-0000-4000-8000-000000000001';
select pg_advisory_lock(130001);
select pg_sleep(2);
commit;
SQL
decision_pid=$!
wait_marker 130001
"${PSQL[@]}" <<'SQL'
do $$ declare v_result jsonb; begin
  v_result := zabelie_register_kyc_document('13010000-0000-4000-8000-000000000001','cin',
    '13010000-0000-4000-8000-000000000001/13010000-0000-4000-8000-000000000101.jpg',
    '{"status":"pending","submitted_at":"2026-10-05T10:00:00Z","decided_at":null}');
  if v_result->>'code' is distinct from 'locked' then raise exception 'concurrent approval overwritten'; end if;
end $$;
SQL
wait "$decision_pid"

"${PSQL[@]}" <<'SQL' &
begin;
update profiles set suspended_at=clock_timestamp(),suspended_reason='account_closed'
  where id='13010000-0000-4000-8000-000000000002';
select pg_advisory_lock(130002);
select pg_sleep(2);
commit;
SQL
closure_pid=$!
wait_marker 130002
"${PSQL[@]}" <<'SQL'
do $$ declare v_result jsonb; begin
  v_result := zabelie_register_kyc_document('13010000-0000-4000-8000-000000000002','cin',
    '13010000-0000-4000-8000-000000000002/13010000-0000-4000-8000-000000000102.jpg',null);
  if v_result->>'code' is distinct from 'account_inactive' then raise exception 'closed account created first dossier'; end if;
end $$;
SQL
wait "$closure_pid"

"${PSQL[@]}" <<'SQL' &
begin;
select zabelie_register_kyc_document('13010000-0000-4000-8000-000000000003','cin',
  '13010000-0000-4000-8000-000000000003/13010000-0000-4000-8000-000000000103.jpg',null);
select pg_advisory_lock(130003);
select pg_sleep(2);
commit;
SQL
registration_pid=$!
wait_marker 130003
"${PSQL[@]}" <<'SQL'
begin;
update profiles set suspended_at=clock_timestamp(),suspended_reason='account_closed'
  where id='13010000-0000-4000-8000-000000000003';
update zabelie_kyc_submissions set status='rejected',decided_at=clock_timestamp()
  where user_id='13010000-0000-4000-8000-000000000003' and status='pending';
commit;
do $$ begin
  if (select count(*) from zabelie_kyc_documents where user_id='13010000-0000-4000-8000-000000000003') <> 1 or
     not exists(select 1 from zabelie_kyc_submissions where user_id='13010000-0000-4000-8000-000000000003' and status='rejected' and decided_at is not null) then
    raise exception 'registration committed before closure but purge clock did not start';
  end if;
  if exists(select 1 from zabelie_kyc_documents where user_id in ('13010000-0000-4000-8000-000000000001','13010000-0000-4000-8000-000000000002')) then
    raise exception 'refused concurrent registration inserted a document';
  end if;
end $$;
SQL
wait "$registration_pid"
echo "✓ concurrent KYC registration OK"
