-- Atomic registration: snapshot checks, closure, rollback and service-only access.
begin;

-- 0130 readiness preserves the deployed 0125 contract.
do $$
declare
  v_old text[] := array[
    'zabelie_product_recommendations(uuid,uuid)',
    'zabelie_configure_product_offers(uuid,uuid,jsonb,boolean)',
    'zabelie_recommendation_stats(uuid)',
    'zabelie_save_product_offers(uuid,uuid,jsonb)',
    'zabelie_offers_public(uuid,uuid)',
    'zabelie_offer_stats(uuid)',
    'zabelie_digital_metrics(uuid)',
    'zabelie_webhook_claim(integer)',
    'zabelie_webhook_record(uuid,boolean,integer,text)',
    'zabelie_webhook_purge()',
    'zabelie_claim_pending_payments(payment_rail)',
    'zabelie_order_participant(uuid)',
    'zabelie_submit_support(uuid,uuid,uuid,text,text,text)',
    'zabelie_record_refund_receipt(uuid,uuid,text,text,timestamp with time zone)',
    'zabelie_operations_queue(integer,integer)',
    'zabelie_market_metrics(integer)',
    'zabelie_stripe_payment_failed(uuid,text,text)',
    'confirm_payment(text,text,jsonb,integer,integer)',
    'refund_order(uuid)',
    'mature_wallets()',
    'zabelie_expire_stale_payment(text,text)',
    'zabelie_solvency_report()',
    'purge_payment_raw(integer)',
    'zabelie_request_payout(uuid,bigint)',
    'zabelie_settle_payout(uuid,payout_method,text,uuid,text)',
    'zabelie_reject_payout(uuid,text,uuid)',
    'zabelie_record_manual_payout(uuid,bigint,payout_method,text,uuid,text,timestamp with time zone)',
    'zabelie_release_stock(uuid)',
    'zabelie_expire_stock_reservations()',
    'zabelie_open_fulfillment(uuid)',
    'zabelie_declare_shipment(uuid,uuid,text)',
    'zabelie_mark_received(uuid,uuid,boolean)',
    'zabelie_report_not_received(uuid,uuid,text)',
    'zabelie_fulfillment_sweep()',
    'zabelie_cart_add(uuid)',
    'zabelie_cart_remove(uuid)',
    'zabelie_set_variant_discount(uuid,uuid,uuid,bigint)',
    'zabelie_clear_variant_discount(uuid,uuid,uuid)',
    'zabelie_set_discount(uuid,uuid,bigint)',
    'zabelie_clear_discount(uuid,uuid)',
    'expire_coupons_job()',
    'expire_points_batch_job()',
    'zabelie_outbox_enqueue(uuid,zabelie_outbox_kind,text)',
    'zabelie_outbox_claim(uuid)',
    'zabelie_outbox_mark_sent(uuid)',
    'zabelie_outbox_mark_failed(uuid,text)',
    'zabelie_claim_notification(uuid)',
    'zabelie_cron_lease_acquire(text,text,integer)',
    'zabelie_cron_lease_release(text,text)',
    'zabelie_search_normalize(text)',
    'zabelie_record_search_miss(text,text,text)',
    'zabelie_search_demand(integer,integer)',
    'zabelie_search_fuzzy(text,integer)',
    'zabelie_relances_dues(integer)',
    'zabelie_email_jeton(uuid)',
    'zabelie_email_desabonner(uuid)',
    'zabelie_domaine_demander(uuid,text)',
    'zabelie_domaine_retirer(uuid)',
    'zabelie_domaine_decider(uuid,boolean,text)',
    'zabelie_domaine_boutik(text)',
    'zabelie_purge_search_misses()',
    'zabelie_kyc_docs_expires()',
    'zabelie_purge_kyc_documents(uuid[])',
    'zabelie_record_policy_acceptance(uuid,text)',
    'zabelie_rate_limit(text,integer,integer)',
    'zabelie_objets_requis()',
    'zabelie_topup_confirm_payment(uuid,text,jsonb,integer,integer)',
    'zabelie_topup_transition(uuid,topup_status,jsonb)',
    'zabelie_biz_get_invoice_by_token(text)',
    'zabelie_biz_upsert_item(uuid,text,integer,bigint,uuid)',
    'zabelie_biz_recompute_invoice(uuid)',
    'zabelie_biz_send_invoice(uuid)',
    'zabelie_biz_void_invoice(uuid)',
    'zabelie_biz_confirm_invoice_payment(uuid,payment_rail,text,bigint,text)',
    'zabelie_reserve_stock(uuid,uuid,integer)',
    'zabelie_topup_reserve_order(uuid,uuid,text,topup_operator,integer,integer,integer,payment_rail,integer)',
    'zabelie_search_index_integrity()',
    'zabelie_fichier_sans_livrable_sweep()',
    'zabelie_service_sans_suivi_sweep()',
    'zabelie_purge_sent_notices(integer)',
    'zabelie_boutik_public(uuid,text)',
    'zabelie_vande_nan_zon(uuid[])',
    'zabelie_save_product_commitment(uuid,uuid,text,text,integer,text,date,boolean)',
    'zabelie_est_rechaj(uuid)',
    'zabelie_age_minimum(uuid)',
    'zabelie_support_cases',
    'zabelie_support_messages',
    'zabelie_refund_receipts',
    'zabelie_operations_config',
    'zabelie_payment_checks',
    'zabelie_seller_pricing_config',
    'zabelie_seller_launch',
    'zabelie_order_pricing',
    'zabelie_product_commitments',
    'zabelie_digital_studio',
    'zabelie_digital_releases',
    'zabelie_digital_entitlements',
    'zabelie_digital_progress',
    'zabelie_digital_accesses',
    'zabelie_order_age_attestations',
    'zabelie_api_keys',
    'zabelie_webhook_endpoints',
    'zabelie_webhook_deliveries',
    'zabelie_seller_domains',
    'zabelie_support_message_immutable',
    'zabelie_refund_receipt_immutable',
    'zabelie_order_seller_guard',
    'zabelie_record_seller_launch',
    'zabelie_start_waiting_launches',
    'zabelie_snapshot_order_pricing',
    'zabelie_guard_order_pricing',
    'zabelie_protect_test_account',
    'zabelie_digital_order_snapshot',
    'zabelie_digital_publication',
    'zabelie_digital_release_immutable',
    'zabelie_digital_entitlement_immutable',
    'zabelie_digital_asset_guard',
    'zabelie_digital_studio_draft_guard',
    'zabelie_order_age_attestation_immutable',
    'zabelie_api_keys_garde',
    'zabelie_webhook_endpoints_garde',
    'zabelie_webhook_enfiler_vente'
  ];
