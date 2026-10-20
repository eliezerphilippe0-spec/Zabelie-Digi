-- 0151: local, rollback-only Stripe fixtures. No provider/API calls.
-- These are technical receipts and a DORMANT hold, not a refund workflow.
begin;

insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000151001','stripe.dispute.seller@test.local'),
 ('00000000-0000-0000-0000-000000151002','stripe.dispute.buyer@test.local'),
 ('00000000-0000-0000-0000-000000151003','stripe.dispute.affiliate@test.local'),
 ('00000000-0000-0000-0000-000000151004','stripe.dispute.admin@test.local');
update profiles set role='creator' where id in
 ('00000000-0000-0000-0000-000000151001','00000000-0000-0000-0000-000000151003');
update profiles set role='admin' where id='00000000-0000-0000-0000-000000151004';
insert into wallets(owner_id) values
 ('00000000-0000-0000-0000-000000151001'),('00000000-0000-0000-0000-000000151003');
create temp table sd_ids(name text primary key,id uuid not null);

-- Same fixture pattern as fulfillment.test.sql: manually establish a paid
-- order/escrow with matching pending+append-only credit, then exercise the RPC.
create function pg_temp.sd_sale(p_name text,p_kind product_kind default 'fichier',p_status escrow_status default 'maturing',p_escrow boolean default true)
returns uuid language plpgsql as $$
declare p uuid:=gen_random_uuid(); o uuid:=gen_random_uuid(); w uuid;
begin
 select id into w from wallets where owner_id='00000000-0000-0000-0000-000000151001';
 insert into products(id,seller_id,slug,title,kind,price_htg,status)
 values(p,'00000000-0000-0000-0000-000000151001','stripe-dispute-'||p_name,'Dispute fixture',p_kind,1000,'published');
 insert into orders(id,buyer_id,product_id,amount_htg,status)
 values(o,'00000000-0000-0000-0000-000000151002',p,1000,'paid');
 insert into payments(order_id,rail,idempotency_key,status,provider_ref,expected_usd_cents,raw,confirmed_at)
 values(o,'stripe',o::text,'confirmed','pi_'||p_name,1000,'{"stripe_livemode":false,"currency":"usd"}',now());
 if p_escrow then
   insert into escrow_entries(order_id,wallet_id,amount_htg,matures_at,status)
   values(o,w,900,now()-interval '1 day',p_status);
   update wallets set pending_htg=pending_htg+case when p_status='maturing' then 900 else 0 end,
     balance_htg=balance_htg+case when p_status='matured' then 900 else 0 end where id=w;
   insert into wallet_transactions(wallet_id,type,amount_htg,order_id,idempotency_key)
   values(w,'credit',900,o,'sd_fixture:'||o);
 end if;
 insert into sd_ids values(p_name,o);
 return o;
end $$;

create function pg_temp.sd_event(p_name text,p_pi text,p_dispute text default null,p_status text default 'needs_response',
 p_type text default 'charge.dispute.created',p_amount bigint default 500,p_currency text default 'usd',
 p_live boolean default false,p_charge text default null)
returns jsonb language sql as $$
 select zabelie_record_stripe_dispute('evt_'||p_name,p_type,coalesce(p_dispute,'dp_'||p_name),
   p_pi,coalesce(p_charge,'ch_'||coalesce(substring(p_dispute from 4),p_name)),p_status,p_amount,p_currency,p_live);
$$;
create function pg_temp.sd_money_snapshot() returns jsonb language sql as $$
 select jsonb_build_object(
 'wallets',(select jsonb_agg(to_jsonb(w) order by id) from wallets w),
 'ledger',(select jsonb_agg(to_jsonb(t) order by id) from wallet_transactions t),
 'orders',(select jsonb_agg(to_jsonb(o) order by id) from orders o),
 'payouts',(select jsonb_agg(to_jsonb(p) order by id) from payouts p));
$$;

