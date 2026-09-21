select zabelie_migration_garde('0108_seller_pricing_launch.sql');

-- Staged rollout: migration alone changes no commission. Enable only after
-- commercial review, a verified USD/HTG rate and an application deployment.
-- Historical orders keep their original calculation, including Elite.
create table public.zabelie_seller_pricing_config (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  direct_rate_bps integer not null default 1000 check (direct_rate_bps between 0 and 3000),
  direct_fixed_usd_cents integer not null default 50 check (direct_fixed_usd_cents between 0 and 10000),
  discovery_rate_bps integer not null default 3000 check (discovery_rate_bps between 0 and 3000),
  usd_htg_micros bigint check (usd_htg_micros between 1000000 and 10000000000),
  attribution_days integer not null default 7 check (attribution_days between 1 and 30),
  submission_days integer not null default 7 check (submission_days between 1 and 30),
  launch_days integer not null default 30 check (launch_days between 1 and 90),
  launch_sales_limit integer not null default 3 check (launch_sales_limit between 1 and 100),
  launch_discount_bps integer not null default 5000 check (launch_discount_bps between 0 and 10000),
  payments_ready boolean not null default false,
  updated_at timestamptz not null default now(),
  check (not enabled or usd_htg_micros is not null)
);
insert into public.zabelie_seller_pricing_config(id) values(true);
alter table public.zabelie_seller_pricing_config enable row level security;
revoke all on public.zabelie_seller_pricing_config from public, anon, authenticated;
grant select on public.zabelie_seller_pricing_config to anon, authenticated;
grant all on public.zabelie_seller_pricing_config to service_role;
create policy zabelie_seller_pricing_public on public.zabelie_seller_pricing_config
  for select to anon, authenticated using (enabled);

create table public.zabelie_seller_launch (
  seller_id uuid primary key references public.profiles(id) on delete cascade,
  submitted_at timestamptz not null,
  submission_deadline timestamptz not null,
  published_at timestamptz,
  eligible boolean not null,
  starts_at timestamptz,
  ends_at timestamptz,
  used_sales integer not null default 0 check (used_sales >= 0),
  sales_limit integer not null check (sales_limit > 0),
  discount_bps integer not null check (discount_bps between 0 and 10000),
  check ((starts_at is null and ends_at is null) or (starts_at is not null and ends_at > starts_at)),
  check (used_sales <= sales_limit)
);
alter table public.zabelie_seller_launch enable row level security;
revoke all on public.zabelie_seller_launch from public, anon, authenticated;
grant select on public.zabelie_seller_launch to authenticated;
grant all on public.zabelie_seller_launch to service_role;
create policy zabelie_seller_launch_owner on public.zabelie_seller_launch
  for select to authenticated using (seller_id = (select auth.uid()));

-- Read the Auth signup date, never the editable profile timestamp.
create schema if not exists zabelie_private;
revoke all on schema zabelie_private from public, anon, authenticated;
grant usage on schema zabelie_private to service_role;
create function zabelie_private.zabelie_record_seller_launch() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare c zabelie_seller_pricing_config; deadline timestamptz;
begin
  select * into c from zabelie_seller_pricing_config where id;
  if not c.enabled then return new; end if;
  if auth.uid() is not null and auth.uid() <> new.seller_id then raise exception 'launch_owner_required' using errcode='42501'; end if;
  select created_at + make_interval(days => c.submission_days) into deadline
    from auth.users where id = new.seller_id;
  if tg_op = 'INSERT' then
    insert into zabelie_seller_launch(seller_id, submitted_at, submission_deadline, eligible, sales_limit, discount_bps)
      values(new.seller_id, now(), deadline,
        now() < deadline and not exists(select 1 from products where seller_id=new.seller_id and id<>new.id),
        c.launch_sales_limit, c.launch_discount_bps)
      on conflict (seller_id) do nothing;
  end if;
  if new.status = 'published' then
    update zabelie_seller_launch set published_at=coalesce(published_at, now()),
      starts_at=case when eligible and c.payments_ready then coalesce(starts_at, now()) else starts_at end,
      ends_at=case when eligible and c.payments_ready then coalesce(ends_at, now()+make_interval(days=>c.launch_days)) else ends_at end
      where seller_id=new.seller_id;
  end if;
  return new;