begin
  if exists(select unnest(v_old) except select objet from zabelie_objets_requis()) then
    raise exception 'K10: an existing required-object check disappeared';
  end if;
  if (select count(*) from zabelie_objets_requis()
      where objet='zabelie_register_kyc_document(uuid,text,text,jsonb)' and present) <> 1 then
    raise exception 'K10: atomic KYC registration is not monitored';
  end if;
end $$;

-- A missing KYC RPC must appear as missing rather than leave readiness green.
alter function zabelie_register_kyc_document(uuid,text,text,jsonb)
  rename to zabelie_register_kyc_document_hidden_fixture;
do $$
begin
  if (select count(*) from zabelie_objets_requis()
      where objet='zabelie_register_kyc_document(uuid,text,text,jsonb)' and not present) <> 1 then
    raise exception 'K10: missing atomic KYC registration was not detected';
  end if;
end $$;
alter function zabelie_register_kyc_document_hidden_fixture(uuid,text,text,jsonb)
  rename to zabelie_register_kyc_document;

-- A 0127 database has no grouped-payment module; readiness must not require
-- it. If any family object exists, partial installation must be diagnosed.
create temporary table kyc_existing_probe_fixture on commit drop as
  select * from zabelie_objets_requis()
  where objet <> all(array[
    'zabelie_panier_groupe_ouvert()', 'zabelie_group_create(uuid,payment_rail)',
    'zabelie_group_seal(uuid)', 'zabelie_group_abort(uuid)',
    'zabelie_confirm_group_payment(uuid,text,jsonb,integer,integer)',
    'zabelie_order_groups', 'zabelie_panier_config', 'zabelie_group_leader_failed'
  ]);
do $$
declare
  v_functions text[] := array[
    'zabelie_panier_groupe_ouvert()', 'zabelie_group_create(uuid,payment_rail)',
    'zabelie_group_seal(uuid)', 'zabelie_group_abort(uuid)',
    'zabelie_confirm_group_payment(uuid,text,jsonb,integer,integer)'
  ];
  v_tables text[] := array['zabelie_order_groups','zabelie_panier_config'];
  v_group_objects text[] := v_functions || v_tables || array['zabelie_group_leader_failed'];
  v_function_found boolean[] := array[]::boolean[];
  v_table_found boolean[] := array[]::boolean[];
  v_trigger_found boolean;
  v_name text;
