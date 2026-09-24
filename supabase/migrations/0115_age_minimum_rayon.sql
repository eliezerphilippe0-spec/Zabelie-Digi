select zabelie_migration_garde('0115_age_minimum_rayon.sql');

-- ============================================================================
-- 0115 — L'âge minimum d'un rayon, en BASE ; le clairin reste FERMÉ
-- ============================================================================
-- DÉCISION PORTEUR, 2026-09-23 : « oui 18 ans, go sur le plan ». Le plan :
--   1. politique : 18 ans en toutes lettres, pièce d'identité à la remise ;
--   2. mention « 18+ » sur la fiche ;
--   3. attestation obligatoire de l'acheteur, REFUSÉE côté serveur si absente ;
--   4. vérification d'identité par le vendeur à la remise (politique) ;
--   5. puis, et seulement puis, ouverture du rayon `klerin` (0116).
--
-- Cette migration porte la partie BASE des étapes 2 et 3. Elle n'ouvre RIEN.
--
-- ─── POURQUOI UNE COLONNE ET PAS UN SLUG EN DUR ─────────────────────────────
-- Règle dure n°3 : un paramètre commercial vit en table, jamais dans le code.
-- Le seuil de 18 ans est une lecture de la loi haïtienne faite par le porteur
-- (l'âge le plus cité, celui de la majorité), pas un fait établi sur texte —
-- aucun article n'a pu être lu (proxy). S'il change, ou si un autre rayon doit
-- être restreint (rhum, liqueurs), c'est un `update`, sans déploiement.
--
-- `null` = aucune restriction. L'âge d'une fiche est le MAXIMUM le long de
-- l'ascendance de son rayon (`zabelie_age_minimum`), comme `zabelie_est_rechaj`
-- (0099) : une fiche rangée trois niveaux plus bas n'y échappe pas.
--
-- ─── L'ATTESTATION EST CONSERVÉE ────────────────────────────────────────────
-- `zabelie_order_age_attestations` : une ligne par commande restreinte, écrite
-- par /api/checkout AVANT le paiement, sans best-effort. Elle dit ce que
-- l'acheteur a déclaré, à quel seuil, et quand. Non modifiable ; elle suit la
-- commande à la suppression (cascade), puisqu'une commande retirée à mi-chemin
-- n'a rien attesté de durable.
-- ============================================================================

-- ── 1. La colonne de configuration ──────────────────────────────────────────
alter table zabelie_categories
  add column if not exists age_minimum smallint
  check (age_minimum is null or age_minimum between 1 and 99);

comment on column zabelie_categories.age_minimum is
  'Age minimum de l''acheteur pour toute fiche rangee dans ce rayon ou ses '
  'descendants (0115). Null = aucune restriction. Lu par zabelie_age_minimum() '
  'depuis /api/checkout (attestation exigee) et la fiche produit (mention 18+).';

-- ── 2. Le clairin : 18 ans — décision porteur du 2026-09-23 ─────────────────
update zabelie_categories
   set age_minimum = 18
 where slug = 'klerin'
   and age_minimum is null;

-- ── 3. L'âge d'une fiche, par l'ascendance ─────────────────────────────────
create or replace function zabelie_age_minimum(p_product uuid)
returns smallint
language sql
stable
set search_path = public
as $$
  with recursive remonte as (
    select c.id, c.parent_id, c.age_minimum
      from products p
      join zabelie_categories c on c.id = p.category_id
     where p.id = p_product
    union all
    select c.id, c.parent_id, c.age_minimum
      from zabelie_categories c
      join remonte r on r.parent_id = c.id
  )
  select coalesce(max(age_minimum), 0)::smallint from remonte;
$$;

comment on function zabelie_age_minimum(uuid) is
  'Age minimum exige pour acheter la fiche : le maximum de age_minimum le long '
  'de l''ascendance de son rayon (0115). 0 = aucune restriction, y compris pour '
  'une fiche sans sous-rayon ou inconnue.';

revoke all on function zabelie_age_minimum(uuid) from public, anon, authenticated;
grant execute on function zabelie_age_minimum(uuid) to service_role;

-- ── 4. Les attestations ─────────────────────────────────────────────────────
create table if not exists zabelie_order_age_attestations (
  order_id     uuid primary key references orders (id) on delete cascade,
  age_minimum  smallint not null check (age_minimum between 1 and 99),
  attested_at  timestamptz not null default now()
);

comment on table zabelie_order_age_attestations is
  'L''acheteur a declare avoir au moins age_minimum ans, pour cette commande, '
  'avant le paiement (0115). Ecrite par /api/checkout, non modifiable.';

alter table zabelie_order_age_attestations enable row level security;
revoke all on zabelie_order_age_attestations from public, anon, authenticated;
grant select, insert, delete on zabelie_order_age_attestations to service_role;

create or replace function zabelie_order_age_attestation_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Une attestation d''age ne se modifie pas' using errcode = '42501';
end $$;

revoke all on function zabelie_order_age_attestation_immutable() from public, anon, authenticated;

drop trigger if exists zabelie_order_age_attestation_immutable on zabelie_order_age_attestations;
create trigger zabelie_order_age_attestation_immutable
  before update on zabelie_order_age_attestations
  for each row execute function zabelie_order_age_attestation_immutable();

-- ── 5. La sonde de présence apprend les trois nouveaux objets ───────────────
-- RECOPIÉE MÉCANIQUEMENT depuis `0113` (script, assertions de compte sur
-- chaque ancre), jamais retapée : une transcription de mémoire échoue en
-- silence (leçon 0086). Trois lignes ajoutées : la fonction, la table, le
-- déclencheur.
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
    ('zabelie_order_age_attestations','les attestations d''age des acheteurs (0115)')
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
    ('zabelie_digital_studio_draft_guard','réserve la modification des leçons aux brouillons'),
    ('zabelie_order_age_attestation_immutable','interdit la reecriture d''une attestation d''age (0115)')
  ) v(objet,pourquoi);