end;
$$;
revoke all on function zabelie_private.zabelie_record_seller_launch() from public, anon, authenticated;
grant execute on function zabelie_private.zabelie_record_seller_launch() to service_role;
create trigger zabelie_record_seller_launch after insert or update of status on public.products
  for each row execute function zabelie_private.zabelie_record_seller_launch();

-- Published offers wait without losing days until real payments are ready.
create function public.zabelie_start_waiting_launches() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if new.enabled and new.payments_ready then
    update zabelie_seller_launch set starts_at=now(), ends_at=now()+make_interval(days=>new.launch_days)
      where eligible and starts_at is null and published_at is not null;
  end if;
  new.updated_at:=now();
  return new;
end;
$$;
revoke all on function public.zabelie_start_waiting_launches() from public, anon, authenticated;
grant execute on function public.zabelie_start_waiting_launches() to service_role;
create trigger zabelie_start_waiting_launches before update on public.zabelie_seller_pricing_config
  for each row execute function public.zabelie_start_waiting_launches();

alter table public.orders add column zabelie_payment_is_live boolean not null default false;
alter table public.orders add column zabelie_sale_source text not null default 'direct'
  check (zabelie_sale_source in ('direct','discovery'));
create table public.zabelie_order_pricing (
  order_id uuid primary key references public.orders(id) on delete cascade,
  seller_id uuid not null references public.profiles(id),
  source text not null check (source in ('direct','discovery')),
  gross_htg bigint not null check (gross_htg>=0),
  is_live boolean not null,
  rate_bps integer not null check (rate_bps between 0 and 3000),
  fixed_htg bigint not null check (fixed_htg>=0),
  fixed_usd_cents integer not null check (fixed_usd_cents>=0),
  usd_htg_micros bigint not null,
  commission_htg bigint check (commission_htg between 0 and gross_htg),
  launch_discount_htg bigint not null default 0 check (launch_discount_htg>=0),
  settled_at timestamptz,
  created_at timestamptz not null default now()
);
create index zabelie_order_pricing_seller_idx on public.zabelie_order_pricing(seller_id);
alter table public.zabelie_order_pricing enable row level security;
revoke all on public.zabelie_order_pricing from public, anon, authenticated;
grant select on public.zabelie_order_pricing to authenticated;
grant all on public.zabelie_order_pricing to service_role;
create policy zabelie_order_pricing_owner on public.zabelie_order_pricing
  for select to authenticated using (seller_id=(select auth.uid()));

create function public.zabelie_snapshot_order_pricing() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare c zabelie_seller_pricing_config; seller uuid;
begin
  select * into c from zabelie_seller_pricing_config where id;
  if not c.enabled then return new; end if;
  select seller_id into seller from products where id=new.product_id;
  insert into zabelie_order_pricing(order_id,seller_id,source,gross_htg,is_live,rate_bps,fixed_htg,fixed_usd_cents,usd_htg_micros)
    values(new.id,seller,new.zabelie_sale_source,new.amount_htg,new.zabelie_payment_is_live,
      case when new.zabelie_sale_source='discovery' then c.discovery_rate_bps else c.direct_rate_bps end,
      case when new.zabelie_sale_source='discovery' then 0 else floor(c.direct_fixed_usd_cents::numeric*c.usd_htg_micros/100000000)::bigint end,
      case when new.zabelie_sale_source='discovery' then 0 else c.direct_fixed_usd_cents end,c.usd_htg_micros);
  return new;
end;
$$;
revoke all on function public.zabelie_snapshot_order_pricing() from public, anon, authenticated;
grant execute on function public.zabelie_snapshot_order_pricing() to service_role;
create trigger zabelie_snapshot_order_pricing after insert on public.orders
  for each row execute function public.zabelie_snapshot_order_pricing();