begin
  for n in 1..array_length(v_functions,1) loop
    v_function_found := array_append(v_function_found,to_regprocedure('public.' || v_functions[n]) is not null);
    if v_function_found[n] then
      v_name := split_part(v_functions[n],'(',1);
      execute format('alter function public.%s rename to %I',v_functions[n],v_name || '_hidden_fixture');
    end if;
  end loop;
  for n in 1..array_length(v_tables,1) loop
    v_table_found := array_append(v_table_found,to_regclass('public.' || v_tables[n]) is not null);
    if v_table_found[n] then
      execute format('alter table public.%I rename to %I',v_tables[n],v_tables[n] || '_hidden_fixture');
    end if;
  end loop;
  select exists(select 1 from pg_trigger where tgname='zabelie_group_leader_failed'
    and tgrelid='public.payments'::regclass) into v_trigger_found;
  if v_trigger_found then
    alter trigger zabelie_group_leader_failed on public.payments rename to zabelie_group_leader_failed_hidden_fixture;
  end if;
  if exists(select 1 from zabelie_objets_requis() where objet=any(v_group_objects)) then
    raise exception 'K11: an absent grouped-payment module blocks individual readiness';
  end if;
  if exists((select * from kyc_existing_probe_fixture except select * from zabelie_objets_requis())
       union all (select * from zabelie_objets_requis() except select * from kyc_existing_probe_fixture)) then
    raise exception 'K11: disabling an absent module changed an existing readiness check';
  end if;

  -- Gate installed but closed: absence of its dependencies is still visible.
  execute 'create function public.zabelie_panier_groupe_ouvert() returns boolean language sql as ''select false''';
  if (select count(*) from zabelie_objets_requis() where objet=any(v_group_objects)) <> 8
     or (select count(*) from zabelie_objets_requis() where objet=any(v_group_objects) and present) <> 1 then
    raise exception 'K12: a partial grouped-payment installation was not diagnosed';
  end if;
  drop function public.zabelie_panier_groupe_ouvert();

  -- A surviving table also activates diagnostics if the gate was lost.
  create table public.zabelie_panier_config(id boolean);
  if (select count(*) from zabelie_objets_requis() where objet=any(v_group_objects)) <> 8
     or not exists(select 1 from zabelie_objets_requis() where objet='zabelie_panier_groupe_ouvert()' and not present) then
    raise exception 'K12: a surviving table hid the missing grouped-payment gate';
  end if;
  drop table public.zabelie_panier_config;

  for n in 1..array_length(v_functions,1) loop
    if v_function_found[n] then
      v_name := split_part(v_functions[n],'(',1);
      execute format('alter function public.%I%s rename to %I',v_name || '_hidden_fixture',
        substring(v_functions[n] from position('(' in v_functions[n])),v_name);
    end if;
  end loop;
  for n in 1..array_length(v_tables,1) loop
    if v_table_found[n] then
      execute format('alter table public.%I rename to %I',v_tables[n] || '_hidden_fixture',v_tables[n]);
    end if;
  end loop;
  if v_trigger_found then
    alter trigger zabelie_group_leader_failed_hidden_fixture on public.payments rename to zabelie_group_leader_failed;
  end if;
