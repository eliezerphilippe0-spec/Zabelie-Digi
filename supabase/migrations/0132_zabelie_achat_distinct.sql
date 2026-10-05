select zabelie_migration_garde('0132_zabelie_achat_distinct.sql');

-- Même garde de commande (0112), avec acheteur distinct du vendeur.
-- Les lignes historiques restent immuables ; annulation/remboursement et
-- lecture de reprise restent possibles. Aucun mouvement d'argent ici.
create or replace function public.zabelie_order_seller_guard()
returns trigger language plpgsql set search_path = public
as $$
declare v_seller uuid; v_suspended timestamptz;
begin
  if tg_op='INSERT' or new.product_id is distinct from old.product_id then
    -- 0112 : création/réaffectation sérialisée avec la modération vendeur.
    select seller_id into v_seller from products where id=new.product_id for share;
  else
    -- Sur le même produit, RLS interdit au client de transférer seller_id.
    -- Ne pas prendre SHARE ici : confirm_payment prend ensuite le verrou
    -- vendeur/tarification et incrémente sales_count ; plusieurs SHARE
    -- concurrents provoqueraient une promotion de verrou circulaire.
    select seller_id into v_seller from products where id=new.product_id;
  end if;
  if not found then raise exception 'Seller unavailable' using errcode='ZB112'; end if;
  if new.buyer_id=v_seller and (
       tg_op='INSERT'
       or new.buyer_id is distinct from old.buyer_id
       or new.product_id is distinct from old.product_id
       or new.status in ('paid','delivered')) then
    raise exception 'Buyer must differ from seller' using errcode='ZB132';
  end if;
  -- Conserve la sérialisation de la création/modification du produit avec
  -- sa modération. Un remboursement d'une vente existante reste possible
  -- lorsque le vendeur est suspendu.
  if tg_op='INSERT' or new.product_id is distinct from old.product_id then
    select suspended_at into v_suspended from profiles where id=v_seller for share;
    if not found or v_suspended is not null then
      raise exception 'Seller unavailable' using errcode='ZB112';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.zabelie_order_seller_guard() from public, anon, authenticated;
drop trigger zabelie_order_seller_guard on public.orders;
create trigger zabelie_order_seller_guard
before insert or update of product_id,buyer_id,status on public.orders
for each row execute function public.zabelie_order_seller_guard();

-- Première vente = paiement réel d'un acheteur distinct, sans acteurs test.
-- Le drapeau manuel et l'armement automatique restent inchangés.
-- 0128 est une dépendance vérifiée ; aucun module groupé recréé ici.
create or replace function public.zabelie_panier_groupe_ouvert()
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((
    select c.paiement_groupe
        or (c.ouvrir_apres_premiere_vente
            and exists (
              select 1 from orders o
              join products p on p.id=o.product_id
              join profiles b on b.id=o.buyer_id
              join profiles s on s.id=p.seller_id
              where o.status in ('paid','delivered')
                and o.zabelie_payment_is_live and o.amount_htg>0
                and o.buyer_id<>p.seller_id
                and not b.is_test and not s.is_test))
    from zabelie_panier_config c where c.id
  ),false);
$$;
revoke all on function public.zabelie_panier_groupe_ouvert() from public,anon,authenticated;
grant execute on function public.zabelie_panier_groupe_ouvert() to service_role;

-- Provenance minimale, non personnelle, conservée après la purge du payload.
-- Une valeur Kobara inconnue n'est jamais devinée. Cette colonne n'exécute
-- aucun transfert et ne copie ni jeton, ni identité, ni réponse opérateur.
alter table public.payments add column zabelie_original_method text
  check(zabelie_original_method in('moncash','natcash','stripe','zelle'));
update public.payments set zabelie_original_method=case
  when rail::text in('moncash','stripe','zelle') then rail::text
  when rail::text='kobara'
    and coalesce(raw->>'kobara_provider',raw->>'provider') in('moncash','natcash')
    and (raw->>'kobara_provider' is null or raw->>'provider' is null or raw->>'kobara_provider'=raw->>'provider')
    then coalesce(raw->>'kobara_provider',raw->>'provider')
  else null end;