$$;

-- ── Post-conditions ──────────────────────────────────────────────────────────
do $$
declare
  v_klerin_age  smallint;
  v_klerin_on   boolean;
  v_restreints  integer;
  v_sonde       integer;
begin
  select age_minimum, active into v_klerin_age, v_klerin_on
    from zabelie_categories where slug = 'klerin' and level = 3;
  if v_klerin_age is distinct from 18 then
    raise exception '0115 KO: klerin age_minimum = %, 18 attendu', v_klerin_age
      using errcode = 'ZB115';
  end if;
  -- Cette migration n'ouvre rien : c'est 0116 qui ouvrira, après le code.
  if v_klerin_on then
    raise exception '0115 KO: klerin est actif — son ouverture appartient a 0116, apres le deploiement du garde'
      using errcode = 'ZB115';
  end if;

  select count(*) into v_restreints from zabelie_categories where age_minimum is not null;
  if v_restreints <> 1 then
    raise exception '0115 KO: % rayon(s) restreint(s), 1 attendu (klerin)', v_restreints
      using errcode = 'ZB115';
  end if;

  if to_regprocedure('zabelie_age_minimum(uuid)') is null
     or to_regclass('public.zabelie_order_age_attestations') is null then
    raise exception '0115 KO: fonction ou table absente' using errcode = 'ZB115';
  end if;

  if has_function_privilege('anon', 'zabelie_age_minimum(uuid)', 'execute')
     or has_table_privilege('anon', 'zabelie_order_age_attestations', 'select')
     or has_table_privilege('authenticated', 'zabelie_order_age_attestations', 'select') then
    raise exception '0115 KO: un role public lit l''age ou les attestations' using errcode = 'ZB115';
  end if;

  select count(*) into v_sonde from zabelie_objets_requis()
   where objet in ('zabelie_age_minimum(uuid)', 'zabelie_order_age_attestations',
                   'zabelie_order_age_attestation_immutable')
     and present;
  if v_sonde <> 3 then
    raise exception '0115 KO: la sonde voit % objet(s) sur 3', v_sonde using errcode = 'ZB115';
  end if;

  raise notice '0115 OK: klerin = 18 ans et ferme, zabelie_age_minimum et attestations poses, sonde a jour';
end $$;
