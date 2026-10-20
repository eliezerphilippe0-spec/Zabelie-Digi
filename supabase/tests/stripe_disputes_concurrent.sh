#!/usr/bin/env bash
# 0151: two real PostgreSQL sessions, both lock acquisition orders. Isolated
# local CI database only; the immutable receipts/ledger remain until DB disposal.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL requis}"
[[ "$DATABASE_URL" =~ ^postgres(ql)?://[^/]*@(localhost|127\.0\.0\.1)(:[0-9]+)?/ ]] || {
  echo "Stripe concurrency fixtures require the isolated local CI database"; exit 1;
}
PSQL=(psql -X -v ON_ERROR_STOP=1 -q "$DATABASE_URL")
SD_TMP="$(mktemp -d)"
SD_ACTOR_PID=''
SD_FREEZE_BEFORE="$("${PSQL[@]}" -tAc 'select stripe_dispute_freeze_enabled from zabelie_operations_config where id')"
cleanup() {
  if [[ -n "$SD_ACTOR_PID" ]]; then kill "$SD_ACTOR_PID" 2>/dev/null || true; fi
  if [[ "$SD_FREEZE_BEFORE" = t || "$SD_FREEZE_BEFORE" = f ]]; then
    "${PSQL[@]}" -c "update zabelie_operations_config set stripe_dispute_freeze_enabled='$SD_FREEZE_BEFORE'::boolean where id" >/dev/null || true
  fi
  if [[ -d "$SD_TMP" && "$SD_TMP" = /tmp/* ]]; then rm -rf -- "$SD_TMP"; fi
}
trap cleanup EXIT

# Synchronisation observes a real server sleep AFTER the first transaction has
# acquired its row locks and performed the mutation. A timer alone would not
# prove which side won. An absent signal fails loudly, with actor output.
wait_for_actor_sleep() {
  local application="$1" sleeping
  for _ in $(seq 1 80); do
    sleeping="$("${PSQL[@]}" -tAc "select count(*) from pg_stat_activity where application_name='$application' and wait_event='PgSleep'")"
    [[ "$sleeping" = 1 ]] && return 0
    sleep 0.05
  done
  cat "$SD_TMP/actor.txt"
  echo "Stripe concurrency synchronisation missing: $application"
  exit 1
}

"${PSQL[@]}" <<'SQL'
insert into auth.users(id,email) values
 ('15100000-0000-4000-8000-000000000001','stripe-concurrent-seller@test.local'),
 ('15100000-0000-4000-8000-000000000002','stripe-concurrent-buyer@test.local');
update profiles set role='creator' where id='15100000-0000-4000-8000-000000000001';
insert into products(id,seller_id,slug,title,kind,price_htg,status) values
 ('25100000-0000-4000-8000-000000000001','15100000-0000-4000-8000-000000000001',
  'stripe-concurrency','Stripe concurrency fixture','fichier',1000,'published');
insert into orders(id,buyer_id,product_id,amount_htg,status) values
 ('35100000-0000-4000-8000-000000000001','15100000-0000-4000-8000-000000000002','25100000-0000-4000-8000-000000000001',1000,'paid'),
 ('35100000-0000-4000-8000-000000000002','15100000-0000-4000-8000-000000000002','25100000-0000-4000-8000-000000000001',1000,'paid');
insert into payments(order_id,rail,idempotency_key,status,provider_ref,expected_usd_cents,raw,confirmed_at) values
 ('35100000-0000-4000-8000-000000000001','stripe','sd_concurrent_hold','confirmed','pi_concurrent_hold',1000,'{"stripe_livemode":false}',now()),
 ('35100000-0000-4000-8000-000000000002','stripe','sd_concurrent_mature','confirmed','pi_concurrent_mature',1000,'{"stripe_livemode":false}',now());
insert into wallets(owner_id,pending_htg) values('15100000-0000-4000-8000-000000000001',1800);
insert into escrow_entries(order_id,wallet_id,amount_htg,matures_at)
 select o.id,w.id,900,now()+interval '7 days' from orders o cross join wallets w
 where o.id in('35100000-0000-4000-8000-000000000001','35100000-0000-4000-8000-000000000002')
   and w.owner_id='15100000-0000-4000-8000-000000000001';
insert into wallet_transactions(wallet_id,type,amount_htg,order_id,idempotency_key)
 select e.wallet_id,'credit',e.amount_htg,e.order_id,'sd_concurrent:'||e.order_id
 from escrow_entries e where e.order_id in('35100000-0000-4000-8000-000000000001','35100000-0000-4000-8000-000000000002');
update zabelie_operations_config set stripe_dispute_freeze_enabled=true where id;
update escrow_entries set matures_at=now()-interval '1 day' where order_id='35100000-0000-4000-8000-000000000001';
SQL

# A. The hold transaction owns the escrow row before maturation starts its
# statement snapshot. After waiting, UPDATE must re-evaluate the hold predicate.
"${PSQL[@]}" >"$SD_TMP/actor.txt" 2>&1 <<'SQL' &
set application_name='zabelie_sd_hold_first';
begin;
set local role service_role;
select zabelie_record_stripe_dispute('evt_concurrent_hold','charge.dispute.created','dp_concurrent_hold',
 'pi_concurrent_hold','ch_concurrent_hold','needs_response',500,'usd',false);
select pg_sleep(3);
commit;
SQL
SD_ACTOR_PID=$!
wait_for_actor_sleep zabelie_sd_hold_first
"${PSQL[@]}" -c 'select mature_wallets();' >"$SD_TMP/maturation.txt"
wait "$SD_ACTOR_PID"
SD_ACTOR_PID=''
"${PSQL[@]}" <<'SQL'
do $$ begin
 assert (select status='maturing' and dispute_frozen_at is not null from escrow_entries
   where order_id='35100000-0000-4000-8000-000000000001'),'SDC1: maturation bypassed concurrent hold';
 assert (select pending_htg=1800 and balance_htg=0 from wallets
   where owner_id='15100000-0000-4000-8000-000000000001'),'SDC1: hold-first moved money';
end $$;
update escrow_entries set matures_at=now()-interval '1 day' where order_id='35100000-0000-4000-8000-000000000002';
SQL

# B. Maturation owns the escrow row and wallet first. The dispute waits, then
# observes matured, and cannot debit the wallet or return funds to pending.
"${PSQL[@]}" >"$SD_TMP/actor.txt" 2>&1 <<'SQL' &
set application_name='zabelie_sd_mature_first';
begin;
select mature_wallets();
select pg_sleep(3);
commit;
SQL
SD_ACTOR_PID=$!
wait_for_actor_sleep zabelie_sd_mature_first
SD_REVIEW="$("${PSQL[@]}" -tAc "select zabelie_record_stripe_dispute('evt_concurrent_mature','charge.dispute.created','dp_concurrent_mature','pi_concurrent_mature','ch_concurrent_mature','needs_response',500,'usd',false)->>'reason'")"
wait "$SD_ACTOR_PID"
SD_ACTOR_PID=''
[[ "$SD_REVIEW" = post_maturation_review ]] || { echo "SDC2: expected post_maturation_review, got $SD_REVIEW"; exit 1; }
"${PSQL[@]}" <<'SQL'
do $$ begin
 assert (select status='matured' and dispute_frozen_at is null from escrow_entries
   where order_id='35100000-0000-4000-8000-000000000002'),'SDC2: matured escrow reversed or frozen';
 assert (select pending_htg=900 and balance_htg=900 from wallets
   where owner_id='15100000-0000-4000-8000-000000000001'),'SDC2: matured balance clawed back';
 assert (select count(*) from wallet_transactions where wallet_id=(select id from wallets
   where owner_id='15100000-0000-4000-8000-000000000001'))=2,'SDC2: dispute wrote ledger';
 assert (select count(*) from zabelie_stripe_dispute_events
   where event_id in('evt_concurrent_hold','evt_concurrent_mature'))=2,'SDC2: concurrent receipt lost';
 assert (select ecart_htg=0 from zabelie_wallet_coherence where owner_id='15100000-0000-4000-8000-000000000001'),'SDC2: incoherent wallet';
end $$;
SQL
echo '✓ Stripe concurrency: hold-first skips maturity; maturity-first is human review without debit'