-- SD1: privilege checks and real role probes; evidence is not client-visible.
do $$
declare f text:='public.zabelie_record_stripe_dispute(text,text,text,text,text,text,bigint,text,boolean)'; r text;
begin
 assert not (select stripe_dispute_freeze_enabled from zabelie_operations_config where id),'SD1: hold starts dormant';
 assert (select relrowsecurity from pg_class where oid='zabelie_stripe_dispute_events'::regclass),'SD1: missing RLS';
 foreach r in array array['anon','authenticated'] loop
   assert not has_function_privilege(r,f,'EXECUTE'),'SD1: client RPC execute';
   assert not has_table_privilege(r,'zabelie_stripe_dispute_events','SELECT'),'SD1: receipt leak';
   assert not has_table_privilege(r,'zabelie_stripe_dispute_events','INSERT'),'SD1: client receipt write';
 end loop;
 assert has_function_privilege('service_role',f,'EXECUTE'),'SD1: service RPC unavailable';
 assert has_table_privilege('service_role','zabelie_stripe_dispute_events','SELECT'),'SD1: service journal unavailable';
 assert not has_table_privilege('service_role','zabelie_stripe_dispute_events','INSERT'),'SD1: direct service writes';
 assert not has_table_privilege('service_role','zabelie_stripe_dispute_events','UPDATE'),'SD1: direct service updates';
 assert not has_table_privilege('service_role','zabelie_stripe_dispute_events','DELETE'),'SD1: direct service deletes';
end $$;
set local role anon;
do $$ begin
 begin
   perform zabelie_record_stripe_dispute('evt_anon','charge.dispute.created','dp_anon','pi_anon','ch_anon','needs_response',500,'usd',false);
   raise exception 'SD1: anon RPC unexpectedly allowed';
 exception when insufficient_privilege then null; end;
 begin perform count(*) from zabelie_stripe_dispute_events; raise exception 'SD1: anon read allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin
 begin perform count(*) from zabelie_stripe_dispute_events; raise exception 'SD1: authenticated read allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

select pg_temp.sd_sale('dormant');
do $$ declare s jsonb:=pg_temp.sd_money_snapshot(); r jsonb; begin
 r:=pg_temp.sd_event('dormant','pi_dormant');
 assert (r->>'ok')::boolean and r->>'reason'='freeze_disabled','SD2: disabled gate not explicit';
 assert not exists(select 1 from escrow_entries where dispute_frozen_at is not null),'SD2: dormant gate froze funds';
 assert exists(select 1 from zabelie_stripe_dispute_events where event_id='evt_dormant'),'SD2: dormant event lost';
 assert pg_temp.sd_money_snapshot()=s,'SD2: dormant receipt moved money';
end $$;
-- Only this rollback transaction arms retention. Migration does not.
update zabelie_operations_config set stripe_dispute_freeze_enabled=true where id;

select pg_temp.sd_sale('digital');
-- Seller AND affiliate escrow on one order (0081), with coherent balances.
insert into escrow_entries(order_id,wallet_id,amount_htg,matures_at)
 select o.id,w.id,100,now()-interval '1 day' from sd_ids o join wallets w
 on w.owner_id='00000000-0000-0000-0000-000000151003' where o.name='digital';
update wallets set pending_htg=pending_htg+100 where owner_id='00000000-0000-0000-0000-000000151003';
insert into wallet_transactions(wallet_id,type,amount_htg,order_id,idempotency_key)
 select w.id,'credit',100,o.id,'sd_affiliate:'||o.id from sd_ids o join wallets w
 on w.owner_id='00000000-0000-0000-0000-000000151003' where o.name='digital';
