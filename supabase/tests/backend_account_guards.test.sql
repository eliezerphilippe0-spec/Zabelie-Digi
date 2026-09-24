begin;
insert into auth.users(id,email) values
 ('11200000-0000-4000-8000-000000000001','guards-seller@test.local'),
 ('11200000-0000-4000-8000-000000000002','guards-buyer@test.local');
update profiles set boutik_slug='guards-seller',role='creator' where id='11200000-0000-4000-8000-000000000001';
insert into products(id,seller_id,slug,title,kind,price_htg,status) values
 ('11200000-0000-4000-8000-000000000003','11200000-0000-4000-8000-000000000001','guards-product','Guard fixture','physical',1000,'published');
insert into zabelie_product_variants(id,product_id,sku,price_htg) values
 ('11200000-0000-4000-8000-000000000004','11200000-0000-4000-8000-000000000003','GUARDS-112',1000);
insert into zabelie_stock(variant_id,quantity_available) values('11200000-0000-4000-8000-000000000004',5)
 on conflict(variant_id) do update set quantity_available=5;
do $$
declare oid uuid:=gen_random_uuid(); paid_id uuid:=gen_random_uuid(); s text; p payments;
begin
 assert zabelie_boutik_public(null,'guards-seller') is not null,'active storefront missing';
 insert into orders(id,buyer_id,product_id,amount_htg) values
 (oid,'11200000-0000-4000-8000-000000000002','11200000-0000-4000-8000-000000000003',1000);
 insert into payments(order_id,idempotency_key,rail,expected_usd_cents,raw)
 values(oid,oid::text,'stripe',1250,'{"stripe_session_id":"cs_test"}');
 perform zabelie_reserve_stock('11200000-0000-4000-8000-000000000004',oid,2);
 assert (select quantity_reserved from zabelie_stock where variant_id='11200000-0000-4000-8000-000000000004')=2,'reservation absent';
 begin
   perform zabelie_stripe_payment_failed(oid,'cs_other','evt_bad');
   raise exception 'accepted another Stripe session';
 exception when sqlstate 'ZB112' then null; end;
 assert (select status from payments where order_id=oid)='pending','mismatched event changed payment';
 s:=zabelie_stripe_payment_failed(oid,'cs_test','evt_failed');
 assert s='failed','failure not recorded';
 assert (select status from orders where id=oid)='cancelled','order not cancelled';
 assert (select quantity_available from zabelie_stock where variant_id='11200000-0000-4000-8000-000000000004')=5,'stock not released';
 perform zabelie_stripe_payment_failed(oid,'cs_test','evt_duplicate');
 assert (select quantity_available from zabelie_stock where variant_id='11200000-0000-4000-8000-000000000004')=5,'duplicate released stock twice';
 insert into orders(id,buyer_id,product_id,amount_htg) values
 (paid_id,'11200000-0000-4000-8000-000000000002','11200000-0000-4000-8000-000000000003',1000);
 insert into payments(order_id,idempotency_key,rail,expected_usd_cents,raw)
 values(paid_id,paid_id::text,'stripe',1250,'{"stripe_session_id":"cs_paid"}');
 perform zabelie_reserve_stock('11200000-0000-4000-8000-000000000004',paid_id,1);
 update profiles set suspended_at=now() where id='11200000-0000-4000-8000-000000000001';
 assert zabelie_boutik_public('11200000-0000-4000-8000-000000000001',null) is null,'closed shop exposed by ID';
 assert zabelie_boutik_public(null,'guards-seller') is null,'closed shop exposed by slug';
 begin
   insert into orders(buyer_id,product_id,amount_htg) values
   ('11200000-0000-4000-8000-000000000002','11200000-0000-4000-8000-000000000003',1000);
   raise exception 'suspended seller accepted a new order';
 exception when sqlstate 'ZB112' then null; end;
 p:=confirm_payment(paid_id::text,'pi_paid','{"stripe_session_id":"cs_paid"}',null,1250);
 assert p.status='confirmed','existing order settlement blocked by suspension';
 perform confirm_payment(paid_id::text,'pi_paid','{"stripe_session_id":"cs_paid"}',null,1250);
 s:=zabelie_stripe_payment_failed(paid_id,'cs_paid','evt_late_failure');
 assert s='confirmed','late failure downgraded confirmed payment';
 assert (select status from orders where id=paid_id)='paid','late failure cancelled paid order';
 assert (select quantity_available from zabelie_stock where variant_id='11200000-0000-4000-8000-000000000004')=4,'duplicate settlement or late failure changed stock';
 assert not has_function_privilege('anon','zabelie_stripe_payment_failed(uuid,text,text)','execute'),'anonymous failure RPC';
 assert not has_function_privilege('authenticated','zabelie_stripe_payment_failed(uuid,text,text)','execute'),'buyer failure RPC';
 assert has_function_privilege('service_role','zabelie_stripe_payment_failed(uuid,text,text)','execute'),'server cannot fail payment';
end $$;
rollback;