end $$;
insert into auth.users(id,email) select
  ('13000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'kyc-atomic-' || n || '@test.local' from generate_series(1,7) n;

do $$
declare
  v_user uuid := '13000000-0000-4000-8000-000000000001';
  v_path text := v_user::text || '/13000000-0000-4000-8000-000000000101.jpg';
  v_first jsonb; v_repeat jsonb; v_time timestamptz;
begin
  v_first := zabelie_register_kyc_document(v_user,'cin',v_path,null);
  if not (v_first->>'ok')::boolean or
     (select count(*) from zabelie_kyc_documents where user_id=v_user) <> 1 or
     (select status from zabelie_kyc_submissions where user_id=v_user) <> 'pending' then
    raise exception 'K5: first registration failed';
  end if;
  select submitted_at into v_time from zabelie_kyc_submissions where user_id=v_user;
  v_repeat := zabelie_register_kyc_document(v_user,'cin',v_path,null);
  if v_repeat is distinct from v_first or
     (select count(*) from zabelie_kyc_documents where user_id=v_user) <> 1 or
     (select submitted_at from zabelie_kyc_submissions where user_id=v_user) is distinct from v_time then
    raise exception 'K5: exact retry duplicated a document or changed its submission';
  end if;
end $$;

do $$
declare
  v_user uuid; v_expected jsonb; v_result jsonb; v_decision timestamptz;
begin
  for n in 2..3 loop
    v_user := ('13000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
    insert into zabelie_kyc_submissions(user_id) values(v_user);
    select jsonb_build_object('status',status,'submitted_at',submitted_at,'decided_at',decided_at,'decided_by',decided_by)
      into v_expected from zabelie_kyc_submissions where user_id=v_user;
    update zabelie_kyc_submissions set status=case when n=2 then 'approved' else 'rejected' end,
      decided_at=clock_timestamp(),decided_by=v_user where user_id=v_user;
    select decided_at into v_decision from zabelie_kyc_submissions where user_id=v_user;
    v_result := zabelie_register_kyc_document(v_user,'cin',v_user::text || '/13000000-0000-4000-8000-000000000102.jpg',v_expected);
    if v_result->>'code' is distinct from (case when n=2 then 'locked' else 'conflict' end) or
       exists(select 1 from zabelie_kyc_documents where user_id=v_user) or
       (select decided_at from zabelie_kyc_submissions where user_id=v_user) is distinct from v_decision then
      raise exception 'K6: concurrent decision was overwritten';
    end if;
  end loop;
  -- A legitimate resubmission after rejection still works with a fresh snapshot.
  select jsonb_build_object('status',status,'submitted_at',submitted_at,'decided_at',decided_at,'decided_by',decided_by)
    into v_expected from zabelie_kyc_submissions where user_id=v_user;
  v_result := zabelie_register_kyc_document(v_user,'paspo',v_user::text || '/13000000-0000-4000-8000-000000000103.pdf',v_expected);
  if not (v_result->>'ok')::boolean or
     (select status from zabelie_kyc_submissions where user_id=v_user) <> 'pending' then
    raise exception 'K6: fresh rejected dossier could not be resubmitted';
  end if;
  -- The earlier pending snapshot remains stale after a rejected->pending cycle.
  v_result := zabelie_register_kyc_document(v_user,'cin',v_user::text || '/13000000-0000-4000-8000-000000000104.jpg',v_expected);
  if v_result->>'code' is distinct from 'conflict' then raise exception 'K6: stale snapshot accepted'; end if;
end $$;

do $$
declare v_user uuid; v_result jsonb; v_expected jsonb;
begin
  for n in 4..5 loop
    v_user := ('13000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
    v_expected := null;
    if n=5 then
      insert into zabelie_kyc_submissions(user_id) values(v_user);
      select jsonb_build_object('status',status,'submitted_at',submitted_at,'decided_at',decided_at,'decided_by',decided_by)
        into v_expected from zabelie_kyc_submissions where user_id=v_user;
    end if;
    update profiles set suspended_at=clock_timestamp(),suspended_reason='account_closed' where id=v_user;
    update zabelie_kyc_submissions set status='rejected',decided_at=clock_timestamp() where user_id=v_user and status='pending';
    v_result := zabelie_register_kyc_document(v_user,'cin',v_user::text || '/13000000-0000-4000-8000-000000000105.jpg',v_expected);
    if v_result->>'code' is distinct from 'account_inactive' or
       exists(select 1 from zabelie_kyc_documents where user_id=v_user) or
       exists(select 1 from zabelie_kyc_submissions where user_id=v_user and status='pending') then
      raise exception 'K7: account closure reopened KYC';
    end if;
  end loop;
end $$;

create function pg_temp.zabelie_reject_kyc_fixture() returns trigger language plpgsql as $$
begin raise exception 'synthetic submission failure' using errcode='P0130'; end $$;
create trigger zabelie_reject_kyc_fixture before insert on zabelie_kyc_submissions
  for each row execute function pg_temp.zabelie_reject_kyc_fixture();
do $$
declare v_user uuid := '13000000-0000-4000-8000-000000000006';
begin
  begin
    perform zabelie_register_kyc_document(v_user,'cin',v_user::text || '/13000000-0000-4000-8000-000000000106.jpg',null);
    raise exception 'K8: injected write failure did not fail';
  exception when sqlstate 'P0130' then null;
  end;
  if exists(select 1 from zabelie_kyc_documents where user_id=v_user) then
    raise exception 'K8: failed submission left a committed document';
  end if;
end $$;
drop trigger zabelie_reject_kyc_fixture on zabelie_kyc_submissions;

do $$
begin
  set local role authenticated;
  begin
    perform public.zabelie_register_kyc_document('13000000-0000-4000-8000-000000000007','cin','invalid',null);
    raise exception 'K9: client role reached the registration function';
  exception when insufficient_privilege then null;
  end;
  reset role;
  if not has_function_privilege('service_role','public.zabelie_register_kyc_document(uuid,text,text,jsonb)','execute') then
    raise exception 'K9: service role cannot register a document';
  end if;
end $$;
rollback;