do $$ declare s jsonb:=pg_temp.sd_money_snapshot(); r jsonb; stamp timestamptz; begin
 r:=pg_temp.sd_event('digital','pi_digital');
 assert (r->>'ok')::boolean and (r->>'frozen_count')::integer=2,'SD3: seller/affiliate not both frozen';
 assert (select count(*) from escrow_entries where order_id=(select id from sd_ids where name='digital') and dispute_frozen_at is not null)=2,'SD3: missing escrow hold';
 select min(dispute_frozen_at) into stamp from escrow_entries where order_id=(select id from sd_ids where name='digital');
 r:=pg_temp.sd_event('digital','pi_digital');
 assert (r->>'duplicate')::boolean and (r->>'frozen_count')::integer=0,'SD3: duplicate changed hold';
 assert (select count(*) from zabelie_stripe_dispute_events where event_id='evt_digital')=1,'SD3: duplicate receipt';
 assert (select bool_and(dispute_frozen_at=stamp) from escrow_entries where order_id=(select id from sd_ids where name='digital')),'SD3: timestamp reset';
 r:=pg_temp.sd_event('digital','pi_digital',null,'under_review');
 assert r->>'reason'='event_payload_conflict' and not (r->>'retryable')::boolean,'SD3: reused event changed payload';
 assert (select dispute_status from zabelie_stripe_dispute_events where event_id='evt_digital')='needs_response','SD3: immutable receipt changed';
 assert pg_temp.sd_money_snapshot()=s,'SD3: receipt moved money or changed order';
end $$;

-- SD4: receipt survives closed/won, raw purge, and service RPC permission.
set local role service_role;
select zabelie_record_stripe_dispute('evt_digital_won','charge.dispute.closed','dp_digital','pi_digital','ch_digital','won',500,'usd',false);
reset role;
do $$ declare stamp timestamptz; s jsonb:=pg_temp.sd_money_snapshot(); begin
 select min(dispute_frozen_at) into stamp from escrow_entries where order_id=(select id from sd_ids where name='digital');
 assert stamp is not null,'SD4: won released existing hold';
 begin update zabelie_stripe_dispute_events set dispute_status='won' where event_id='evt_digital';
   raise exception 'SD4: mutable receipt'; exception when insufficient_privilege then null; end;
 begin delete from zabelie_stripe_dispute_events where event_id='evt_digital';
   raise exception 'SD4: deleted receipt'; exception when insufficient_privilege then null; end;
 begin truncate zabelie_stripe_dispute_events; raise exception 'SD4: truncated receipts';
   exception when insufficient_privilege then null; end;
 update payments set confirmed_at=now()-interval '100 days' where provider_ref='pi_digital';
 perform purge_payment_raw(90);
 assert (select raw is null from payments where provider_ref='pi_digital'),'SD4: raw purge fixture did not purge';
 assert (select count(*) from zabelie_stripe_dispute_events where dispute_id='dp_digital')=2,'SD4: raw purge lost journal';
 assert pg_temp.sd_money_snapshot()=s,'SD4: journal/purge moved money';
end $$;

-- SD5: unmatched/pending/ambiguous/incompatible receipts persist, then replay.
do $$ declare r jsonb; s jsonb:=pg_temp.sd_money_snapshot(); begin
 r:=pg_temp.sd_event('late','pi_late');
 assert r->>'reason'='payment_unmatched' and (r->>'retryable')::boolean,'SD5: unmatched not retryable';
 assert exists(select 1 from zabelie_stripe_dispute_events where event_id='evt_late'),'SD5: unmatched receipt rolled back';
 assert pg_temp.sd_money_snapshot()=s,'SD5: unmatched moved money';
end $$;
select pg_temp.sd_sale('late');
do $$ declare r jsonb; begin
 r:=pg_temp.sd_event('late','pi_late');
 assert (r->>'ok')::boolean and (r->>'duplicate')::boolean and (r->>'frozen_count')::integer=1,'SD5: late replay did not reconcile';
end $$;
select pg_temp.sd_sale('pending');
update payments set status='pending' where provider_ref='pi_pending';
do $$ declare r jsonb; begin
 r:=pg_temp.sd_event('pending','pi_pending');
 assert r->>'reason'='payment_not_confirmed' and (r->>'retryable')::boolean,'SD5: pending not retryable';
 assert exists(select 1 from zabelie_stripe_dispute_events where event_id='evt_pending'),'SD5: pending evidence lost';
