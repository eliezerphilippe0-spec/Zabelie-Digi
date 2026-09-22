-- Synthetic data for the CI-only dump/restore rehearsal. Never run in production.
begin;
insert into auth.users(id,email) values
 ('11300000-0000-4000-8000-000000000001','restore-seller@test.local'),
 ('11300000-0000-4000-8000-000000000003','restore-buyer@test.local'),
 ('11300000-0000-4000-8000-000000000004','restore-foreign@test.local'),
 ('11300000-0000-4000-8000-000000000005','restore-admin@test.local');
update profiles set role='creator' where id='11300000-0000-4000-8000-000000000001';
update profiles set role='admin' where id='11300000-0000-4000-8000-000000000005';
insert into products(id,seller_id,slug,title,kind,price_htg,status) values
 ('11300000-0000-4000-8000-000000000010','11300000-0000-4000-8000-000000000001','restore-fixture','Restore fixture','physical',1000,'published');
insert into orders(id,buyer_id,product_id,amount_htg) values
 ('11300000-0000-4000-8000-000000000020','11300000-0000-4000-8000-000000000003','11300000-0000-4000-8000-000000000010',1000),
 ('11300000-0000-4000-8000-000000000021','11300000-0000-4000-8000-000000000003','11300000-0000-4000-8000-000000000010',1000),
 ('11300000-0000-4000-8000-000000000022','11300000-0000-4000-8000-000000000003','11300000-0000-4000-8000-000000000010',1000);
insert into payments(order_id,idempotency_key,rail) values
 ('11300000-0000-4000-8000-000000000020','11300000-0000-4000-8000-000000000020','moncash');
select confirm_payment('11300000-0000-4000-8000-000000000020','restore-payment',null,1000);
select zabelie_submit_support('11300000-0000-4000-8000-000000000020','11300000-0000-4000-8000-000000000003',gen_random_uuid(),'other','Message fictif de restauration.');
select zabelie_submit_support('11300000-0000-4000-8000-000000000020','11300000-0000-4000-8000-000000000001',gen_random_uuid(),'other','Réponse fictive du vendeur.');
select zabelie_submit_support('11300000-0000-4000-8000-000000000020','11300000-0000-4000-8000-000000000005',gen_random_uuid(),'other','Réponse fictive administrateur.','resolved');
select refund_order('11300000-0000-4000-8000-000000000020');
select zabelie_record_refund_receipt('11300000-0000-4000-8000-000000000020','11300000-0000-4000-8000-000000000005','moncash','restore-refund',now());
commit;
