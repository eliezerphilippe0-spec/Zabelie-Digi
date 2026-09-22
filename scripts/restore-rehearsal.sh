#!/usr/bin/env bash
# Restore a pg_dump custom archive ONLY into an existing empty local test database.
# Required: RESTORE_DATABASE_URL, BACKUP_DUMP. Never drops or truncates a database.
set -euo pipefail
: "${RESTORE_DATABASE_URL:?isolated restore database required}"
: "${BACKUP_DUMP:?custom-format pg_dump archive required}"
node --input-type=module -e '
 const u=new URL(process.env.RESTORE_DATABASE_URL);
 if(!["postgres:","postgresql:"].includes(u.protocol)||!["localhost","127.0.0.1","[::1]"].includes(u.hostname)||!/^\/zabelie_restore_[a-z0-9_]+$/.test(u.pathname)||u.search) process.exit(1);
' || { echo "Restore refused: use an isolated loopback zabelie_restore_* database."; exit 1; }
export PGDATABASE="$RESTORE_DATABASE_URL"
count="$(psql -X -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in ('pg_catalog','information_schema') and n.nspname not like 'pg_toast%' and c.relkind in ('r','p','v','m','S');")"
[[ "$count" == "0" ]] || { echo "Restore refused: target is not empty."; exit 1; }
pg_restore --exit-on-error --single-transaction --no-owner --dbname="$PGDATABASE" "$BACKUP_DUMP"
psql -X -v ON_ERROR_STOP=1 -c "select count(*) as missing_required_objects from zabelie_objets_requis() where not present;"
psql -X -v ON_ERROR_STOP=1 -c "do \$\$ begin if exists(select 1 from zabelie_objets_requis() where not present and objet<>'zabelie_purge_sent_notices(integer)') then raise exception 'Required restore objects missing'; end if; end \$\$;"
echo "Database restored in isolation. Complete Storage verification and application smoke tests before certifying recovery."