end $$;
update payments set status='confirmed' where provider_ref='pi_pending';
do $$ declare r jsonb; begin
 r:=pg_temp.sd_event('pending','pi_pending');
 assert (r->>'ok')::boolean and (r->>'frozen_count')::integer=1,'SD5: pending replay failed';
end $$;
select pg_temp.sd_sale('ambiguous');
insert into payments(order_id,rail,idempotency_key,status,provider_ref,expected_usd_cents)
 select id,'stripe','sd_ambiguous_attempt','confirmed','pi_ambiguous',1000 from sd_ids where name='ambiguous';
select pg_temp.sd_sale('mode');
select pg_temp.sd_sale('currency');
select pg_temp.sd_sale('amount');
select pg_temp.sd_sale('expected_missing');
update payments set expected_usd_cents=null where provider_ref='pi_expected_missing';
select pg_temp.sd_sale('status');
select pg_temp.sd_sale('missing','fichier','maturing',false);
do $$ declare r jsonb; s jsonb:=pg_temp.sd_money_snapshot(); begin
 r:=pg_temp.sd_event('ambiguous','pi_ambiguous');
 assert r->>'reason'='payment_ambiguous' and (r->>'retryable')::boolean,'SD5: ambiguous chose an order';
 r:=pg_temp.sd_event('mode','pi_mode',null,'needs_response','charge.dispute.created',500,'usd',true);
 assert r->>'reason'='livemode_incompatible' and (r->>'retryable')::boolean,'SD5: mode mismatch froze funds';
 r:=pg_temp.sd_event('currency','pi_currency',null,'needs_response','charge.dispute.created',500,'eur');
 assert r->>'reason'='currency_incompatible' and (r->>'retryable')::boolean,'SD5: non-USD froze funds';
 r:=pg_temp.sd_event('amount','pi_amount',null,'needs_response','charge.dispute.created',1001);
 assert (r->>'ok')::boolean and (r->>'amount_exceeds_payment')::boolean
   and (r->>'requires_review')::boolean and (r->>'frozen_count')::integer=1,'SD5: oversized dispute bypassed protection';
 r:=pg_temp.sd_event('expected_missing','pi_expected_missing');
 assert r->>'reason'='amount_incompatible' and (r->>'retryable')::boolean,'SD5: absent expected amount not retryable';
 r:=pg_temp.sd_event('status','pi_status',null,'future_status');
 assert r->>'reason'='status_incompatible' and (r->>'retryable')::boolean,'SD5: unknown status froze funds';
 r:=pg_temp.sd_event('missing','pi_missing');
 assert r->>'reason'='escrow_unavailable' and (r->>'retryable')::boolean,'SD5: missing escrow not retryable';
 r:=pg_temp.sd_event('null_pi',null);
 assert r->>'reason'='payment_unmatched' and (r->>'retryable')::boolean,'SD5: null PI not retained';
 r:=pg_temp.sd_event('null_pi',null);
 assert (r->>'duplicate')::boolean and r->>'reason'='payment_unmatched','SD5: null PI replay not idempotent';
 assert (select count(*) from zabelie_stripe_dispute_events where event_id in
  ('evt_ambiguous','evt_mode','evt_currency','evt_amount','evt_expected_missing','evt_status','evt_missing','evt_null_pi'))=8,'SD5: incompatible receipt lost';
 assert not exists(select 1 from escrow_entries e join sd_ids i on i.id=e.order_id
   where i.name in('ambiguous','mode','currency','expected_missing','status') and e.dispute_frozen_at is not null),'SD5: incompatible hold';
 assert pg_temp.sd_money_snapshot()=s,'SD5: incompatible receipt changed money or orders';
