#!/usr/bin/env bash
# 0152 : deux connexions PostgreSQL réelles, les deux ordres de verrou pour
# publication/couverture, publication/ajout et publication/retrait ; quotas.
# Uniquement la base locale jetable de CI, jamais le projet Supabase distant.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL requis}"
[[ "$DATABASE_URL" =~ ^postgres(ql)?://[^/]*@(localhost|127\.0\.0\.1)(:[0-9]+)?/ ]] || {
  echo "Media review races require the isolated local CI database"; exit 1;
}
PSQL=(psql -X -v ON_ERROR_STOP=1 -q "$DATABASE_URL")
MR_TMP="$(mktemp -d)"
MR_ACTOR_PID=''
cleanup() {
  if [[ -n "$MR_ACTOR_PID" ]]; then kill "$MR_ACTOR_PID" 2>/dev/null || true; fi
  if [[ -d "$MR_TMP" && "$MR_TMP" = /tmp/* ]]; then
    rm -f -- "$MR_TMP"/*.txt
    rmdir -- "$MR_TMP"
  fi
}
trap cleanup EXIT

wait_for_sleep() {
  local application="$1" sleeping
  for _ in $(seq 1 100); do
    sleeping="$("${PSQL[@]}" -tAc "select count(*) from pg_stat_activity where application_name='$application' and wait_event='PgSleep'")"
    [[ "$sleeping" = 1 ]] && return 0
    sleep 0.05
  done
  cat "$MR_TMP/actor.txt"
  echo "Media review concurrency marker missing: $application"
  exit 1
}

MR_P='25200000-0000-4000-8000-000000000099'
MR_M='35200000-0000-4000-8000-000000000099'
"${PSQL[@]}" <<SQL
insert into auth.users(id,email) values('15200000-0000-4000-8000-000000000099','media-review-concurrent@test.local');
insert into products(id,seller_id,slug,title,kind,price_htg,status,cover_url)
 values('$MR_P','15200000-0000-4000-8000-000000000099','media-review-concurrent','Media review race','physical',100,'draft','https://cdn.test/initial.webp');
SQL

# L'acteur acquiert le verrou et effectue sa mutation AVANT son signal PgSleep.
# L'autre connexion doit attendre ce COMMIT : un délai seul ne prouverait pas
# quel ordre a réellement été exercé.
race() {
  local label="$1" seed="$2" first="$3" second="$4" expected="$5" media_count="$6"
  "${PSQL[@]}" <<SQL
update products set status='draft' where id='$MR_P';
delete from zabelie_product_media where product_id='$MR_P';
update products set cover_url='https://cdn.test/initial.webp' where id='$MR_P';
$seed
SQL
  "${PSQL[@]}" >"$MR_TMP/actor.txt" 2>&1 <<SQL &
set application_name='$label';
begin;
set local role service_role;
$first
select pg_sleep(2);
commit;
SQL
  MR_ACTOR_PID=$!
  wait_for_sleep "$label"
  "${PSQL[@]}" >"$MR_TMP/second.txt" 2>&1 <<SQL
set lock_timeout='6s';
set role service_role;
$second
SQL
  wait "$MR_ACTOR_PID"
  MR_ACTOR_PID=''
  "${PSQL[@]}" <<SQL
do \$\$ begin
  assert (select status='$expected' from products where id='$MR_P'), '$label: publication/revision order was not atomic';
  assert (select count(*)=$media_count from zabelie_product_media where product_id='$MR_P'), '$label: gallery mutation missing';
end \$\$;
SQL
}

publish="update products set status='published' where id='$MR_P';"
cover="update products set cover_url='https://cdn.test/unique-race.webp' where id='$MR_P';"
add="insert into zabelie_product_media(id,product_id,kind,storage_path) values('$MR_M','$MR_P','image','media-review/race.webp');"
remove="delete from zabelie_product_media where id='$MR_M';"

race zabelie_mr_publish_cover '' "$publish" "$cover" draft 0
race zabelie_mr_cover_publish '' "$cover" "$publish" published 0
race zabelie_mr_publish_add '' "$publish" "$add" draft 1
race zabelie_mr_add_publish '' "$add" "$publish" published 1
race zabelie_mr_publish_remove "$add" "$publish" "$remove" draft 0
race zabelie_mr_remove_publish "$add" "$remove" "$publish" published 0

# Dix clients visent la dernière place, avec un premier verrou observé. Tous
# les INSERT commencent avant son COMMIT ; exactement un gagne pour chaque kind.
for kind in image video; do
  "${PSQL[@]}" <<SQL
update products set status='draft' where id='$MR_P';
delete from zabelie_product_media where product_id='$MR_P';
SQL
  if [[ "$kind" = image ]]; then
    "${PSQL[@]}" -c "insert into zabelie_product_media(product_id,kind,storage_path) select '$MR_P','image','media-review/quota-'||n from generate_series(1,5) n;"
    total=6
  else
    total=1
  fi
  "${PSQL[@]}" >"$MR_TMP/actor.txt" 2>&1 <<SQL &
set application_name='zabelie_mr_quota_$kind';
begin;
select id from products where id='$MR_P' for update;
select pg_sleep(2);
commit;
SQL
  MR_ACTOR_PID=$!
  wait_for_sleep "zabelie_mr_quota_$kind"
  MR_PIDS=()
  for n in $(seq 1 10); do
    "${PSQL[@]}" -c "set role service_role; insert into zabelie_product_media(product_id,kind,storage_path) values('$MR_P','$kind','media-review/concurrent-$kind-$n');" \
      >"$MR_TMP/quota-$n.txt" 2>&1 &
    MR_PIDS+=("$!")
  done
  successes=0
  for pid in "${MR_PIDS[@]}"; do
    if wait "$pid"; then successes=$((successes+1)); fi
  done
  wait "$MR_ACTOR_PID"
  MR_ACTOR_PID=''
  [[ "$successes" = 1 ]] || { cat "$MR_TMP"/quota-*.txt; echo "Concurrent $kind quota: $successes winners, expected one"; exit 1; }
  for n in $(seq 1 10); do
    if [[ -s "$MR_TMP/quota-$n.txt" ]]; then
      grep -q 'ZB073' "$MR_TMP/quota-$n.txt" || { cat "$MR_TMP/quota-$n.txt"; exit 1; }
    fi
  done
  "${PSQL[@]}" -c "do \$\$ begin assert (select count(*)=$total from zabelie_product_media where product_id='$MR_P' and kind='$kind'), 'concurrent gallery quota exceeded'; end \$\$;"
done
echo "✓ media review concurrency OK (6 lock orders + 2 quota races)"
