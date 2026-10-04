select zabelie_migration_garde('0124_zabelie_relances_paiement.sql');

-- 0124 — Relance des paiements abandonnés (e-mail).
--
-- Instruction porteur du 2026-10-04 (« Vas-y »), après la comparaison avec
-- Maketou, qui relance les acheteurs. La commission ne bouge pas (10 %).
--
-- ─── LE CHEMIN EXISTE ─────────────────────────────────────────────────────
-- Mesuré en production le 2026-10-04 : 14 commandes `cancelled` dont le
-- paiement MonCash a échoué, venant de 3 acheteurs. Personne n'a été relancé.
--
-- ─── CE QUE LA RELANCE FAIT ───────────────────────────────────────────────
-- UN e-mail, jamais deux, par acheteur et par produit : « votre paiement n'a
-- pas abouti, le produit vous attend ». Il renvoie à la fiche : le prix est
-- celui de la base au moment du nouvel essai, jamais celui de l'e-mail.
--
-- ─── CE QU'ELLE NE FAIT PAS ───────────────────────────────────────────────
-- • Aucune relance sur un paiement d'ESSAI (`zabelie_payment_is_live`) : un
--   acheteur ne doit pas être renvoyé vers un paiement qui ne peut pas
--   encaisser.
-- • Aucune relance si l'acheteur a payé ce produit depuis, si le produit
--   n'est plus en vente, si l'acheteur est le vendeur, ni pour une recharge.
-- • Aucune relance à qui s'est désabonné : le lien de chaque e-mail coupe
--   les relances en un clic, sans connexion (jeton aléatoire, 122 bits).
-- • Aucune donnée ne quitte la base sans le service : tables fermées à
--   `anon` et `authenticated`, fonctions réservées au service, sauf le
--   désabonnement, gardé par son jeton.

-- Langue de l'acheteur au moment de l'achat : la relance lui parle dans la
-- même langue. `null` pour les commandes antérieures → kreyòl.
alter table orders add column zabelie_lang text
  check (zabelie_lang in ('fr', 'ht', 'en', 'es'));

-- Réglages : délais en table, jamais en dur.
create table zabelie_relance_config (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  -- Laisser à l'acheteur le temps de revenir seul avant de lui écrire.
  delai_min_heures integer not null default 2 check (delai_min_heures between 1 and 48),
  -- Au-delà, la relance arrive trop tard pour servir. Le cron étant
  -- quotidien, la fenêtre doit dépasser 24 h + le délai minimal.
  fenetre_max_heures integer not null default 50 check (fenetre_max_heures between 26 and 168),
  check (fenetre_max_heures > delai_min_heures + 24)
);
alter table zabelie_relance_config enable row level security;
revoke all on zabelie_relance_config from public, anon, authenticated;
grant all on zabelie_relance_config to service_role;
create policy zabelie_relance_config_server on zabelie_relance_config
  for all to service_role using (true) with check (true);
insert into zabelie_relance_config (id) values (true);

-- Préférence e-mail de l'acheteur et jeton de désabonnement.
create table zabelie_email_prefs (
  user_id uuid primary key references profiles (id) on delete cascade,
  relances boolean not null default true,
  jeton uuid not null unique default gen_random_uuid(),
  updated_at timestamptz not null default now()
);
alter table zabelie_email_prefs enable row level security;
revoke all on zabelie_email_prefs from public, anon, authenticated;
grant all on zabelie_email_prefs to service_role;
create policy zabelie_email_prefs_server on zabelie_email_prefs
  for all to service_role using (true) with check (true);