end $$;
select pg_temp.sd_sale('null_late');
do $$ declare r jsonb; begin
 perform pg_temp.sd_event('null_late_before',null,'dp_null_late');
 r:=pg_temp.sd_event('null_late_after','pi_null_late','dp_null_late');
 assert (r->>'ok')::boolean and (r->>'frozen_count')::integer=1,'SD5: later known PI did not reconcile same dispute';
end $$;
select pg_temp.sd_sale('du_real');
do $$ declare r jsonb; begin
 r:=pg_temp.sd_event('du_real','pi_du_real','du_1MtJUT2eZvKYlo2CNaw2HvEv');
 assert (r->>'ok')::boolean and (r->>'frozen_count')::integer=1,'SD5: actual Stripe du_ id refused';
 assert exists(select 1 from zabelie_stripe_dispute_events where dispute_id='du_1MtJUT2eZvKYlo2CNaw2HvEv'),'SD5: actual Stripe dispute id not retained';
end $$;

-- SD6: closed/won before created is authoritative without event timestamp order.
select pg_temp.sd_sale('won_first');
do $$ declare r jsonb; s jsonb:=pg_temp.sd_money_snapshot(); begin
 r:=pg_temp.sd_event('won_first_closed','pi_won_first','dp_won_first','won','charge.dispute.closed');
 assert r->>'reason'='terminal_recorded','SD6: early won not recognised';
 r:=pg_temp.sd_event('won_first_created','pi_won_first','dp_won_first');
 assert r->>'reason'='terminal_recorded' and (r->>'frozen_count')::integer=0,'SD6: stale created refroze won dispute';
 assert not exists(select 1 from escrow_entries where order_id=(select id from sd_ids where name='won_first') and dispute_frozen_at is not null),'SD6: won hold created';
 assert pg_temp.sd_money_snapshot()=s,'SD6: closed/won moved money';
end $$;
select pg_temp.sd_sale('warning_closed');
select pg_temp.sd_sale('prevented');
do $$ declare r jsonb; s jsonb:=pg_temp.sd_money_snapshot(); begin
 r:=pg_temp.sd_event('warning_closed_closed','pi_warning_closed','dp_warning_closed','warning_closed','charge.dispute.closed');
 assert r->>'reason'='terminal_recorded','SD6: closed inquiry not recognised';
 r:=pg_temp.sd_event('warning_closed_created','pi_warning_closed','dp_warning_closed');
 assert r->>'reason'='terminal_recorded' and (r->>'frozen_count')::integer=0,'SD6: stale created froze closed inquiry';
 assert not exists(select 1 from escrow_entries where order_id=(select id from sd_ids where name='warning_closed') and dispute_frozen_at is not null),'SD6: closed inquiry created hold';
 assert pg_temp.sd_money_snapshot()=s,'SD6: terminal receipt moved money';
end $$;

-- "prevented" includes Rapid Dispute Resolution operator refunds. It is not
-- evidence that seller funds remain available: hold and human review only.
do $$ declare r jsonb; stamp timestamptz; s jsonb:=pg_temp.sd_money_snapshot(); begin
 r:=pg_temp.sd_event('prevented_closed','pi_prevented','dp_prevented','prevented','charge.dispute.closed');
 assert (r->>'ok')::boolean and (r->>'frozen_count')::integer=1
   and (r->>'requires_review')::boolean,'SD6: prevented/RDR bypassed protection';
 select dispute_frozen_at into stamp from escrow_entries where order_id=(select id from sd_ids where name='prevented');
 assert stamp is not null,'SD6: prevented/RDR did not hold pending funds';
 r:=pg_temp.sd_event('prevented_created','pi_prevented','dp_prevented');
 assert (r->>'ok')::boolean and (r->>'frozen_count')::integer=0,'SD6: prevented replay changed hold';
 assert (select dispute_frozen_at=stamp from escrow_entries where order_id=(select id from sd_ids where name='prevented')),'SD6: prevented timestamp reset';
 assert pg_temp.sd_money_snapshot()=s,'SD6: prevented/RDR moved money twice';
