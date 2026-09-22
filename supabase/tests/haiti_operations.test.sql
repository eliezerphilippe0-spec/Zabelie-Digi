begin;
insert into auth.users(id,email) values
 ('11300000-0000-4000-8000-000000000001','ops-seller1@test.local'),
 ('11300000-0000-4000-8000-000000000002','ops-seller2@test.local'),
 ('11300000-0000-4000-8000-000000000003','ops-buyer1@test.local'),
 ('11300000-0000-4000-8000-000000000004','ops-buyer2@test.local'),
 ('11300000-0000-4000-8000-000000000005','ops-admin@test.local');
update profiles set role='creator' where id in('11300000-0000-4000-8000-000000000001','11300000-0000-4000-8000-000000000002');
update profiles set role='admin' where id='11300000-0000-4000-8000-000000000005';
insert into products(id,seller_id,slug,title,kind,price_htg,status) values
 ('11300000-0000-4000-8000-000000000010','11300000-0000-4000-8000-000000000001','ops-product1','Ops fixture','physical',1000,'published'),
 ('11300000-0000-4000-8000-000000000011','11300000-0000-4000-8000-000000000002','ops-product2','Ops fixture 2','physical',1000,'published');
insert into orders(id,buyer_id,product_id,amount_htg,zabelie_payment_is_live) values
 ('11300000-0000-4000-8000-000000000020','11300000-0000-4000-8000-000000000003','11300000-0000-4000-8000-000000000010',1000,true),
 ('11300000-0000-4000-8000-000000000021','11300000-0000-4000-8000-000000000004','11300000-0000-4000-8000-000000000011',1000,true),
 ('11300000-0000-4000-8000-000000000022','11300000-0000-4000-8000-000000000003','11300000-0000-4000-8000-000000000010',1000,false);
insert into payments(order_id,idempotency_key,rail,expected_usd_cents,raw,created_at)
 select id,id::text,'stripe',1250,jsonb_build_object('stripe_session_id','cs_'||id),now()-interval '2 hours'
 from orders where id::text like '11300000-%';
do $$
declare oid uuid:='11300000-0000-4000-8000-000000000020'; buyer uuid:='11300000-0000-4000-8000-000000000003';
 seller uuid:='11300000-0000-4000-8000-000000000001'; adm uuid:='11300000-0000-4000-8000-000000000005';
 rid uuid:=gen_random_uuid(); a uuid; b uuid; out jsonb; n bigint;