-- Une ligne par relance. L'unicité (acheteur, produit) est la garantie
-- « jamais deux » : la ligne est RÉSERVÉE avant l'envoi.
create table zabelie_relances_paiement (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references profiles (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  order_id uuid not null references orders (id) on delete cascade,
  statut text not null default 'reservee' check (statut in ('reservee', 'envoyee', 'echec')),
  created_at timestamptz not null default now(),
  envoyee_at timestamptz,
  unique (buyer_id, product_id)
);
alter table zabelie_relances_paiement enable row level security;
revoke all on zabelie_relances_paiement from public, anon, authenticated;
grant all on zabelie_relances_paiement to service_role;
create policy zabelie_relances_paiement_server on zabelie_relances_paiement
  for all to service_role using (true) with check (true);

-- Les relances dues : une ligne par (acheteur, produit), la commande la plus
-- récente. L'adresse e-mail vient de `auth.users`, lue ici seulement.
create function zabelie_relances_dues(p_limite integer default 50)
returns table (
  order_id uuid, buyer_id uuid, product_id uuid, email text, lang text,
  titre text, slug text, prix_htg bigint, jeton uuid
)
language sql stable security definer set search_path = public as $$
  with cfg as (select * from zabelie_relance_config where id),
  candidates as (
    select distinct on (o.buyer_id, o.product_id)
      o.id as order_id, o.buyer_id, o.product_id, o.zabelie_lang, o.created_at
    from orders o, cfg
    where cfg.enabled
      and o.zabelie_payment_is_live
      and o.status in ('pending', 'cancelled')
      and o.created_at >  now() - make_interval(hours => cfg.fenetre_max_heures)
      and not exists (select 1 from payments p where p.order_id = o.id and p.status = 'confirmed')
    order by o.buyer_id, o.product_id, o.created_at desc
  )
  select c.order_id, c.buyer_id, c.product_id, u.email::text,
         coalesce(c.zabelie_lang, 'ht'), pr.title, pr.slug, pr.price_htg, ep.jeton
  from candidates c
  cross join cfg
  join products pr on pr.id = c.product_id
  join auth.users u on u.id = c.buyer_id
  left join zabelie_email_prefs ep on ep.user_id = c.buyer_id
  where u.email is not null
    and pr.status = 'published' and pr.in_stock
    and pr.seller_id <> c.buyer_id
    and seller_is_active(pr.seller_id)
    and not zabelie_est_rechaj(pr.id)
    and coalesce(ep.relances, true)
    and not exists (select 1 from zabelie_relances_paiement r
                    where r.buyer_id = c.buyer_id and r.product_id = c.product_id)
    -- Délai minimal : aucune commande de ce produit, par cet acheteur, depuis
    -- moins de `delai_min_heures` — ni celle qu'on relance, ni un nouvel
    -- essai en cours. On ne lui écrit pas pendant qu'il paie.
    and not exists (select 1 from orders o3
                    where o3.buyer_id = c.buyer_id and o3.product_id = c.product_id
                      and o3.created_at > now() - make_interval(hours => cfg.delai_min_heures))
    and not exists (select 1 from orders o2
                    where o2.buyer_id = c.buyer_id and o2.product_id = c.product_id
                      and o2.status in ('paid', 'delivered', 'disputed', 'refunded'))
  order by c.created_at
  limit greatest(1, least(p_limite, 200));
$$;
revoke all on function zabelie_relances_dues(integer) from public, anon, authenticated;
grant execute on function zabelie_relances_dues(integer) to service_role;

-- Jeton de désabonnement de l'acheteur, créé au besoin.
create function zabelie_email_jeton(p_user uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  insert into zabelie_email_prefs (user_id) values (p_user) on conflict (user_id) do nothing;
  select jeton into v from zabelie_email_prefs where user_id = p_user;
  return v;
end $$;
revoke all on function zabelie_email_jeton(uuid) from public, anon, authenticated;
grant execute on function zabelie_email_jeton(uuid) to service_role;

-- Désabonnement en un clic. Seul geste ouvert à `anon` : il ne fait que
-- COUPER les relances de celui qui détient le jeton, et ne rend rien d'autre
-- qu'un booléen. Un jeton inconnu rend `false`, sans dire pourquoi.
create function zabelie_email_desabonner(p_jeton uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update zabelie_email_prefs set relances = false, updated_at = now() where jeton = p_jeton;
  return found;
end $$;
revoke all on function zabelie_email_desabonner(uuid) from public;
grant execute on function zabelie_email_desabonner(uuid) to anon, authenticated, service_role;

-- ── Sonde de présence : les fonctions de 0124 rejoignent la liste ──────────
-- Copie EXACTE de la définition de `0122` (appliquée, donc intouchable), plus
-- les trois fonctions des relances.
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
    ('zabelie_order_age_attestations','les attestations d''age des acheteurs (0115)'),
    ('zabelie_api_keys','les cles d''API vendeur (0121)'),
    ('zabelie_webhook_endpoints','les adresses webhook des vendeurs (0122)'),
    ('zabelie_webhook_deliveries','la file des envois webhook (0122)')
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
    ('zabelie_order_age_attestation_immutable','interdit la reecriture d''une attestation d''age (0115)'),
    ('zabelie_api_keys_garde','plafond et immuabilite des cles d''API (0121)'),
    ('zabelie_webhook_endpoints_garde','plafond et immuabilite des adresses webhook (0122)'),
    ('zabelie_webhook_enfiler_vente','enfile les webhooks a chaque vente payee ou remboursee (0122)')
  ) v(objet,pourquoi);
$$;
