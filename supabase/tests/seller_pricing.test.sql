begin;
insert into auth.users(id,email,created_at) values
('10000000-0000-4000-8000-000000000001','launch-seller@test.local',now()-interval '1 day'),
('10000000-0000-4000-8000-000000000002','launch-buyer@test.local',now()),
('10000000-0000-4000-8000-000000000003','legacy-seller@test.local',now()-interval '100 days'),
('10000000-0000-4000-8000-000000000004','late-seller@test.local',now()-interval '8 days');
insert into products(id,seller_id,slug,title,kind,price_htg,status)
 values('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','pricing-legacy','Legacy','service',1000,'published');
insert into orders(id,buyer_id,product_id,amount_htg) values
('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003',1000);
insert into payments(order_id,idempotency_key) values('30000000-0000-4000-8000-000000000003','pricing-legacy');
update zabelie_seller_pricing_config set enabled=true,usd_htg_micros=132000000;
insert into products(id,seller_id,slug,title,kind,price_htg,status)
 values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','pricing-launch','Launch','service',1000,'draft');
-- An editable profile date cannot make an old Auth account eligible.
update profiles set created_at=now() where id='10000000-0000-4000-8000-000000000004';
insert into products(id,seller_id,slug,title,kind,price_htg,status)
 values('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004','pricing-late','Late','service',1000,'draft');

create function pg_temp.pricing_order(amount integer, source text default 'direct', live boolean default true,
  buyer uuid default '10000000-0000-4000-8000-000000000002', confirm boolean default true)
returns uuid language plpgsql as $$
declare oid uuid:=gen_random_uuid();
begin
 insert into orders(id,buyer_id,product_id,amount_htg,zabelie_sale_source,zabelie_payment_is_live)
 values(oid,buyer,'20000000-0000-4000-8000-000000000001',amount,source,live);
 insert into payments(order_id,idempotency_key) values(oid,oid::text);
 if confirm then perform confirm_payment(oid::text,'pricing-test','{}',amount,null); end if;
 return oid;
end $$;