end $$;

-- SD7: independent disputes on one payment; won for A does not suppress B.
select pg_temp.sd_sale('multi');
do $$ declare r jsonb; stamp timestamptz; begin
 perform pg_temp.sd_event('multi_a_won','pi_multi','dp_multi_a','won','charge.dispute.closed',500,'usd',false,'ch_multi');
 r:=pg_temp.sd_event('multi_b','pi_multi','dp_multi_b','needs_response','charge.dispute.created',500,'usd',false,'ch_multi');
 assert (r->>'frozen_count')::integer=1,'SD7: other won dispute suppressed active dispute';
 select dispute_frozen_at into stamp from escrow_entries where order_id=(select id from sd_ids where name='multi');
 perform pg_temp.sd_event('multi_b_updated','pi_multi','dp_multi_b','under_review','charge.dispute.updated',500,'usd',false,'ch_multi');
 assert (select dispute_frozen_at=stamp from escrow_entries where order_id=(select id from sd_ids where name='multi')),'SD7: update resets suspension';
 perform pg_temp.sd_event('multi_b_withdrawn','pi_multi','dp_multi_b','under_review','charge.dispute.funds_withdrawn',500,'usd',false,'ch_multi');
 perform pg_temp.sd_event('multi_b_reinstated','pi_multi','dp_multi_b','won','charge.dispute.funds_reinstated',500,'usd',false,'ch_multi');
 assert (select dispute_frozen_at=stamp from escrow_entries where order_id=(select id from sd_ids where name='multi')),'SD7: reinstated cleared hold';
 assert (select count(*) from zabelie_stripe_dispute_events where dispute_id='dp_multi_b')=4,'SD7: funds event receipt lost';
 perform pg_temp.sd_event('multi_b_prevented','pi_multi','dp_multi_b','prevented','charge.dispute.closed',500,'usd',false,'ch_multi');
 perform pg_temp.sd_event('multi_b_warning_closed','pi_multi','dp_multi_b','warning_closed','charge.dispute.closed',500,'usd',false,'ch_multi');
 assert (select dispute_frozen_at=stamp from escrow_entries where order_id=(select id from sd_ids where name='multi')),'SD7: terminal receipt released existing hold';
end $$;

-- SD8: physical/manual and system auto-receipt can lift delivery gate, but
-- cannot clear or bypass the independent dispute hold.
select pg_temp.sd_sale('physical','physical');
select pg_temp.sd_sale('auto','physical');
do $$ declare n text; o uuid; r jsonb; stamp timestamptz; begin
 foreach n in array array['physical','auto'] loop
   select id into o from sd_ids where name=n;
   perform zabelie_open_fulfillment(o);
   perform zabelie_declare_shipment(o,'00000000-0000-0000-0000-000000151001',null);
   perform pg_temp.sd_event(n,'pi_'||n);
   select dispute_frozen_at into stamp from escrow_entries where order_id=o;
   r:=zabelie_mark_received(o,case when n='auto' then null else '00000000-0000-0000-0000-000000151002'::uuid end,n='auto');
   assert (r->>'ok')::boolean,'SD8: receipt fixture failed';
   assert (select not gated_on_delivery and dispute_frozen_at=stamp from escrow_entries where order_id=o),'SD8: receipt erased dispute marker';
   assert (select status='delivered' from orders where id=o),'SD8: existing delivery transition broken';
 end loop;
end $$;

select pg_temp.sd_sale('reversed');
select refund_order((select id from sd_ids where name='reversed'));
do $$ declare r jsonb; s jsonb:=pg_temp.sd_money_snapshot(); begin
 r:=pg_temp.sd_event('reversed','pi_reversed');
 assert (r->>'ok')::boolean and (r->>'reversed_count')::integer=1 and (r->>'frozen_count')::integer=0,'SD9: reversed escrow altered';
 assert pg_temp.sd_money_snapshot()=s,'SD9: reversed escrow moved money twice';
