#!/usr/bin/env bash
# Real concurrent confirmations: exactly one of four buyers may use the last bonus.
# Only run by the isolated SQL test harness; the database is discarded by CI.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL requis}"
PSQL=(psql -v ON_ERROR_STOP=1 -q "$DATABASE_URL")
"${PSQL[@]}" <<'SQL'
insert into auth.users(id,email,created_at) values
('19000000-0000-4000-8000-000000000001','concurrent-seller@test.local',now()),
('19000000-0000-4000-8000-000000000002','concurrent-buyer@test.local',now());
update zabelie_seller_pricing_config set enabled=true,payments_ready=true,usd_htg_micros=132000000;
insert into products(id,seller_id,slug,title,kind,price_htg,status)
 values('29000000-0000-4000-8000-000000000001','19000000-0000-4000-8000-000000000001','concurrent-pricing','Concurrent','service',1000,'published');
update zabelie_seller_launch set used_sales=2 where seller_id='19000000-0000-4000-8000-000000000001';
insert into orders(id,buyer_id,product_id,amount_htg,zabelie_payment_is_live)
select ('39000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
'19000000-0000-4000-8000-000000000002','29000000-0000-4000-8000-000000000001',1000,true
from generate_series(1,4)n;
insert into payments(order_id,idempotency_key)
select id,'pricing-concurrent-'||right(id::text,1) from orders where product_id='29000000-0000-4000-8000-000000000001';
SQL
pids=()
for n in 1 2 3 4; do
  "${PSQL[@]}" -c "select confirm_payment('pricing-concurrent-$n','concurrent','{}',1000,null);" &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done
"${PSQL[@]}" <<'SQL'
do $$
begin
 if (select used_sales from zabelie_seller_launch where seller_id='19000000-0000-4000-8000-000000000001')<>3 then raise exception 'concurrent quota mismatch'; end if;
 if (select count(*) from orders where product_id='29000000-0000-4000-8000-000000000001' and status='paid')<>4 then raise exception 'a concurrent payment failed'; end if;
 if (select count(*) from zabelie_order_pricing where seller_id='19000000-0000-4000-8000-000000000001' and launch_discount_htg>0)<>1 then raise exception 'last bonus used more than once'; end if;
 if (select sum(commission_htg) from platform_earnings where order_id in (select id from orders where product_id='29000000-0000-4000-8000-000000000001'))<>581 then raise exception 'concurrent fees mismatch'; end if;
end $$;
SQL
echo "✓ concurrent seller pricing OK"
