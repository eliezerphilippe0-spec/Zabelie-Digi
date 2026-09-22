select zabelie_migration_garde('0111_purchase_recommendations.sql');

-- Réglages de pertinence, sans prix, commission ni profilage individuel.
create table public.zabelie_recommendation_config (
  id boolean primary key default true check(id),
  enabled boolean not null default true,
  min_buyers integer not null default 5 check(min_buyers between 5 and 1000),
  history_days integer not null default 180 check(history_days between 30 and 365),
  pair_days integer not null default 30 check(pair_days between 1 and 30),
  min_confidence_bps integer not null default 2000 check(min_confidence_bps between 1000 and 10000),
  max_results integer not null default 3 check(max_results between 1 and 3)
);
alter table public.zabelie_recommendation_config enable row level security;
revoke all on public.zabelie_recommendation_config from public,anon,authenticated;
grant all on public.zabelie_recommendation_config to service_role;
create policy zabelie_recommendation_config_server on public.zabelie_recommendation_config
  for all to service_role using(true) with check(true);
insert into public.zabelie_recommendation_config(id) values(true);

alter table public.products add column zabelie_auto_recommendations boolean not null default true;
alter table public.orders add column zabelie_recommendation_source_id uuid references public.products(id) on delete set null;
create index zabelie_recommendation_orders_idx on public.orders(product_id,buyer_id,created_at)
  where zabelie_payment_is_live and amount_htg>0 and status in('paid','delivered');
create index zabelie_recommendation_attribution_idx on public.orders(zabelie_recommendation_source_id)
  where zabelie_recommendation_source_id is not null;

-- Disponibilité commune aux offres choisies et calculées ; aucun second catalogue.
create function public.zabelie_offer_target_available(p_source uuid,p_target uuid,p_buyer uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from products s join products t on t.id=p_target
    where s.id=p_source and s.id<>t.id and s.seller_id=t.seller_id
      and s.status='published' and t.status='published'
      and seller_is_active(s.seller_id) and not zabelie_vendeur_essai(s.seller_id)
      and not zabelie_est_rechaj(s.id) and not zabelie_est_rechaj(t.id)
      and (t.kind<>'physical' or (t.in_stock and exists(
        select 1 from zabelie_product_variants v join zabelie_stock st on st.variant_id=v.id
        where v.product_id=t.id and v.active and st.quantity_available>0)))
      and not exists(select 1 from zabelie_flash_sales f where f.product_id in(s.id,t.id)
        and f.annulee_a is null and f.debut<=now() and f.fin>now())
      and not(t.kind='fichier' and p_buyer is not null and exists(
        select 1 from orders o where o.product_id=t.id and o.buyer_id=p_buyer and o.status in('paid','delivered')))
  );