create function public.zabelie_original_payment_method_guard()
returns trigger language plpgsql set search_path=public as $$
declare v_method text;
begin
  if tg_op='UPDATE' and old.zabelie_original_method is not null then
    if new.zabelie_original_method is distinct from old.zabelie_original_method
      or new.rail is distinct from old.rail then
      raise exception 'Original payment method immutable' using errcode='ZB132';
    end if;
    return new;
  end if;
  v_method:=case
    when new.rail::text in('moncash','stripe','zelle') then new.rail::text
    when new.rail::text='kobara'
      and coalesce(new.raw->>'kobara_provider',new.raw->>'provider') in('moncash','natcash')
      and (new.raw->>'kobara_provider' is null or new.raw->>'provider' is null or new.raw->>'kobara_provider'=new.raw->>'provider')
      then coalesce(new.raw->>'kobara_provider',new.raw->>'provider')
    else null end;
  if new.zabelie_original_method is not null and new.zabelie_original_method is distinct from v_method then
    raise exception 'Original payment method must be derived' using errcode='ZB132';
  end if;
  new.zabelie_original_method:=v_method;
  return new;
end $$;
revoke all on function public.zabelie_original_payment_method_guard() from public,anon,authenticated;
create trigger zabelie_original_payment_method_guard before insert or update on public.payments
  for each row execute function public.zabelie_original_payment_method_guard();

-- Un justificatif de retour des fonds doit correspondre au moyen d'origine.
-- Kobara porte l'opérateur sous-jacent ; un enfant de groupe réutilise le
-- paiement opérateur de la meneuse. Aucun transfert n'est exécuté par ce RPC.
create or replace function public.zabelie_record_refund_receipt(p_order_id uuid,p_actor uuid,p_method text,p_reference text,p_paid_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r zabelie_refund_receipts; v_group uuid; v_payment_order uuid; v_method text;
begin
  if not exists(select 1 from profiles where id=p_actor and role='admin') then raise exception 'Forbidden' using errcode='42501'; end if;
  select group_id into v_group from orders where id=p_order_id and status='refunded' for update;
  if not found then raise exception 'Accounting reversal required' using errcode='22023'; end if;
  v_payment_order:=p_order_id;
  if v_group is not null then
    select leader_order_id into v_payment_order from zabelie_order_groups where id=v_group;
  end if;
  -- Une commande peut porter plusieurs tentatives (0001). Ne jamais
  -- prendre le rail d'une tentative échouée ou choisir entre deux moyens
  -- confirmés contradictoires. Les répétitions du même moyen restent valides.
  select min(p.zabelie_original_method) into v_method from payments p
    where p.order_id=v_payment_order and p.status='confirmed'
    having bool_and(p.zabelie_original_method is not null)
       and count(distinct p.zabelie_original_method)=1;
  if v_method is null or v_method not in('moncash','natcash','stripe','zelle') or p_method is distinct from v_method then
    raise exception 'Original payment method required' using errcode='22023';
  end if;
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

do $$
begin
  if exists(select 1 from pg_proc
    where oid in('public.zabelie_order_seller_guard()'::regprocedure,
                 'public.zabelie_original_payment_method_guard()'::regprocedure)
      and prosecdef) then
    raise exception '0132: trigger functions must remain invoker';
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.orders'::regclass
    and tgname='zabelie_order_seller_guard' and tgenabled='O'
    and tgtype=23 and cardinality(tgattr::smallint[])=3) then
    raise exception '0132: order trigger incomplete';
  end if;
  if has_function_privilege('anon','zabelie_order_seller_guard()','execute')
    or has_function_privilege('authenticated','zabelie_order_seller_guard()','execute')
    or has_function_privilege('authenticated','zabelie_panier_groupe_ouvert()','execute')
    or has_function_privilege('anon','zabelie_panier_groupe_ouvert()','execute') then
    raise exception '0132: client execution privilege';
  end if;
  if has_function_privilege('anon','zabelie_original_payment_method_guard()','execute')
    or has_function_privilege('authenticated','zabelie_original_payment_method_guard()','execute')
    or not exists(select 1 from pg_trigger where tgrelid='public.payments'::regclass
      and tgname='zabelie_original_payment_method_guard' and tgenabled='O' and tgtype=23) then
    raise exception '0132: payment provenance unprotected';
  end if;
end $$;