-- Existing confirmed-payment transaction calls this AFTER amount/stock checks.
-- A seller-row lock serializes concurrent bonuses. Refunds do not reset quota.
create function public.zabelie_settle_order_pricing(p_order uuid, p_legacy_bps integer)
returns table(rate_bps integer, commission_htg bigint)
language plpgsql security invoker set search_path=public,pg_temp as $$
declare q zabelie_order_pricing; l zabelie_seller_launch; o orders;
  normal_fee bigint; actual_fee bigint; discount bigint:=0;
begin
  select * into o from orders where id=p_order;
  select * into q from zabelie_order_pricing where order_id=p_order for update;
  if not found then
    return query select p_legacy_bps,zabelie_commission_htg(o.amount_htg,p_legacy_bps); return;
  end if;
  if q.settled_at is not null then return query select q.rate_bps,q.commission_htg; return; end if;
  if q.seller_id is distinct from (select seller_id from products where id=o.product_id) then raise exception 'pricing_seller_changed'; end if;
  if o.amount_htg <> q.gross_htg then raise exception 'pricing_amount_changed'; end if;
  normal_fee:=case when q.gross_htg=0 then 0 else least(q.gross_htg,
    zabelie_commission_htg(q.gross_htg,q.rate_bps)+q.fixed_htg) end;
  actual_fee:=normal_fee;
  select * into l from zabelie_seller_launch where seller_id=q.seller_id for update;
  if found and l.eligible and l.starts_at<=now() and now()<l.ends_at
      and l.used_sales<l.sales_limit and q.is_live and normal_fee>0 and o.buyer_id<>q.seller_id then
    actual_fee:=floor(normal_fee::numeric*(10000-l.discount_bps)/10000)::bigint;
    discount:=normal_fee-actual_fee;
    if discount>0 then update zabelie_seller_launch set used_sales=used_sales+1 where seller_id=q.seller_id; end if;
  end if;
  update zabelie_order_pricing set commission_htg=actual_fee,launch_discount_htg=discount,settled_at=now() where order_id=p_order;
  return query select q.rate_bps,actual_fee;
end;
$$;
revoke all on function public.zabelie_settle_order_pricing(uuid,integer) from public, anon, authenticated;
grant execute on function public.zabelie_settle_order_pricing(uuid,integer) to service_role;

-- Preserve newer stock/affiliate/fulfillment safeguards; refuse unknown body.
do $patch$
declare src text; needle text := 'v_commission := zabelie_commission_htg(v_order.amount_htg, v_rate_bps);';
begin
  src:=pg_get_functiondef('public.confirm_payment(text,text,jsonb,integer,integer)'::regprocedure);
  if (length(src)-length(replace(src,needle,'')))/length(needle)<>1
      or position('zabelie_consume_stock_strict' in src)=0 or position('affiliate_credit:' in src)=0 then
    raise exception '0108: unexpected confirm_payment body';
  end if;
  execute replace(src,needle,'select p.rate_bps, p.commission_htg into v_rate_bps, v_commission from public.zabelie_settle_order_pricing(v_order.id, v_rate_bps) p;');
end;
$patch$;

create function public.zabelie_guard_order_pricing() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if tg_op='DELETE' then
    if old.settled_at is not null then raise exception 'pricing_snapshot_immutable' using errcode='23514'; end if;
    return old;
  end if;
  if old.settled_at is not null or
     (to_jsonb(new)-'commission_htg'-'launch_discount_htg'-'settled_at') is distinct from
     (to_jsonb(old)-'commission_htg'-'launch_discount_htg'-'settled_at') then
    raise exception 'pricing_snapshot_immutable' using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function public.zabelie_guard_order_pricing() from public, anon, authenticated;
grant execute on function public.zabelie_guard_order_pricing() to service_role;
create trigger zabelie_guard_order_pricing before update or delete on public.zabelie_order_pricing
  for each row execute function public.zabelie_guard_order_pricing();


create or replace function zabelie_objets_requis()
returns table (objet text, present boolean, pourquoi text)
language sql
stable
set search_path = public, pg_temp
as $$
  select v.objet, to_regprocedure(v.objet) is not null, v.pourquoi
    from (values
      ('zabelie_digital_metrics(uuid)', 'les statistiques des commandes digitales du vendeur'),
      -- ── Le chemin de l'argent. Absente = l'argent entre et rien ne bouge ──
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