$$;
revoke all on function public.zabelie_offer_target_available(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.zabelie_offer_target_available(uuid,uuid,uuid) to service_role;

create or replace function public.zabelie_offers_public(p_product_id uuid,p_buyer_id uuid default null)
returns table(id uuid,offer_kind text,target_product_id uuid,title text,slug text,price_htg integer,product_kind product_kind)
language sql stable security definer set search_path=public as $$
  select o.id,o.offer_kind,t.id,t.title,t.slug,t.price_htg,t.kind
  from zabelie_product_offers o join products s on s.id=o.source_product_id join products t on t.id=o.target_product_id
  where o.source_product_id=p_product_id and o.active
    and zabelie_offer_target_available(s.id,t.id,p_buyer_id)
    and (o.offer_kind='cross_sell' or (s.kind=t.kind and (
      (o.offer_kind='upsell' and t.price_htg>s.price_htg) or (o.offer_kind='downsell' and t.price_htg<s.price_htg))))
  order by case o.offer_kind when 'upsell' then 1 when 'cross_sell' then 2 else 3 end;
$$;
revoke all on function public.zabelie_offers_public(uuid,uuid) from public,anon,authenticated;
grant execute on function public.zabelie_offers_public(uuid,uuid) to service_role;

-- Lecture pure : aucune association automatique n'est écrite dans la table du vendeur.
-- Fenêtre à la date de confirmation du paiement, 1 voix maximum par acheteur et paire.
create function public.zabelie_product_recommendations(p_product_id uuid,p_buyer_id uuid default null)
returns table(id uuid,offer_kind text,target_product_id uuid,title text,slug text,price_htg integer,
 product_kind product_kind,source_product_id uuid,origin text)
language sql stable security definer set search_path=public as $$
  with cfg as materialized(select * from zabelie_recommendation_config where id and enabled),
  source as materialized(
    select p.* from products p cross join cfg where p.id=p_product_id and p.zabelie_auto_recommendations
      and p.status='published' and seller_is_active(p.seller_id) and not zabelie_vendeur_essai(p.seller_id)
      and not zabelie_est_rechaj(p.id)
  ),
  purchases as materialized(
    select o.buyer_id,o.product_id,pay.at
    from source s join products p on p.seller_id=s.seller_id
    join orders o on o.product_id=p.id
    join profiles buyer on buyer.id=o.buyer_id and not buyer.is_test and buyer.suspended_at is null
    cross join cfg
    join lateral(select min(confirmed_at) as at from payments
      where order_id=o.id and status='confirmed' and confirmed_at is not null) pay on true
    where o.status in('paid','delivered') and o.zabelie_payment_is_live and o.amount_htg>0
      and o.buyer_id<>s.seller_id and not zabelie_est_rechaj(p.id)
      and pay.at>=now()-make_interval(days=>cfg.history_days) and pay.at<=now()
  ),
  source_count as(select count(distinct buyer_id) as n from purchases where product_id=p_product_id),
  target_counts as(select product_id,count(distinct buyer_id) as n from purchases group by product_id),
  pairs as(
    select b.product_id,count(distinct a.buyer_id) as n
    from purchases a join purchases b on b.buyer_id=a.buyer_id and b.product_id<>a.product_id cross join cfg
    where a.product_id=p_product_id and b.at between a.at-make_interval(days=>cfg.pair_days) and a.at+make_interval(days=>cfg.pair_days)
    group by b.product_id
  )
  select null::uuid,'cross_sell'::text,t.id,t.title,t.slug,t.price_htg,t.kind,p_product_id,'purchases'::text
  from pairs pair join products t on t.id=pair.product_id join target_counts tc on tc.product_id=t.id
  cross join source_count sc cross join cfg
  where pair.n>=cfg.min_buyers and pair.n*10000>=sc.n*cfg.min_confidence_bps
    and zabelie_offer_target_available(p_product_id,t.id,p_buyer_id)
    and not exists(select 1 from zabelie_product_offers f where f.source_product_id=p_product_id and f.target_product_id=t.id and f.active)
  -- Similarité cosinus au carré : corrige le simple classement par best-seller.
  order by (pair.n::numeric*pair.n/nullif(sc.n::numeric*tc.n,0)) desc,pair.n desc,t.price_htg,t.id
  limit (select max_results from cfg);
$$;
revoke all on function public.zabelie_product_recommendations(uuid,uuid) from public,anon,authenticated;
grant execute on function public.zabelie_product_recommendations(uuid,uuid) to service_role;

-- Le formulaire existant conserve ses trois emplacements. Préférence + offres = même transaction.
create function public.zabelie_configure_product_offers(p_user_id uuid,p_product_id uuid,p_targets jsonb,p_automatic boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  if p_automatic is null then return jsonb_build_object('ok',false,'reason','invalid'); end if;
  result:=zabelie_save_product_offers(p_user_id,p_product_id,p_targets);
  if result->>'ok'='true' then
    update products set zabelie_auto_recommendations=p_automatic where id=p_product_id and seller_id=p_user_id;
  end if;
  return result;
end;
$$;
revoke all on function public.zabelie_configure_product_offers(uuid,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.zabelie_configure_product_offers(uuid,uuid,jsonb,boolean) to service_role;

create function public.zabelie_recommendation_order_guard()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.zabelie_recommendation_source_id is null then return new; end if;
  if new.zabelie_offer_id is not null or not exists(
    select 1 from zabelie_product_recommendations(new.zabelie_recommendation_source_id,new.buyer_id) r
    where r.target_product_id=new.product_id
  ) then new.zabelie_recommendation_source_id:=null; end if;
  return new;
end;
$$;
revoke all on function public.zabelie_recommendation_order_guard() from public,anon,authenticated;
create trigger zabelie_recommendation_order_guard before insert or update of zabelie_recommendation_source_id,zabelie_offer_id
on public.orders for each row execute function public.zabelie_recommendation_order_guard();

create function public.zabelie_recommendation_stats(p_user_id uuid)
returns table(product_id uuid,confirmed bigint)
language sql stable security definer set search_path=public as $$
  select s.id,count(o.id)
  from products s join orders o on o.zabelie_recommendation_source_id=s.id
  join products t on t.id=o.product_id and t.seller_id=s.seller_id
  join profiles b on b.id=o.buyer_id and not b.is_test
  where s.seller_id=p_user_id and o.status in('paid','delivered') and o.zabelie_payment_is_live
    and o.amount_htg>0 and o.buyer_id<>p_user_id
    and exists(select 1 from payments p where p.order_id=o.id and p.status='confirmed' and p.confirmed_at is not null)
  group by s.id;
$$;
revoke all on function public.zabelie_recommendation_stats(uuid) from public,anon,authenticated;
grant execute on function public.zabelie_recommendation_stats(uuid) to service_role;

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