-- Sonde 0131 complète, avec la provenance 0132.
create or replace function zabelie_objets_requis()
returns table (objet text, present boolean, pourquoi text)
language sql
stable
set search_path = public, pg_temp
as $$
  -- Presence of the gate/table family means this module is installed (or
  -- partially installed). Its objects remain required even while the gate
  -- is closed: it can open automatically after the first real sale.
  with panier_installe as (
    select to_regprocedure('public.zabelie_panier_groupe_ouvert()') is not null
        or to_regclass('public.zabelie_panier_config') is not null
        or to_regclass('public.zabelie_order_groups') is not null as oui
  )
  select v.objet, to_regprocedure(v.objet) is not null, v.pourquoi
    from (values
      ('zabelie_product_recommendations(uuid,uuid)', 'les recommandations basees sur les achats reels'),
      ('zabelie_configure_product_offers(uuid,uuid,jsonb,boolean)', 'le choix vendeur et les suggestions automatiques'),
      ('zabelie_recommendation_stats(uuid)', 'les ventes attribuees aux recommandations'),
      ('zabelie_save_product_offers(uuid,uuid,jsonb)', 'la configuration des offres associees du vendeur'),
      ('zabelie_offers_public(uuid,uuid)', 'les offres disponibles sur la fiche produit'),
      ('zabelie_offer_stats(uuid)', 'les ventes confirmees issues des offres associees'),
      ('zabelie_digital_metrics(uuid)', 'les statistiques des commandes digitales du vendeur'),
      ('zabelie_webhook_claim(integer)', 'sans elle, aucun webhook vendeur ne part plus : ventes payees jamais signalees aux sites branches (0122)'),
      ('zabelie_webhook_record(uuid,boolean,integer,text)', 'sans elle, un webhook envoye reste en attente et repart en boucle (0122)'),
      ('zabelie_webhook_purge()', 'sans elle, le journal des envois webhook grossit sans fin (0122)'),
      -- ── Le chemin de l'argent. Absente = l'argent entre et rien ne bouge ──
      ('zabelie_claim_pending_payments(payment_rail)', 'la rotation des paiements en attente'),
      ('zabelie_order_participant(uuid)', 'la verification de propriete des dossiers'),
      ('zabelie_submit_support(uuid,uuid,uuid,text,text,text)', 'les demandes et reponses du support'),
      ('zabelie_record_refund_receipt(uuid,uuid,text,text,timestamp with time zone)', 'sans elle, le retour effectif des fonds ne peut plus etre documente'),
      ('zabelie_operations_queue(integer,integer)', 'sans elle, les commandes bloquees disparaissent du suivi administrateur'),
      ('zabelie_market_metrics(integer)', 'sans elle, les ventes reelles par zone et categorie ne sont plus mesurables'),
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
      -- ── Relances de paiement abandonné (0124) ────────────────────────────
      ('zabelie_relances_dues(integer)',
       'liste les relances dues (cron 15:30) : absente, aucune relance ne part et le journal paraît sain'),
      ('zabelie_email_jeton(uuid)',
       'le jeton de désabonnement de chaque e-mail : absente, aucune relance ne part'),
      ('zabelie_email_desabonner(uuid)',
       'le désabonnement en un clic : absente, un acheteur ne peut plus arrêter les relances'),
      -- ── Domaine personnalisé (0125) ──────────────────────────────────────
      ('zabelie_domaine_demander(uuid,text)',
       'la demande de domaine du vendeur : absente, le formulaire échoue'),
      ('zabelie_domaine_retirer(uuid)',
       'le retrait du domaine par le vendeur : absente, un vendeur ne peut plus débrancher son domaine'),
      ('zabelie_domaine_decider(uuid,boolean,text)',
       'la décision admin : absente, aucun domaine ne peut être activé ni refusé'),
      ('zabelie_domaine_boutik(text)',
       'hôte vers boutique, lu à chaque visite d''un domaine vendeur : absente, tous les domaines actifs répondent 404'),
      ('zabelie_purge_search_misses()',
       'purge la rétention 90 j des recherches (cron 14:15) : absente, des requêtes utilisateurs sont conservées au-delà de la durée annoncée'),

      -- ── KYC (0079) ───────────────────────────────────────────────────────
      ('zabelie_register_kyc_document(uuid,text,text,jsonb)',
       'le depot atomique des pieces KYC (0130) : absente, aucun document ne peut etre depose sans perdre la protection des decisions concurrentes'),
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
       'decide si une fiche exige un numero a recharger (0099) : absente, /api/checkout leve sur toute fiche portant un sous-rayon — c''est-a-dire que PLUS AUCUN achat ne passe, recharge ou non'),
      ('zabelie_age_minimum(uuid)',
       'age minimum d''une fiche par l''ascendance de son rayon (0115) : absente, /api/checkout refuse en 503 toute fiche portant un sous-rayon, et la fiche produit perd sa mention 18+')
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
    ('zabelie_digital_accesses','les demandes de téléchargement mesurées'),
    ('zabelie_order_age_attestations','les attestations d''age des acheteurs (0115)'),
    ('zabelie_api_keys','les cles d''API vendeur (0121)'),
    ('zabelie_webhook_endpoints','les adresses webhook des vendeurs (0122)'),
    ('zabelie_webhook_deliveries','la file des envois webhook (0122)'),
    ('zabelie_seller_domains','les domaines personnalises des boutiques (0125)')
  ) v(objet,pourquoi)
  union all
  select v.objet, exists(select 1 from pg_trigger g where g.tgname=v.objet and not g.tgisinternal and g.tgenabled <> 'D'), v.pourquoi
  from (values
    ('zabelie_support_message_immutable','les messages non modifiables'),
    ('zabelie_refund_receipt_immutable','les justificatifs non modifiables'),
    ('zabelie_order_seller_guard','interdit les commandes des vendeurs suspendus'),
    ('zabelie_original_payment_method_guard','conserve le moyen d’origine après purge du payload (0132)'),
    ('zabelie_preserve_account_closure','conserve la date de fermeture au rejeu'),
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
    ('zabelie_digital_studio_draft_guard','réserve la modification des leçons aux brouillons'),
    ('zabelie_order_age_attestation_immutable','interdit la reecriture d''une attestation d''age (0115)'),
    ('zabelie_api_keys_garde','plafond et immuabilite des cles d''API (0121)'),
    ('zabelie_webhook_endpoints_garde','plafond et immuabilite des adresses webhook (0122)'),
    ('zabelie_webhook_enfiler_vente','enfile les webhooks a chaque vente payee ou remboursee (0122)')
  ) v(objet,pourquoi)
  union all
  select v.objet, to_regprocedure(v.objet) is not null, v.pourquoi
  from (values
    ('zabelie_panier_groupe_ouvert()',
     'le gate du panier groupe (0128) : absent apres installation, le panier ne peut plus respecter son ouverture conditionnelle'),
    ('zabelie_group_create(uuid,payment_rail)',
     'ouvre un paiement groupe du panier (0128) : absente apres installation, la preparation du panier echoue'),
    ('zabelie_group_seal(uuid)',
     'scelle le total du panier depuis la base (0128) : absente apres installation, aucun paiement groupe ne part vers l''operateur'),
    ('zabelie_group_abort(uuid)',
     'abandonne un groupe avant paiement (0128) : absente apres installation, ses commandes restent pending et tiennent le stock'),
    ('zabelie_confirm_group_payment(uuid,text,jsonb,integer,integer)',
     'confirme les commandes d''un panier paye (0128) : absente apres installation, un encaissement groupe ne confirme aucune commande')
  ) v(objet,pourquoi)
  where (select oui from panier_installe)
  union all
  select v.objet, to_regclass('public.' || v.objet) is not null, v.pourquoi
  from (values
    ('zabelie_order_groups','les paniers payes en une fois (0128) : absente apres installation, le regroupement des commandes est impossible'),
    ('zabelie_panier_config','le gate du paiement groupe (0128) : absente apres installation, la condition d''ouverture ne peut plus etre verifiee')
  ) v(objet,pourquoi)
  where (select oui from panier_installe)
  union all
  select v.objet, exists(select 1 from pg_trigger g where g.tgname=v.objet and not g.tgisinternal and g.tgenabled <> 'D'), v.pourquoi
  from (values
    ('zabelie_group_leader_failed','propage l''echec de la meneuse au panier (0128) : absent apres installation, les autres commandes restent pending et tiennent le stock')
  ) v(objet,pourquoi)
  where (select oui from panier_installe)
  union all
  select 'payments.zabelie_original_method', exists(select 1 from pg_attribute where attrelid='public.payments'::regclass and attname='zabelie_original_method' and not attisdropped), 'conserve le moyen d’origine sans payload personnel (0132)';
$$;