begin
 update zabelie_operations_config set batch_size=1;
 select order_id into a from zabelie_claim_pending_payments('stripe');
 select order_id into b from zabelie_claim_pending_payments('stripe');
 assert a is distinct from b,'oldest failing payment starved next order';
 assert not has_function_privilege('authenticated','zabelie_claim_pending_payments(payment_rail)','execute');
 assert not has_function_privilege('anon','zabelie_submit_support(uuid,uuid,uuid,text,text,text)','execute');
 assert not has_function_privilege('authenticated','zabelie_submit_support(uuid,uuid,uuid,text,text,text)','execute');
 assert not has_function_privilege('authenticated','zabelie_record_refund_receipt(uuid,uuid,text,text,timestamp with time zone)','execute');
 assert not has_function_privilege('authenticated','zabelie_operations_queue(integer,integer)','execute');
 assert not has_function_privilege('anon','zabelie_market_metrics(integer)','execute');
 out:=zabelie_market_metrics(30);
 assert (out->>'orders')::int=2,'sandbox orders counted in live metrics';
 assert (out->>'paid')::int=0,'pending counted as paid';
 perform confirm_payment(oid::text,'pi_ops','{}',null,1250);
 select count(*) into n from wallet_transactions;
 perform confirm_payment(oid::text,'pi_ops','{}',null,1250);
 assert (select count(*) from wallet_transactions)=n,'confirmation retry doubled accounting';
 out:=zabelie_market_metrics(30);
 assert (out->>'paid')::int=1,'confirmed order missing in metrics';
 update profiles set is_test=true where id=buyer;
 assert (zabelie_market_metrics(30)->>'paid')::int=0,'test profile counted';
 update profiles set is_test=false where id=buyer;

 out:=zabelie_submit_support(oid,buyer,rid,'debited','Vérifiez mon paiement, merci.');
 assert (out->>'ok')::boolean;
 out:=zabelie_submit_support(oid,buyer,rid,'debited','Vérifiez mon paiement, merci.');
 assert (out->>'duplicate')::boolean,'retry duplicated support';
 assert (select count(*) from zabelie_support_messages)=1;
 begin
  perform zabelie_submit_support(oid,buyer,rid,'debited','Un autre contenu pour le même identifiant.');
  raise exception 'idempotency key accepted changed body';
 exception when invalid_parameter_value then null; end;
 begin
  perform zabelie_submit_support(oid,'11300000-0000-4000-8000-000000000004',gen_random_uuid(),'other','Accès à une commande étrangère.');
  raise exception 'foreign buyer posted';
 exception when insufficient_privilege then null; end;
 begin
  perform zabelie_submit_support(oid,'11300000-0000-4000-8000-000000000002',gen_random_uuid(),'other','Accès à une vente étrangère.');
  raise exception 'foreign seller posted';
 exception when insufficient_privilege then null; end;
 begin
  perform zabelie_submit_support(oid,buyer,gen_random_uuid(),'other','Je ferme moi-même le dossier.','resolved');
  raise exception 'buyer closed case';
 exception when insufficient_privilege then null; end;
 perform zabelie_submit_support(oid,seller,gen_random_uuid(),'other','Réponse du vendeur au client.');
 perform zabelie_submit_support(oid,adm,gen_random_uuid(),'other','Nous attendons la réponse du vendeur.','waiting_seller');
 assert (select status from zabelie_support_cases where order_id=oid)='waiting_seller';
 assert exists(select 1 from zabelie_admin_actions where actor_id=adm and action='support.reply');
 begin
  update zabelie_support_messages set body='Une preuve falsifiée ensuite.';
  raise exception 'support history editable';
 exception when insufficient_privilege then null; end;
 begin
  perform zabelie_record_refund_receipt(oid,adm,'stripe','re_ops',now());
  raise exception 'receipt accepted before accounting reversal';
 exception when invalid_parameter_value then null; end;
 -- The receipt records verified external execution, not a second ledger movement.
 perform refund_order(oid);
 select count(*) into n from wallet_transactions;
 perform zabelie_record_refund_receipt(oid,adm,'stripe','re_ops',now()-interval '1 hour');
 out:=zabelie_record_refund_receipt(oid,adm,'stripe','re_ops',now()-interval '1 hour');
 assert (out->>'duplicate')::boolean;
 assert (select count(*) from wallet_transactions)=n,'recording evidence moved money';
 begin
  perform zabelie_record_refund_receipt(oid,buyer,'stripe','re_forged',now());
  raise exception 'buyer certified refund';
 exception when insufficient_privilege then null; end;
 begin
  update zabelie_refund_receipts set provider_reference='falsified';
  raise exception 'receipt editable';
 exception when insufficient_privilege then null; end;
 assert not exists(select 1 from jsonb_array_elements(zabelie_operations_queue(100,0)->'rows') x
  where x->>'kind'='refund' and x->>'order_id'=oid::text),'recorded refund still in queue';
end $$;

-- Real RLS execution with four identities; service-only HTTP checks are not enough.
set local role authenticated;
select set_config('request.jwt.claim.sub','11300000-0000-4000-8000-000000000003',true);
do $$ begin
 assert zabelie_order_participant('11300000-0000-4000-8000-000000000020');
 assert (select count(*) from zabelie_support_cases)=1;
 assert (select count(*) from zabelie_support_messages)=3;
 begin
  insert into zabelie_support_messages(case_id,author_id,author_role,request_id,body,request_payload)
  values(gen_random_uuid(),auth.uid(),'admin',gen_random_uuid(),'Une fausse réponse admin.','{}');
  raise exception 'buyer forged admin reply';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','11300000-0000-4000-8000-000000000004',true);
do $$ begin
 assert not zabelie_order_participant('11300000-0000-4000-8000-000000000020');
 assert (select count(*) from zabelie_support_cases)=0;
 assert (select count(*) from zabelie_support_messages)=0;
end $$;
select set_config('request.jwt.claim.sub','11300000-0000-4000-8000-000000000001',true);
do $$ begin assert (select count(*) from zabelie_support_messages)=3; end $$;
select set_config('request.jwt.claim.sub','11300000-0000-4000-8000-000000000002',true);
do $$ begin assert (select count(*) from zabelie_support_messages)=0; end $$;
reset role;
rollback;
