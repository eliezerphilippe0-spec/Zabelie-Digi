select zabelie_migration_garde('0113_haiti_marketplace_operations.sql');

create table public.zabelie_operations_config (
 id boolean primary key default true check(id),
 pending_minutes integer not null default 30 check(pending_minutes between 5 and 1440),
 batch_size integer not null default 20 check(batch_size between 1 and 50),
 support_hours integer not null default 48 check(support_hours between 1 and 168)
);
insert into public.zabelie_operations_config(id) values(true);
alter table public.zabelie_operations_config enable row level security;
revoke all on public.zabelie_operations_config from public,anon,authenticated;
grant all on public.zabelie_operations_config to service_role;

create table public.zabelie_payment_checks (
 payment_id uuid primary key references payments(id) on delete cascade,
 checked_at timestamptz not null default now()
);
alter table public.zabelie_payment_checks enable row level security;
revoke all on public.zabelie_payment_checks from public,anon,authenticated;
grant all on public.zabelie_payment_checks to service_role;
create index zabelie_payment_checks_age on public.zabelie_payment_checks(checked_at);

-- Rotate bounded batches: a permanently failing oldest payment cannot starve newer orders.
create function public.zabelie_claim_pending_payments(p_rail payment_rail)
returns table(idempotency_key text,order_id uuid,created_at timestamptz,raw jsonb)
language plpgsql security definer set search_path=public as $$
declare r record; n integer;
begin
 if p_rail not in ('moncash','stripe','kobara') then raise exception 'unsupported rail'; end if;
 select batch_size into strict n from zabelie_operations_config where id;
 for r in
   select p.* from payments p left join zabelie_payment_checks c on c.payment_id=p.id
   where p.status='pending' and p.rail=p_rail
   order by c.checked_at nulls first,p.created_at,p.id limit n for update of p skip locked
 loop
   insert into zabelie_payment_checks(payment_id) values(r.id)
   on conflict(payment_id) do update set checked_at=clock_timestamp();
   idempotency_key:=r.idempotency_key; order_id:=r.order_id; created_at:=r.created_at; raw:=r.raw;
   return next;
 end loop;
end $$;
revoke all on function public.zabelie_claim_pending_payments(payment_rail) from public,anon,authenticated;
grant execute on function public.zabelie_claim_pending_payments(payment_rail) to service_role;