end $$;

-- SD9: already matured and already-paid payout require human review, never
-- a debit, a clawback or a global seller-wallet restriction.
select pg_temp.sd_sale('matured','fichier','matured');
do $$ declare r jsonb; s jsonb:=pg_temp.sd_money_snapshot(); begin
 r:=pg_temp.sd_event('matured','pi_matured');
 assert r->>'reason'='post_maturation_review' and (r->>'matured_count')::integer=1,'SD9: matured review missing';
 assert (r->>'frozen_count')::integer=0,'SD9: matured funds frozen';
 assert pg_temp.sd_money_snapshot()=s,'SD9: matured funds clawed back';
 perform zabelie_record_manual_payout((select id from wallets where owner_id='00000000-0000-0000-0000-000000151001'),
   500,'moncash','SD-ALREADY-PAID','00000000-0000-0000-0000-000000151004',null,now());
 s:=pg_temp.sd_money_snapshot();
 r:=pg_temp.sd_event('matured_after_payout','pi_matured','dp_matured');
 assert r->>'reason'='post_maturation_review','SD9: paid-out dispute not reviewed';
 assert pg_temp.sd_money_snapshot()=s,'SD9: payout modified by dispute';
end $$;

-- SD10: grouped payment uses the leader and freezes both sellers/children.
update zabelie_panier_config set paiement_groupe=true where id;
do $$
declare g uuid; a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); p1 uuid; p2 uuid; r jsonb; s jsonb;
begin
 select product_id into p1 from orders where id=(select id from sd_ids where name='digital');
 insert into products(seller_id,slug,title,kind,price_htg,status)
 values('00000000-0000-0000-0000-000000151003','stripe-dispute-group-b','Group fixture','fichier',2000,'published') returning id into p2;
 g:=zabelie_group_create('00000000-0000-0000-0000-000000151002','stripe');
 insert into orders(id,buyer_id,product_id,amount_htg,status,group_id) values
 (a,'00000000-0000-0000-0000-000000151002',p1,1000,'pending',g),
 (b,'00000000-0000-0000-0000-000000151002',p2,2000,'pending',g);
 insert into payments(order_id,rail,idempotency_key,status,expected_usd_cents) values
 (a,'stripe',a::text,'pending',1000),(b,'groupe',b::text,'pending',2000);
 perform zabelie_group_seal(g);
 perform confirm_payment(a::text,'pi_group','{"stripe_livemode":false,"currency":"usd"}',null,3000);
 s:=pg_temp.sd_money_snapshot();
 r:=pg_temp.sd_event('group','pi_group',null,'needs_response','charge.dispute.created',1500);
 assert (r->>'ok')::boolean and (r->>'frozen_count')::integer=2,'SD10: group children not frozen';
 assert (r->>'group_id')::uuid=g and (r->>'order_id')::uuid=a,'SD10: wrong group mapping';
 assert (select count(*) from escrow_entries e join orders o on o.id=e.order_id where o.group_id=g and e.dispute_frozen_at is not null)=2,'SD10: missing child marker';
 assert pg_temp.sd_money_snapshot()=s,'SD10: grouped dispute changed ledger/orders';
 insert into sd_ids values('group',g),('group_leader',a),('group_child',b);
end $$;

-- SD11: only unheld entries mature, including a known negative control.
-- Other fixtures are delivery-gated here to isolate the maturity assertion.
select pg_temp.sd_sale('held_refund');
select pg_temp.sd_event('held_refund','pi_held_refund');
-- Existing human-operated accounting reversal: outside the dispute RPC.
select refund_order((select id from sd_ids where name='held_refund'));
do $$ declare row jsonb; begin
 assert (select status='reversed' and dispute_frozen_at is not null from escrow_entries
   where order_id=(select id from sd_ids where name='held_refund')),'SD11: refund lost historical hold';
 select r into row from jsonb_array_elements(zabelie_operations_queue(100,0)->'rows') r
  where r->>'kind'='stripe_dispute' and r->>'id'='dp_held_refund';
 assert not (row->>'freeze_active')::boolean,'SD11: queue calls reversed escrow actively frozen';