do $$
declare oid uuid; fee bigint; before_count integer; t timestamptz; n bigint;
begin
 if (select eligible from zabelie_seller_launch where seller_id='10000000-0000-4000-8000-000000000004') then
   raise exception 'editable profile granted eligibility'; end if;
 if (select starts_at is not null from zabelie_seller_launch where seller_id='10000000-0000-4000-8000-000000000001') then
   raise exception 'draft started launch'; end if;
 update products set status='published' where id='20000000-0000-4000-8000-000000000001';
 if (select starts_at is not null from zabelie_seller_launch where seller_id='10000000-0000-4000-8000-000000000001') then
   raise exception 'unready payments started launch'; end if;
 update zabelie_seller_pricing_config set payments_ready=true;
 select starts_at into t from zabelie_seller_launch where seller_id='10000000-0000-4000-8000-000000000001';
 if t is null or (select ends_at-starts_at from zabelie_seller_launch where seller_id='10000000-0000-4000-8000-000000000001') <> interval '30 days' then
   raise exception 'launch not exactly 30 days'; end if;
 update products set status='draft' where id='20000000-0000-4000-8000-000000000001';
 update products set status='published' where id='20000000-0000-4000-8000-000000000001';
 if (select starts_at from zabelie_seller_launch where seller_id='10000000-0000-4000-8000-000000000001')<>t then raise exception 'republishing reset launch'; end if;

 perform confirm_payment('pricing-legacy','legacy','{}',1000,null);
 if (select commission_htg from platform_earnings where order_id='30000000-0000-4000-8000-000000000003')<>100 then raise exception 'legacy order repriced'; end if;

 oid:=pg_temp.pricing_order(0);
 if (select commission_htg from platform_earnings where order_id=oid)<>0 then raise exception 'free sale charged'; end if;
 oid:=pg_temp.pricing_order(1000,'direct',false);
 if (select commission_htg from platform_earnings where order_id=oid)<>166 then raise exception 'sandbox fee mismatch'; end if;
 oid:=pg_temp.pricing_order(1000,'direct',true,'10000000-0000-4000-8000-000000000001');
 if (select launch_discount_htg from zabelie_order_pricing where order_id=oid)<>0 then raise exception 'self purchase bonus'; end if;
 oid:=pg_temp.pricing_order(1000,'direct',true,'10000000-0000-4000-8000-000000000002',false);
 perform confirm_payment(oid::text,'mismatch','{}',999,null);
 if (select used_sales from zabelie_seller_launch where seller_id='10000000-0000-4000-8000-000000000001')<>0 then raise exception 'free/sandbox/self/failed consumed bonus'; end if;

 oid:=pg_temp.pricing_order(1000);
 if (select commission_htg from platform_earnings where order_id=oid)<>83 then raise exception 'direct launch fee'; end if;
 perform confirm_payment(oid::text,'replay','{}',1000,null);
 if (select used_sales from zabelie_seller_launch where seller_id='10000000-0000-4000-8000-000000000001')<>1 then raise exception 'replay consumed quota'; end if;
 if (select sum(amount_htg) from escrow_entries where order_id=oid)<>917 then raise exception 'net ledger mismatch'; end if;
 perform refund_order(oid);
 if (select used_sales from zabelie_seller_launch where seller_id='10000000-0000-4000-8000-000000000001')<>1 then raise exception 'refund restored quota'; end if;
 begin
   update zabelie_order_pricing set rate_bps=0 where order_id=oid;
   raise exception 'mutable settled contract';
 exception when check_violation then null; end;

 oid:=pg_temp.pricing_order(1000,'discovery');
 if (select commission_htg from platform_earnings where order_id=oid)<>150 then raise exception 'discovery launch fee'; end if;
 oid:=pg_temp.pricing_order(999);
 if (select commission_htg from platform_earnings where order_id=oid)<>82 then raise exception 'rounding is not seller-favourable'; end if;
 oid:=pg_temp.pricing_order(1000);
 if (select commission_htg from platform_earnings where order_id=oid)<>166 then raise exception 'fourth sale discounted'; end if;
 if (select used_sales from zabelie_seller_launch where seller_id='10000000-0000-4000-8000-000000000001')<>3 then raise exception 'quota wrong'; end if;

 oid:=pg_temp.pricing_order(1000,'direct',true,'10000000-0000-4000-8000-000000000002',false);
 update zabelie_seller_pricing_config set usd_htg_micros=200000000,direct_rate_bps=2000;
 perform confirm_payment(oid::text,'frozen','{}',1000,null);
 if (select commission_htg from platform_earnings where order_id=oid)<>166 then raise exception 'rate changed after checkout'; end if;
 update zabelie_seller_launch set used_sales=0,starts_at=now()-interval '31 days',ends_at=now()
  where seller_id='10000000-0000-4000-8000-000000000001';
 oid:=pg_temp.pricing_order(1000);
 if (select commission_htg from platform_earnings where order_id=oid)<>300 then raise exception 'expired launch still discounts'; end if;
 oid:=pg_temp.pricing_order(1);
 if (select commission_htg from platform_earnings where order_id=oid)<>1 then raise exception 'fixed fee exceeds gross'; end if;
 raise notice 'seller pricing: legacy, launch timing, modes, quota, replay, refund, snapshots, expiry and rounding OK';
end $$;

-- Actual privilege checks, not just catalog introspection.
set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-4000-8000-000000000002';
do $$ begin
 if exists(select 1 from zabelie_seller_launch) or exists(select 1 from zabelie_order_pricing) then raise exception 'buyer sees private seller fees'; end if;
 begin
   update zabelie_seller_pricing_config set direct_rate_bps=0;
   raise exception 'client changed fee';
 exception when insufficient_privilege then null; end;
 begin
   perform zabelie_settle_order_pricing('30000000-0000-4000-8000-000000000003',0);
   raise exception 'client settled fee';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;

