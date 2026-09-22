#!/usr/bin/env bash
# Synthetic CI database only. Never accepts a remote database destination.
set -euo pipefail
[[ "${CI:-}" == "true" ]] || { echo "CI-only fixture rehearsal."; exit 1; }
: "${POSTGRES_CONTAINER:?CI postgres service id required}"
[[ "$POSTGRES_CONTAINER" =~ ^[a-f0-9]{64}$ ]] || exit 1
[[ "$(docker inspect --format '{{.Config.Image}}' "$POSTGRES_CONTAINER")" == "postgres:17" ]] || exit 1
# Keep the validated synthetic orders, conversations and refund receipt for the dump.
sed 's/^rollback;$/commit;/' supabase/tests/haiti_operations.test.sql | docker exec -i "$POSTGRES_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q
archive="${RUNNER_TEMP:?}/zabelie-recovery.dump"
docker exec "$POSTGRES_CONTAINER" pg_dump -U postgres --format=custom postgres > "$archive"
# createdb refuses an existing target. There is no DROP, --clean or overwrite path.
docker exec "$POSTGRES_CONTAINER" createdb -U postgres zabelie_restore_ci
docker exec -i "$POSTGRES_CONTAINER" pg_restore -U postgres --dbname=zabelie_restore_ci --exit-on-error --single-transaction --no-owner < "$archive"
docker exec -i "$POSTGRES_CONTAINER" psql -U postgres -d zabelie_restore_ci -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
 assert (select count(*) from orders where id::text like '11300000-%')=3,'orders missing after restore';
 assert (select count(*) from zabelie_support_messages)=3,'support history missing';
 assert (select count(*) from zabelie_refund_receipts)=1,'refund evidence missing';
 assert not exists(select 1 from zabelie_objets_requis() where not present),'required schema missing';
 assert not has_function_privilege('authenticated','zabelie_submit_support(uuid,uuid,uuid,text,text,text)','execute'),'restore opened service RPC';
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','11300000-0000-4000-8000-000000000004',false);
do $$ begin assert (select count(*) from zabelie_support_messages)=0,'RLS lost after restore'; end $$;
reset role;
SQL
echo "Synthetic database restored: orders, support evidence, RPC permissions and cross-account RLS verified."