end $$;
update escrow_entries set gated_on_delivery=true where dispute_frozen_at is null and status='maturing';
select pg_temp.sd_sale('unaffected');
do $$ declare count_before integer; r integer; s bigint; begin
 select count(*) into count_before from wallet_transactions;
 r:=mature_wallets();
 assert r=1,'SD11: held escrows matured or control did not mature';
 assert (select status='matured' from escrow_entries where order_id=(select id from sd_ids where name='unaffected')),'SD11: unheld control blocked';
 assert not exists(select 1 from escrow_entries where dispute_frozen_at is not null and status='matured'),'SD11: frozen escrow matured';
 assert (select count(*) from wallet_transactions)=count_before,'SD11: maturation appended duplicate credit';
 assert (select count(*) from zabelie_wallet_coherence where ecart_htg<>0)=0,'SD11: wallet/ledger identity broken';
end $$;

-- SD12: mutation proves the hold assertion can fail. Changes and maturity
-- run in an inner subtransaction; its forced exception restores everything.
do $$ declare src text; seen boolean:=false; begin
 src:=pg_get_functiondef('public.mature_wallets()'::regprocedure);
 assert position('and dispute_frozen_at is null' in src)>0,'SD12: mutation anchor missing';
 begin
   execute replace(src,'and dispute_frozen_at is null','');
   perform mature_wallets();
   assert not exists(select 1 from escrow_entries where dispute_frozen_at is not null and status='matured'),'SD12: MUTANT matured frozen funds';
   raise exception 'SD12: mutant survived';
 exception when assert_failure then seen:=true;
 end;
 assert seen,'SD12: mutation did not prove hold check';
 assert position('and dispute_frozen_at is null' in pg_get_functiondef('public.mature_wallets()'::regprocedure))>0,'SD12: mutant definition leaked';
 assert not exists(select 1 from escrow_entries where dispute_frozen_at is not null and status='matured'),'SD12: mutant balances leaked';
end $$;

-- SD13: one operations row per dispute, text IDs, no invented USD->HTG.
do $$ declare q jsonb; row jsonb; begin
 q:=zabelie_operations_queue(100,0);
 assert (select count(*) from jsonb_array_elements(q->'rows') r where r->>'kind'='stripe_dispute' and r->>'id'='dp_digital')=1,'SD13: queue duplicates webhook deliveries';
 select r into row from jsonb_array_elements(q->'rows') r where r->>'kind'='stripe_dispute' and r->>'id'='dp_group';
 assert row->>'order_id'=(select id::text from sd_ids where name='group_leader'),'SD13: queue group leader mismatch';
 assert (row->>'amount_htg')::integer=1000 and (row->>'freeze_active')::boolean,'SD13: converted USD or missing group hold';
 select r into row from jsonb_array_elements(q->'rows') r where r->>'kind'='stripe_dispute' and r->>'id'='dp_ambiguous';
 assert row->'order_id'='null'::jsonb and row->'amount_htg'='null'::jsonb,'SD13: ambiguous queue chose an order';
 assert (select count(*) from zabelie_objets_requis() where not present and
   (objet like 'zabelie_stripe_dispute_%' or objet like 'zabelie_record_stripe_dispute(%'
     or objet='escrow_entries.dispute_frozen_at' or objet='zabelie_operations_config.stripe_dispute_freeze_enabled'))=0,'SD13: probe missing object';
end $$;

do $$ begin
  raise notice 'OK Stripe disputes SD1-SD13: permissions, durable receipts, dormant gate, exact replay, null/late/ambiguous mapping, seller+affiliate+group holds, receipt/auto-receipt, post-maturity/payout/reversal, maturity control and killed guard mutation';
end $$;

rollback;