-- Minimal membership predicate: only the actual buyer or seller, including closed listings.
create function public.zabelie_order_participant(p_order_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and exists(
  select 1 from orders o join products p on p.id=o.product_id
  where o.id=p_order_id and (o.buyer_id=auth.uid() or p.seller_id=auth.uid())
 );
$$;
revoke all on function public.zabelie_order_participant(uuid) from public,anon;
grant execute on function public.zabelie_order_participant(uuid) to authenticated,service_role;

create table public.zabelie_support_cases (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null unique references orders(id) on delete restrict,
 opened_by uuid not null references profiles(id) on delete restrict,
 reason text not null check(reason in('debited','not_received','wrong','digital','other')),
 status text not null default 'open' check(status in('open','waiting_buyer','waiting_seller','resolved')),
 response_due_at timestamptz not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index zabelie_support_cases_queue on public.zabelie_support_cases(status,response_due_at);
create index zabelie_support_cases_author on public.zabelie_support_cases(opened_by);
alter table public.zabelie_support_cases enable row level security;
revoke all on public.zabelie_support_cases from public,anon,authenticated;
grant select on public.zabelie_support_cases to authenticated;
grant all on public.zabelie_support_cases to service_role;
create policy zabelie_support_participant_read on public.zabelie_support_cases for select to authenticated
 using(public.zabelie_order_participant(order_id));

create table public.zabelie_support_messages (
 id uuid primary key default gen_random_uuid(),
 case_id uuid not null references zabelie_support_cases(id) on delete restrict,
 author_id uuid not null references profiles(id) on delete restrict,
 author_role text not null check(author_role in('buyer','seller','admin')),
 request_id uuid not null,
 request_payload jsonb not null,
 body text not null check(length(btrim(body)) between 10 and 2000),
 created_at timestamptz not null default now(),
 unique(case_id,author_id,request_id)
);
create index zabelie_support_messages_thread on public.zabelie_support_messages(case_id,created_at,id);
create index zabelie_support_messages_author on public.zabelie_support_messages(author_id);
alter table public.zabelie_support_messages enable row level security;
revoke all on public.zabelie_support_messages from public,anon,authenticated;
grant select on public.zabelie_support_messages to authenticated;
grant select,insert on public.zabelie_support_messages to service_role;
create policy zabelie_support_messages_read on public.zabelie_support_messages for select to authenticated
 using(exists(select 1 from zabelie_support_cases c where c.id=case_id and public.zabelie_order_participant(c.order_id)));

create function public.zabelie_support_message_immutable() returns trigger language plpgsql as $$
begin raise exception 'Support history is append-only' using errcode='42501'; end $$;
revoke all on function public.zabelie_support_message_immutable() from public,anon,authenticated;
create trigger zabelie_support_message_immutable before update or delete on public.zabelie_support_messages
 for each row execute function public.zabelie_support_message_immutable();

-- Service-only RPC. HTTP authenticates the actor; SQL rechecks order membership and admin role.
create function public.zabelie_submit_support(p_order_id uuid,p_actor uuid,p_request_id uuid,p_reason text,p_body text,p_status text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_case zabelie_support_cases; v_role text; v_hours integer; v_hold jsonb; v_buyer uuid; v_seller uuid;
begin
 select o.buyer_id,p.seller_id into v_buyer,v_seller from orders o join products p on p.id=o.product_id where o.id=p_order_id;
 if not found then raise exception 'Order unavailable' using errcode='42501'; end if;
 if p_actor=v_buyer and p_status is null then v_role:='buyer';
 elsif p_actor=v_seller and p_status is null then v_role:='seller';
 elsif exists(select 1 from profiles where id=p_actor and role='admin') then v_role:='admin';
 else raise exception 'Order unavailable' using errcode='42501'; end if;
 if p_request_id is null or p_body is null or length(btrim(p_body)) not between 10 and 2000 or
    p_reason is null or p_reason not in('debited','not_received','wrong','digital','other') then
   raise exception 'Invalid support request' using errcode='22023';
 end if;
 if p_status is not null and (v_role<>'admin' or p_status not in('open','waiting_buyer','waiting_seller','resolved')) then
   raise exception 'Status change forbidden' using errcode='42501';
 end if;
 select support_hours into strict v_hours from zabelie_operations_config where id;
 insert into zabelie_support_cases(order_id,opened_by,reason,response_due_at)
 values(p_order_id,p_actor,p_reason,now()+make_interval(hours=>v_hours))
 on conflict(order_id) do nothing;
 select * into strict v_case from zabelie_support_cases where order_id=p_order_id for update;
 if exists(select 1 from zabelie_support_messages where case_id=v_case.id and author_id=p_actor and request_id=p_request_id) then
   if not exists(select 1 from zabelie_support_messages where case_id=v_case.id and author_id=p_actor and request_id=p_request_id
     and body=btrim(p_body) and request_payload=jsonb_build_object('reason',p_reason,'status',p_status)) then
     raise exception 'Request identifier reused with different content' using errcode='22023';
   end if;
   return jsonb_build_object('ok',true,'id',v_case.id,'duplicate',true);
 end if;
 insert into zabelie_support_messages(case_id,author_id,author_role,request_id,body,request_payload)
 values(v_case.id,p_actor,v_role,p_request_id,btrim(p_body),jsonb_build_object('reason',p_reason,'status',p_status));
 update zabelie_support_cases set updated_at=now(),
   status=coalesce(p_status,case when v_role<>'admin' then 'open' else status end),
   response_due_at=case when v_case.status='resolved' or v_role='admin' then now()+make_interval(hours=>v_hours) else response_due_at end
 where id=v_case.id;
 -- Preserve the existing non-receipt hold; never invent a refund or release of money.
 if v_role='buyer' and p_reason='not_received' then
   v_hold:=zabelie_report_not_received(p_order_id,p_actor,left(btrim(p_body),280));
 end if;
 if v_role='admin' then
   insert into zabelie_admin_actions(actor_id,action,target_type,target_id,metadata)
   values(p_actor,'support.reply','order',p_order_id,jsonb_build_object('status',p_status,'case_id',v_case.id));
 end if;
 return jsonb_build_object('ok',true,'id',v_case.id,'delivery_hold',coalesce((v_hold->>'ok')::boolean,false));
end $$;
revoke all on function public.zabelie_submit_support(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.zabelie_submit_support(uuid,uuid,uuid,text,text,text) to service_role;

-- An accounting reversal is distinct from an externally executed return of funds.
create table public.zabelie_refund_receipts (
 order_id uuid primary key references orders(id) on delete restrict,
 actor_id uuid not null references profiles(id) on delete restrict,
 method text not null check(method in('moncash','natcash','stripe','zelle','bank','cash')),
 provider_reference text not null check(length(btrim(provider_reference)) between 5 and 120),
 paid_at timestamptz not null check(isfinite(paid_at)),
 created_at timestamptz not null default now(),
 unique(method,provider_reference)
);
create index zabelie_refund_receipts_actor on public.zabelie_refund_receipts(actor_id);
alter table public.zabelie_refund_receipts enable row level security;
revoke all on public.zabelie_refund_receipts from public,anon,authenticated;
grant select,insert on public.zabelie_refund_receipts to service_role;
create trigger zabelie_refund_receipt_immutable before update or delete on public.zabelie_refund_receipts
 for each row execute function public.zabelie_support_message_immutable();
create function public.zabelie_record_refund_receipt(p_order_id uuid,p_actor uuid,p_method text,p_reference text,p_paid_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r zabelie_refund_receipts;
begin
 if not exists(select 1 from profiles where id=p_actor and role='admin') then raise exception 'Forbidden' using errcode='42501'; end if;
 perform 1 from orders where id=p_order_id and status='refunded' for update;
 if not found then raise exception 'Accounting reversal required' using errcode='22023'; end if;
 if p_paid_at is null or p_paid_at>now() or p_paid_at<now()-interval '2 years' then raise exception 'Invalid date' using errcode='22023'; end if;
 select * into r from zabelie_refund_receipts where order_id=p_order_id;
 if found then
   if r.method=p_method and r.provider_reference=btrim(p_reference) then return jsonb_build_object('ok',true,'duplicate',true); end if;
   raise exception 'Receipt already recorded' using errcode='23505';
 end if;
 insert into zabelie_refund_receipts(order_id,actor_id,method,provider_reference,paid_at)
 values(p_order_id,p_actor,p_method,btrim(p_reference),p_paid_at);
 insert into zabelie_admin_actions(actor_id,action,target_type,target_id,metadata)
 values(p_actor,'refund.receipt','order',p_order_id,jsonb_build_object('method',p_method,'paid_at',p_paid_at));
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.zabelie_record_refund_receipt(uuid,uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.zabelie_record_refund_receipt(uuid,uuid,text,text,timestamptz) to service_role;

create function public.zabelie_operations_queue(p_limit integer default 30,p_offset integer default 0)
returns jsonb language sql stable security definer set search_path=public as $$
 with rows as (
  select 'payment_pending'::text kind,p.id,o.id order_id,o.order_ref reference,o.amount_htg::bigint,p.rail::text rail,p.created_at since
   from payments p join orders o on o.id=p.order_id
   where p.status='pending' and p.created_at<now()-make_interval(mins=>(select pending_minutes from zabelie_operations_config where id))
  union all
  select 'payment_review',p.id,o.id,o.order_ref,o.amount_htg,p.rail::text,p.confirmed_at
   from payments p join orders o on o.id=p.order_id where p.status='confirmed' and o.status in('pending','disputed')
  union all
  select 'handover',f.order_id,o.id,o.order_ref,o.amount_htg,null,f.updated_at
   from zabelie_fulfillment f join orders o on o.id=f.order_id
   where f.status in('action_required','disputed_by_buyer') and o.status<>'refunded'
  union all
  select 'support',c.id,o.id,o.order_ref,o.amount_htg,null,c.created_at
   from zabelie_support_cases c join orders o on o.id=c.order_id where c.status<>'resolved'
  union all
  select 'refund',o.id,o.id,o.order_ref,o.amount_htg,null,o.created_at from orders o
   where o.status='refunded' and o.amount_htg>0 and not exists(select 1 from zabelie_refund_receipts r where r.order_id=o.id)
  union all
  select 'payout',p.id,null,null,p.amount_htg,null,p.created_at from payouts p where p.status in('requested','processing')
 ), page as (
  select * from rows order by since,id,kind limit greatest(1,least(coalesce(p_limit,30),100)) offset greatest(0,least(coalesce(p_offset,0),100000))
 )
 select jsonb_build_object('total',(select count(*) from rows),'rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb));
$$;
revoke all on function public.zabelie_operations_queue(integer,integer) from public,anon,authenticated;
grant execute on function public.zabelie_operations_queue(integer,integer) to service_role;

-- Actual orders and repeat buyers; no browser fingerprint, invented views or personal export.
create function public.zabelie_market_metrics(p_days integer default 30)
returns jsonb language sql stable security definer set search_path=public as $$
 with scoped as (
  select o.*,p.seller_id,p.category_id,s.zone_id from orders o join products p on p.id=o.product_id
  join profiles b on b.id=o.buyer_id join profiles s on s.id=p.seller_id
  where o.created_at>=now()-make_interval(days=>greatest(1,least(coalesce(p_days,30),90)))
    and o.zabelie_payment_is_live and o.amount_htg>0 and not b.is_test and not s.is_test and o.buyer_id<>p.seller_id
 ), paid as (
  select s.* from scoped s where s.status in('paid','delivered') and exists(select 1 from payments p where p.order_id=s.id and p.status='confirmed')
 ), active as (
  select p.*,s.zone_id from products p join profiles s on s.id=p.seller_id
  where p.status='published' and s.suspended_at is null and not s.is_test
 ), market as (
  select coalesce(c.label_kr,'San kategori') category,coalesce(z.label_kr,'Zòn pa presize') zone,
    count(*) products,count(distinct a.seller_id) sellers,
    (select count(*) from paid q where q.category_id is not distinct from a.category_id and q.zone_id is not distinct from a.zone_id) paid
  from active a left join zabelie_categories c on c.id=a.category_id left join zabelie_zones z on z.id=a.zone_id
  group by a.category_id,a.zone_id,c.label_kr,z.label_kr order by count(*) desc limit 30
 ), firsts as (
  select p.seller_id,min(pay.confirmed_at) at from orders o join products p on p.id=o.product_id
  join payments pay on pay.order_id=o.id and pay.status='confirmed'
  join profiles s on s.id=p.seller_id join profiles b on b.id=o.buyer_id
  where o.zabelie_payment_is_live and o.amount_htg>0 and o.buyer_id<>p.seller_id and not s.is_test and not b.is_test
  group by p.seller_id
 )
 select jsonb_build_object(
  'days',greatest(1,least(coalesce(p_days,30),90)),
  'orders',(select count(*) from scoped),'paid',(select count(*) from paid),
  'pending',(select count(*) from scoped where status='pending'),
  'buyers',(select count(distinct buyer_id) from paid),
  'repeat_buyers',(select count(*) from (select buyer_id from paid group by buyer_id having count(*)>1) r),
  'first_sale_median_hours',(select percentile_cont(0.5) within group(order by extract(epoch from(f.at-u.created_at))/3600)
    from firsts f join auth.users u on u.id=f.seller_id where f.at>=now()-make_interval(days=>greatest(1,least(coalesce(p_days,30),90)))),
  'markets',coalesce((select jsonb_agg(to_jsonb(market)) from market),'[]'::jsonb)
 );
$$;
revoke all on function public.zabelie_market_metrics(integer) from public,anon,authenticated;
grant execute on function public.zabelie_market_metrics(integer) to service_role;

create or replace function zabelie_objets_requis()
returns table (objet text, present boolean, pourquoi text)
language sql
stable
set search_path = public, pg_temp
as $$
  select v.objet, to_regprocedure(v.objet) is not null, v.pourquoi
    from (values
      ('zabelie_product_recommendations(uuid,uuid)', 'les recommandations basees sur les achats reels'),
      ('zabelie_configure_product_offers(uuid,uuid,jsonb,boolean)', 'le choix vendeur et les suggestions automatiques'),
      ('zabelie_recommendation_stats(uuid)', 'les ventes attribuees aux recommandations'),
      ('zabelie_save_product_offers(uuid,uuid,jsonb)', 'la configuration des offres associees du vendeur'),
      ('zabelie_offers_public(uuid,uuid)', 'les offres disponibles sur la fiche produit'),
      ('zabelie_offer_stats(uuid)', 'les ventes confirmees issues des offres associees'),
      ('zabelie_digital_metrics(uuid)', 'les statistiques des commandes digitales du vendeur'),
      -- ── Le chemin de l'argent. Absente = l'argent entre et rien ne bouge ──
      ('zabelie_claim_pending_payments(payment_rail)', 'la rotation des paiements en attente'),
      ('zabelie_order_participant(uuid)', 'la verification de propriete des dossiers'),
      ('zabelie_submit_support(uuid,uuid,uuid,text,text,text)', 'les demandes et reponses du support'),
      ('zabelie_record_refund_receipt(uuid,uuid,text,text,timestamp with time zone)', 'la preuve de retour des fonds'),
      ('zabelie_operations_queue(integer,integer)', 'la file des ventes a traiter'),
      ('zabelie_market_metrics(integer)', 'les mesures du marche haitien'),
      ('zabelie_stripe_payment_failed(uuid,text,text)', 'libere le stock apres un echec Stripe differe'),
      ('confirm_payment(text,text,jsonb,integer,integer)',
       'la confirmation serveur-à-serveur (invariant b) : absente, un paiement encaissé ne crée ni commande payée ni escrow'),
      ('refund_order(uuid)',
       'le remboursement : absente, un litige ne peut plus être résolu que par une écriture manuelle — donc hors ledger'),
      ('mature_wallets()',
       'la maturation J+7 : absente, aucun solde ne devient jamais retirable et le cron 13:00 échoue en silence'),
      ('zabelie_expire_stale_payment(text,text)',
       'expire les paiements qui n''aboutiront jamais : absente, les commandes en attente s''accumulent et le stock reste réservé'),
      ('zabelie_solvency_report()',
       'le rapport de solvabilité lu par /api/admin/coherence : absente, l''invariant 0033 n''est plus contrôlé du tout'),
      ('purge_payment_raw(integer)',
       'purge les charges brutes de paiement : absente, des données de paiement s''accumulent sans limite de rétention'),

      -- ── Retrait vendeur (chantier 0) ─────────────────────────────────────
      ('zabelie_request_payout(uuid,bigint)',
       'la demande de retrait : absente, la voie de sortie vendeur est fermée — le grief central du dossier BRH'),
      ('zabelie_settle_payout(uuid,payout_method,text,uuid,text)',
       'le règlement d''un retrait : absente, une demande acceptée ne peut plus être soldée'),
      ('zabelie_reject_payout(uuid,text,uuid)',
       'le refus motivé d''un retrait : absente, un refus se ferait sans trace ni motif'),
      ('zabelie_record_manual_payout(uuid,bigint,payout_method,text,uuid,text,timestamp with time zone)',
       'inscrit un versement fait à la main : absente, un paiement réel sortirait du ledger'),

      -- ── Stock ────────────────────────────────────────────────────────────
      ('zabelie_release_stock(uuid)',
       'libère une réservation : absente, un article annulé reste indisponible pour toujours'),
      ('zabelie_expire_stock_reservations()',
       'expire les réservations abandonnées (cron 13:45) : absente, le stock se vide sans qu''une vente ait eu lieu'),

      -- ── Expédition et remise (0043) ──────────────────────────────────────
      ('zabelie_open_fulfillment(uuid)',
       'ouvre le suivi d''une commande physique : absente, une commande payée n''entre jamais en expédition'),
      ('zabelie_declare_shipment(uuid,uuid,text)',
       'le vendeur déclare l''expédition : absente, il ne peut plus rien déclarer'),
      ('zabelie_mark_received(uuid,uuid,boolean)',
       'l''acheteur confirme la réception : absente, l''escrow ne se verrouille jamais'),
      ('zabelie_report_not_received(uuid,uuid,text)',
       'l''acheteur signale la non-réception : absente, le seul recours acheteur disparaît'),
      ('zabelie_fulfillment_sweep()',
       'le filet des commandes oubliées (cron 12:30) : absente, une commande payée peut rester orpheline sans que rien ne le dise'),

      -- ── Panier et rabais ─────────────────────────────────────────────────
      ('zabelie_cart_add(uuid)',    'ajout au panier : absente, le panier ne se remplit plus'),
      ('zabelie_cart_remove(uuid)', 'retrait du panier : absente, on ne peut plus retirer un article'),
      ('zabelie_set_variant_discount(uuid,uuid,uuid,bigint)', 'pose le rabais de la variante choisie en conservant son prix historique'),
      ('zabelie_clear_variant_discount(uuid,uuid,uuid)', 'retire le prix barre de la variante sans augmenter son prix courant'),
      ('zabelie_set_discount(uuid,uuid,bigint)',
       'pose un rabais vendeur : absente, la promotion est impossible côté vendeur'),
      ('zabelie_clear_discount(uuid,uuid)',
       'retire un rabais : absente, un rabais posé ne peut plus être annulé — un prix reste bas indéfiniment'),
      ('expire_coupons_job()',
       'expire les coupons (cron) : absente, un coupon périmé reste utilisable'),

      -- ── Fidélité (dormante, mais appelée par un cron) ────────────────────
      ('expire_points_batch_job()',
       'expire les lots de points (cron 14:00) : le système est débranché, mais le cron l''appelle — absente, le cron échoue et son échec masque les autres'),

      -- ── Notifications (0061) ─────────────────────────────────────────────
      ('zabelie_outbox_enqueue(uuid,zabelie_outbox_kind,text)',
       'met un avis en file : absente, plus aucune notification n''est jamais émise — et rien ne le signale'),
      ('zabelie_outbox_claim(uuid)',
       'réserve un avis à envoyer : absente, la file se remplit sans jamais se vider'),
      ('zabelie_outbox_mark_sent(uuid)',
       'marque l''avis envoyé : absente, le même avis serait renvoyé en boucle'),
      ('zabelie_outbox_mark_failed(uuid,text)',
       'marque l''échec d''envoi : absente, un échec devient indistinguable d''un envoi réussi'),
      ('zabelie_claim_notification(uuid)',
       'réserve une notification côté lecteur : absente, la lecture des avis se bloque'),

      -- ── Baux de cron (0060) ──────────────────────────────────────────────
      ('zabelie_cron_lease_acquire(text,text,integer)',
       'prend le bail d''un cron : absente, deux exécutions simultanées peuvent traiter la même chose deux fois'),
      ('zabelie_cron_lease_release(text,text)',
       'rend le bail : absente, un bail non rendu bloque le cron suivant jusqu''à expiration'),

      -- ── Recherche ────────────────────────────────────────────────────────
      ('zabelie_search_normalize(text)',
       'normalise une requête de recherche (0047) : absente, le capteur de demande dégrade en silence'),
      ('zabelie_record_search_miss(text,text,text)',
       'enregistre une recherche sans résultat : absente, on cesse de savoir ce que les acheteurs cherchent en vain'),
      ('zabelie_search_demand(integer,integer)',
       'restitue la demande non servie au tableau admin : absente, la page se vide sans erreur visible'),
      ('zabelie_search_fuzzy(text,integer)',
       'la recherche approximative : absente, une faute de frappe ne trouve plus rien'),
      ('zabelie_purge_search_misses()',
       'purge la rétention 90 j des recherches (cron 14:15) : absente, des requêtes utilisateurs sont conservées au-delà de la durée annoncée'),

      -- ── KYC (0079) ───────────────────────────────────────────────────────
      ('zabelie_kyc_docs_expires()',
       'liste les pièces d''identité à purger : absente, la purge ne trouve rien et paraît saine'),
      ('zabelie_purge_kyc_documents(uuid[])',
       'purge les pièces d''identité (cron 14:45) : absente, des documents ultra-sensibles sont conservés au-delà de la durée annoncée'),

      -- ── Conformité et garde-fous ─────────────────────────────────────────
      ('zabelie_record_policy_acceptance(uuid,text)',
       'sans elle, TOUTE création de fiche échoue (0046) — et l''échec tombe devant l''un des vingt premiers vendeurs, recrutés un par un'),
      ('zabelie_rate_limit(text,integer,integer)',
       'le plafonnement d''appels : absente, les plafonds cessent d''exister sans qu''aucune erreur ne soit levée'),
      ('zabelie_objets_requis()',
       'cette sonde elle-même : absente, /api/admin/coherence retombe sur le registre, qui déclare au lieu de constater'),

      -- ── Topup (V-11) ─────────────────────────────────────────────────────
      ('zabelie_topup_confirm_payment(uuid,text,jsonb,integer,integer)',
       'confirme une recharge : absente, un client paie sa recharge et ne la reçoit jamais'),
      ('zabelie_topup_transition(uuid,topup_status,jsonb)',
       'la machine à états des recharges : absente, une commande de recharge reste figée'),

      -- ── Business (0022) ──────────────────────────────────────────────────
      ('zabelie_biz_get_invoice_by_token(text)',
       'le portail public de facture : absente, tout lien de facture envoyé à un client tombe'),
      ('zabelie_biz_upsert_item(uuid,text,integer,bigint,uuid)',
       'ajoute une ligne de facture : absente, l''éditeur de facture ne peut plus rien enregistrer'),
      ('zabelie_biz_recompute_invoice(uuid)',
       'recalcule les totaux serveur : absente, un total pourrait être cru sur parole du client'),
      ('zabelie_biz_send_invoice(uuid)',
       'passe la facture à « envoyée » et fige son contenu : absente, une facture envoyée resterait modifiable'),
      ('zabelie_biz_void_invoice(uuid)',
       'annule une facture non payée : absente, une facture erronée ne peut plus être retirée'),
      ('zabelie_biz_confirm_invoice_payment(uuid,payment_rail,text,bigint,text)',
       'confirme le paiement MonCash d''une facture pro : absente, un client paie sa facture et elle reste « envoyée »'),

      -- ── Les sept que le grep à la main avait manqués ─────────────────────
      -- Elles sont appelées avec des apostrophes simples ou sur plusieurs
      -- lignes. C'est le garde `tests/objets-requis-couverture.test.ts` qui
      -- les a trouvées, pas l'œil : un `.rpc()` est un artefact adressé par
      -- CHAÎNE, et une liste tenue à la main en oublie toujours.
      ('zabelie_reserve_stock(uuid,uuid,integer)',
       'réserve le stock à la commande, atomiquement : absente, deux acheteurs peuvent acheter le dernier article'),
      ('zabelie_topup_reserve_order(uuid,uuid,text,topup_operator,integer,integer,integer,payment_rail,integer)',
       'crée une commande de recharge sous plafonds : absente, plus aucune recharge ne peut être commandée'),
      ('zabelie_search_index_integrity()',
       'contrôle l''intégrité de l''index de recherche, lu par /api/admin/coherence : absente, ce contrôle-là devient muet'),
      ('zabelie_fichier_sans_livrable_sweep()',
       'rattrape les fiches fichier sans livrable (0059) : absente, un acheteur peut payer un fichier qui n''existe pas'),
      ('zabelie_service_sans_suivi_sweep()',
       'rattrape les services sans suivi ouvert : absente, une prestation payée reste sans canal de remise'),
      ('zabelie_purge_sent_notices(integer)',
       'purge à 90 j les avis de remise envoyés (0056) : absente, des avis sont conservés au-delà de la durée annoncée — c''est le cas AUJOURD''HUI, voir la liste des absences attendues ci-dessous'),

      -- ── Les deux de `0084`, ajoutées PAR LE GARDE lui-même ───────────────
      -- Le croisement code × sonde les a nommées à la première exécution sur
      -- la branche de `0084`, avant qu'on y pense. C'est la démonstration que
      -- le garde vaut mieux qu'une liste tenue à la main : il a trouvé un cas
      -- réel, pas une mutation fabriquée pour lui plaire.
      ('zabelie_boutik_public(uuid,text)',
       'la fiche publique d''une boutique (0084) : absente, /createur/[id] et /boutik/[slug] répondent 404 pour tout le monde — la panne exacte que 0084 répare'),
      ('zabelie_vande_nan_zon(uuid[])',
       'les marchands d''une zone (0084) : absente, le filtre acheteur par zone rend zéro vendeur en journalisant « introuvables », ce qui se lit comme « cette zone est vide »'),

      -- ── Ajoutée PAR LE GARDE, une seconde fois (0099) ────────────────────
      -- Le croisement code × sonde a nommé celle-ci dès la première exécution,
      -- exactement comme les deux de `0084` ci-dessus. Deux fois sur deux, il a
      -- trouvé un cas réel avant qu'on y pense.
      ('zabelie_save_product_commitment(uuid,uuid,text,text,integer,text,date,boolean)',
       'enregistre les engagements de remise et la disponibilite declaree par le vendeur (0107)'),
      ('zabelie_est_rechaj(uuid)',
       'decide si une fiche exige un numero a recharger (0099) : absente, /api/checkout leve sur toute fiche portant un sous-rayon — c''est-a-dire que PLUS AUCUN achat ne passe, recharge ou non')
    ) as v(objet, pourquoi)
  union all
  select v.objet, to_regclass('public.' || v.objet) is not null, v.pourquoi
  from (values
    ('zabelie_support_cases','les dossiers de commandes'),
    ('zabelie_support_messages','les messages des dossiers'),
    ('zabelie_refund_receipts','les justificatifs de remboursement'),
    ('zabelie_operations_config','les seuils de suivi'),
    ('zabelie_payment_checks','la rotation des paiements'),
    ('zabelie_seller_pricing_config','configuration des tarifs vendeurs'),
    ('zabelie_seller_launch','eligibilite et compteur des 30 jours'),
    ('zabelie_order_pricing','tarif fige a la commande'),
    ('zabelie_product_commitments','les engagements publics de remise et de disponibilite (0107)'),
    ('zabelie_digital_studio','les brouillons de packs et de formations'),
    ('zabelie_digital_releases','les versions acquises et leurs fichiers privés'),
    ('zabelie_digital_entitlements','le contenu attaché à chaque commande'),
    ('zabelie_digital_progress','la progression privée des acheteurs'),
    ('zabelie_digital_accesses','les demandes de téléchargement mesurées')
  ) v(objet,pourquoi)
  union all
  select v.objet, exists(select 1 from pg_trigger g where g.tgname=v.objet and not g.tgisinternal and g.tgenabled <> 'D'), v.pourquoi
  from (values
    ('zabelie_support_message_immutable','les messages non modifiables'),
    ('zabelie_refund_receipt_immutable','les justificatifs non modifiables'),
    ('zabelie_order_seller_guard','interdit les commandes des vendeurs suspendus'),
    ('zabelie_record_seller_launch','enregistre la premiere offre'),
    ('zabelie_start_waiting_launches','demarre les lancements eligibles'),
    ('zabelie_snapshot_order_pricing','fige les frais a la commande'),
    ('zabelie_guard_order_pricing','protege le tarif fige'),
    ('zabelie_protect_test_account','empêche un compte de retirer sa marque d''essai'),
    ('zabelie_digital_order_snapshot','fige la version lors de la commande'),
    ('zabelie_digital_publication','crée une version après modération'),
    ('zabelie_digital_release_immutable','interdit la réécriture des versions achetées'),
    ('zabelie_digital_entitlement_immutable','interdit le remplacement du contrat acheté'),
    ('zabelie_digital_asset_guard','interdit de modifier un livrable publié'),
    ('zabelie_digital_studio_draft_guard','réserve la modification des leçons aux brouillons')
  ) v(objet,pourquoi);
$$;
