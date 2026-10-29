select zabelie_migration_garde('0163_zabelie_handover_code.sql');

-- 0163 — Le CODE DE REMISE : l'acheteur confirme la réception en donnant un code
-- au vendeur, au moment où l'objet change de mains (docs/77 §12, lot C ; demande
-- directe du porteur du 2026-10-29).
--
-- ─── POURQUOI ──────────────────────────────────────────────────────────────
-- Zabelie ne livre pas : la plateforme n'OBSERVE jamais la remise, elle enregistre
-- ce que les deux parties déclarent (docs/21 §2). Deux risques en découlent, et le
-- code répond aux deux avec un seul geste :
--   • le CONTOURNEMENT — quand le vendeur remet lui-même, acheteur et vendeur
--     peuvent finir la vente par WhatsApp, hors du séquestre ;
--   • le SILENCE — l'acheteur qui ne confirme jamais est payé par le délai
--     (« le réglage par défaut est : le vendeur est payé », docs/21 §3 bis), au
--     lieu d'une confirmation explicite.
-- Le code est une CONFIRMATION EXPLICITE de l'acheteur, faite à la main : il le lit
-- sur son écran, le dit au vendeur devant l'objet, le vendeur le saisit. La preuve
-- de remise est enregistrée (`confirmed_at`), et un litige ultérieur a quelque chose
-- à examiner.
--
-- ─── CE QUE ÇA NE CHANGE PAS — et c'est le point qui compte ──────────────────
-- AUCUNE RÈGLE D'ARGENT NOUVELLE. Le code produit EXACTEMENT la même transition que
-- le bouton « J'ai reçu » de l'acheteur : il appelle `zabelie_mark_received` — le
-- chemin d'écriture UNIQUE qui libère l'escrow (docs/21 §3) —, avec l'identité de
-- l'acheteur. Le plancher anti-fraude est donc conservé : `matures_at` devient
-- `greatest(matures_at, now() + post_receipt_maturation_days)`, le J+7 posé au
-- paiement reste un plancher. Une réception confirmée au 2e jour ne paie pas le
-- vendeur au 2e jour. Le grand livre n'est pas touché ; l'identité de 0033 tient.
-- Cette migration ne contient ni `update` de solde, ni écriture d'escrow, ni
-- écriture de grand livre.
--
-- ─── LE CODE ───────────────────────────────────────────────────────────────
-- Six chiffres, tirés d'un aléa cryptographique (`gen_random_uuid`), créés à la
-- DEMANDE de l'acheteur (jamais à la commande : rien à changer dans le chemin de
-- paiement). Lisible par l'acheteur seul : la table n'a AUCUN droit client, la
-- lecture passe par une fonction qui vérifie que l'appelant est l'acheteur. Le
-- vendeur ne peut donc pas le lire — il doit le recevoir de la bouche de l'acheteur.
--   • 10^6 possibilités, `handover_code_max_attempts` essais (config, 5) : un
--     vendeur qui devine a 5 chances sur un million, puis le code se verrouille
--     (et l'acheteur garde sa confirmation dans l'application) ;
--   • un essai faux est enregistré même si l'appel « échoue » : les fonctions
--     RENDENT un refus au lieu de lever, donc l'incrément n'est jamais annulé ;
--   • une valeur qui n'a pas la forme de six chiffres n'use pas d'essai.
--
-- ─── CE QUE ÇA N'EST PAS ───────────────────────────────────────────────────
-- Pas une preuve de LIVRAISON : une preuve que l'acheteur a donné son code. Un
-- acheteur contraint de le donner avant d'avoir l'objet est un risque social, que
-- l'écran dit (« ne le donnez qu'une fois l'objet en main »). Une collusion
-- acheteur-vendeur fabriquant une fausse vente n'est pas traitée ici, et le
-- plancher J+7 est ce qui la borne. Aucune donnée personnelle : un code à six
-- chiffres lié à une commande.
--
-- ─── POINT D'ATTENTION, hérité de 0043 (non modifié ici) ───────────────────
-- Un avis `reminder_buyer` déjà programmé peut partir après une réception — c'est
-- déjà vrai du bouton « J'ai reçu ». Le code n'aggrave rien ; la lacune est à
-- traiter à part.
--
-- Aucun `drop`. `security definer` sur deux fonctions, TOUTES retirées à `public`,
-- `anon` et `authenticated` : appelées uniquement par le service-role, depuis des
-- routes qui lisent l'identité dans la SESSION, jamais dans le corps de requête.

begin;

-- ── 1. Le paramètre commercial, en config (jamais en dur) ───────────────────
insert into zabelie_fulfillment_limits (key, value, comment) values
  ('handover_code_max_attempts', 5,
   'Essais faux avant verrouillage du code de remise d''une commande (0163). 6 chiffres = 10^6 possibilites : 5 essais donnent a qui devine 5 chances sur un million. Passe ce nombre le code est verrouille ; l''acheteur garde sa confirmation « J''ai recu » dans l''application.')
on conflict (key) do nothing;  -- config d'exploitation : jamais réécrite au rejeu

-- ── 2. Le code : une ligne par commande, AUCUN droit client ─────────────────
create table zabelie_handover_codes (
  order_id     uuid primary key references orders (id) on delete cascade,
  code         text not null check (code ~ '^[0-9]{6}$'),
  attempts     integer not null default 0 check (attempts >= 0),
  confirmed_at timestamptz,
  created_at   timestamptz not null default now()
);
comment on table zabelie_handover_codes is
  'Code de remise a six chiffres d''une commande physique (0163) : l''acheteur le donne au vendeur devant l''objet. Aucun droit client : lisible par l''acheteur seul, par fonction. Ne libere aucun fonds a lui seul : il produit la meme transition que le bouton « J''ai recu » (zabelie_mark_received).';

alter table zabelie_handover_codes enable row level security;
revoke all on zabelie_handover_codes from public, anon, authenticated;
grant all on zabelie_handover_codes to service_role;

-- ── 3. L'acheteur lit SON code (le crée à la première demande) ──────────────
create function zabelie_handover_code_get(p_order_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_buyer  uuid;
  v_status fulfillment_status;
  v_code   text;
begin
  select o.buyer_id into v_buyer from orders o where o.id = p_order_id;
  if v_buyer is null then
    return jsonb_build_object('ok', false, 'reason', 'commande_introuvable');
  end if;
  if p_user_id is distinct from v_buyer then
    return jsonb_build_object('ok', false, 'reason', 'non_autorise');
  end if;

  select status into v_status from zabelie_fulfillment
   where order_id = p_order_id for update;
  if v_status is null then
    return jsonb_build_object('ok', false, 'reason', 'suivi_absent');
  end if;
  -- Le code ne sert qu'avant la réception. Après, ou en litige, la remise sort de
  -- ce mécanisme (docs/21 §4 bis) : pas de code pour une commande qui ne peut plus
  -- se clore par lui.
  if v_status not in ('awaiting_shipment', 'shipped') then
    return jsonb_build_object('ok', false, 'reason', 'etat_incompatible', 'status', v_status::text);
  end if;

  select code into v_code from zabelie_handover_codes where order_id = p_order_id;
  if v_code is null then
    -- Six chiffres d'un aléa cryptographique (gen_random_uuid tire de pg_strong_random) ;
    -- le biais du modulo (2^32 mod 10^6) est négligeable pour un code à usage unique.
    v_code := lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint) % 1000000)::text, 6, '0');
    insert into zabelie_handover_codes (order_id, code) values (p_order_id, v_code);
  end if;
  return jsonb_build_object('ok', true, 'code', v_code);
end;
$$;
revoke all on function zabelie_handover_code_get(uuid, uuid) from public, anon, authenticated;
comment on function zabelie_handover_code_get(uuid, uuid) is
  'L''acheteur lit son code de remise, cree a la premiere demande (0163). Verifie que p_user_id est l''acheteur. Service-role seulement.';

-- ── 4. Le vendeur saisit le code devant l'objet ─────────────────────────────
create function zabelie_handover_confirm(p_order_id uuid, p_seller_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_seller uuid;
  v_buyer  uuid;
  v_status fulfillment_status;
  v_row    zabelie_handover_codes;
  v_max    integer;
  v_res    jsonb;
begin
  select p.seller_id, o.buyer_id into v_seller, v_buyer
    from orders o join products p on p.id = o.product_id
   where o.id = p_order_id;
  if v_seller is null then
    return jsonb_build_object('ok', false, 'reason', 'commande_introuvable');
  end if;
  if p_seller_id is distinct from v_seller then
    return jsonb_build_object('ok', false, 'reason', 'non_autorise');
  end if;

  select status into v_status from zabelie_fulfillment
   where order_id = p_order_id for update;
  if v_status is null then
    return jsonb_build_object('ok', false, 'reason', 'suivi_absent');
  end if;
  if v_status = 'received' then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  if v_status not in ('awaiting_shipment', 'shipped') then
    return jsonb_build_object('ok', false, 'reason', 'etat_incompatible', 'status', v_status::text);
  end if;

  -- La forme d'abord : une valeur qui n'est pas six chiffres n'use pas d'essai.
  if p_code is null or p_code !~ '^[0-9]{6}$' then
    return jsonb_build_object('ok', false, 'reason', 'code_invalide');
  end if;

  select * into v_row from zabelie_handover_codes where order_id = p_order_id for update;
  if not found then
    -- L'acheteur n'a jamais affiché son code : rien à comparer, rien à user.
    return jsonb_build_object('ok', false, 'reason', 'code_absent');
  end if;

  select coalesce(max(value), 5) into v_max
    from zabelie_fulfillment_limits where key = 'handover_code_max_attempts';
  if v_row.attempts >= v_max then
    return jsonb_build_object('ok', false, 'reason', 'verrouille');
  end if;

  if p_code <> v_row.code then
    -- Rendu, pas levé : une exception annulerait l'incrément et rendrait l'essai gratuit.
    update zabelie_handover_codes set attempts = attempts + 1 where order_id = p_order_id;
    return jsonb_build_object('ok', false, 'reason', 'code_incorrect',
                              'restantes', greatest(v_max - (v_row.attempts + 1), 0));
  end if;

  -- Le bon code. Une remise en main propre peut n'avoir jamais été déclarée : le code
  -- vaut déclaration (le vendeur est là, l'acheteur aussi). Aucun avis n'est créé :
  -- l'acheteur est celui qui vient de donner son code, il sait.
  if v_status = 'awaiting_shipment' then
    update zabelie_fulfillment
       set status = 'shipped', shipped_at = now(),
           shipment_note = coalesce(shipment_note, 'Remise en main propre, confirmee par le code de remise'),
           updated_at = now()
     where order_id = p_order_id;
  end if;

  -- LE chemin d'écriture unique de la réception : identité de l'ACHETEUR, jamais
  -- `p_auto`. Il porte le plancher anti-fraude et le déverrouillage de l'escrow.
  v_res := zabelie_mark_received(p_order_id, v_buyer, false);
  if not coalesce((v_res ->> 'ok')::boolean, false) then
    -- Ne doit jamais arriver (état vérifié ci-dessus) ; si cela arrive, on annule TOUT
    -- plutôt que de laisser une commande `shipped` sans réception.
    raise exception '0163 : la reception a ete refusee apres un code valide (%)', v_res ->> 'reason'
      using errcode = 'ZB163';
  end if;

  update zabelie_handover_codes set confirmed_at = now() where order_id = p_order_id;
  return jsonb_build_object('ok', true, 'duplicate', false);
end;
$$;
revoke all on function zabelie_handover_confirm(uuid, uuid, text) from public, anon, authenticated;
comment on function zabelie_handover_confirm(uuid, uuid, text) is
  'Le vendeur saisit le code de remise de l''acheteur (0163). Un bon code produit la meme transition que « J''ai recu » (zabelie_mark_received) : aucune regle d''argent nouvelle, plancher anti-fraude conserve. Un mauvais code use un essai (rendu, jamais leve). Service-role seulement.';

-- ── La sonde de présence (0156, 0162) reconnaît les deux fonctions ──────────
-- Tout `.rpc()` du code doit être surveillé par `zabelie_objets_requis()`
-- (tests/objets-requis-couverture.test.ts). Redéfinie en ENTIER — forme de 0085 à
-- 0162 —, avec deux lignes de plus. La définition déployée en production a été
-- comparée à celle de 0162 avant l'application.
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
      ('zabelie_boutik_visite(uuid)', 'sans elle, les visites des vitrines ne se comptent plus et le vendeur lit zero (0155)'),
      ('zabelie_vendeur_signaux()', 'sans elle, la page Mes clients perd ses signaux de demande (0156)'),
      -- ── Le chemin de l'argent. Absente = l'argent entre et rien ne bouge ──
      ('zabelie_claim_pending_payments(payment_rail)', 'la rotation des paiements en attente'),
      ('zabelie_order_participant(uuid)', 'la verification de propriete des dossiers'),
      ('zabelie_avis_produit(uuid,integer)', 'sans elle, les fiches produit n''affichent plus aucun avis (0137) : la lecture directe des auteurs est fermee'),
      ('zabelie_identites_verifiees(uuid[])', 'sans elle, aucun badge Identite verifiee ne s''affiche (0138) : silencieux, la page reste correcte'),
      ('zabelie_repondre_avis(uuid,text)', 'sans elle, un vendeur ne peut plus repondre a un avis (0139) : la route rend une erreur'),
      ('zabelie_authoring_creer_projet(text,text,text,text)', 'sans elle, aucun vendeur ne cree de projet dans le Studio de creation (0141) : la route rend une erreur'),
      ('zabelie_authoring_approuver_plan(uuid,integer)', 'sans elle, aucun plan de guide ne s''approuve (0141) : la redaction reste bloquee'),
      ('zabelie_authoring_archiver(uuid)', 'sans elle, un projet du Studio ne s''archive plus (0141) : le plafond de projets actifs devient un mur'),
      ('zabelie_authoring_demander(uuid,text,uuid,uuid)', 'sans elle, aucune suggestion ne peut etre demandee (0142) : quotas et idempotence ne sont plus tenus'),
      ('zabelie_authoring_annuler(uuid)', 'sans elle, une demande en attente ne s''annule plus (0142)'),
      ('zabelie_authoring_quota()', 'sans elle, le compteur de suggestions restantes ne s''affiche plus (0142)'),
      ('zabelie_authoring_prendre_bail(uuid,uuid)', 'sans elle, aucune suggestion n''est traitee (0142) : les demandes restent en attente'),
      ('zabelie_authoring_marquer_soumis(uuid,uuid,text)', 'sans elle, rien ne part vers le fournisseur (0142) : la verification avant envoi est le seul passage'),
      ('zabelie_authoring_conclure(uuid,uuid,text,jsonb,text,integer,integer)', 'sans elle, aucun resultat n''est enregistre (0142) : les operations restent en cours puis deviennent incertaines'),
      ('zabelie_authoring_opportunites()', 'sans elle, le tableau du Studio n''affiche plus aucune opportunite (0143) : silencieux, l''etat vide s''affiche'),
      ('zabelie_authoring_approuver_revision(uuid,integer,boolean)', 'sans elle, aucun guide ne s''approuve avant export (0146) : l''export reste ferme'),
      ('zabelie_authoring_enregistrer_export(uuid,uuid,integer,text,text,integer,integer,text,integer,integer)', 'sans elle, aucun PDF du Studio n''est enregistre (0147) : la route rend une erreur, le fichier depose reste sans ligne'),
      ('zabelie_authoring_approuver_export(uuid,text)', 'sans elle, aucun PDF du Studio ne s''approuve (0147) : rien ne peut partir vers une fiche produit'),
      ('zabelie_authoring_supprimer_projet(uuid,boolean)', 'sans elle, un projet archive du Studio ne se supprime plus (0149) : la route rend une erreur'),
      ('zabelie_authoring_purge_candidats(integer)', 'sans elle, les projets des comptes fermes ne sont plus reperes (0149) : guides et PDF restent apres la fermeture'),
      ('zabelie_authoring_purge_comptes_fermes(uuid[])', 'sans elle, les projets des comptes fermes ne sont plus supprimes (0149) : les PDF sont retires mais les lignes restent'),
      -- ── Essayage virtuel (0150) : appelées par lib/essayage/base.ts ──
      ('zabelie_essayage_eligible(uuid,uuid)', 'sans elle, aucune fiche ne propose l''essayage (0150) : le bouton disparait, rien ne casse'),
      ('zabelie_essayage_reserver(uuid,uuid,text)', 'sans elle, aucun essai ne demarre (0150) : la route rend une erreur, rien n''est facture'),
      ('zabelie_essayage_lancer(uuid,text)', 'sans elle, un essai cree chez le fournisseur n''est plus suivi (0150) : il echoue au bout de 60 s, deja facture'),
      ('zabelie_essayage_terminer(uuid,text,text)', 'sans elle, un essai ne se clot plus (0150) : les echecs comptent dans le quota et le plafond'),
      ('zabelie_essayage_exposer(uuid,uuid,text)', 'sans elle, la mesure du pilote perd ses expositions (0150) : resultats faux, silencieux'),
      ('zabelie_essayage_compteur()', 'sans elle, l''administration ne voit plus le compteur du mois (0150) : le panneau rend une erreur, l''essayage continue'),
      ('zabelie_submit_support(uuid,uuid,uuid,text,text,text)', 'les demandes et reponses du support'),
      ('zabelie_accept_account_legal(text,text,boolean,boolean)', 'enregistre les deux déclarations explicites de la première session OAuth (0133)'),
      ('zabelie_record_refund_receipt(uuid,uuid,text,text,timestamp with time zone)', 'sans elle, le retour effectif des fonds ne peut plus etre documente'),
      ('zabelie_operations_queue(integer,integer)', 'sans elle, les commandes bloquees disparaissent du suivi administrateur'),
      ('zabelie_market_metrics(integer)', 'sans elle, les ventes reelles par zone et categorie ne sont plus mesurables'),
      ('zabelie_record_stripe_dispute(text,text,text,text,text,text,bigint,text,boolean)', 'signed Stripe dispute receipts and dormant pre-maturation hold (0151)'),
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
      -- ── Code de remise (0163) ────────────────────────────────────────────
      ('zabelie_handover_code_get(uuid,uuid)',
       'l''acheteur lit son code de remise : absente, le bouton « code de remise » échoue en 503 ; la confirmation « J''ai reçu » reste possible'),
      ('zabelie_handover_confirm(uuid,uuid,text)',
       'le vendeur saisit le code : absente, la remise en main propre ne se confirme plus par code ; la confirmation de l''acheteur et le délai restent possibles'),

      -- ── Demande par zone (0162) ──────────────────────────────────────────
      ('zabelie_record_zone_demand(uuid)',
       'le compteur « je cherche un vendeur ici » : absente, le clic de l''acheteur échoue en 503 et la demande par zone ne remonte plus — sans qu''aucun paiement ne soit touché'),

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
    ('zabelie_webhook_enfiler_vente','enfile les webhooks a chaque vente payee ou remboursee (0122)'),
    ('zabelie_products_projet_garde','un produit ne se rattache qu''au projet de son propre vendeur, et ce lien ne change plus (0148)')
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
  select 'payments.zabelie_original_method', exists(select 1 from pg_attribute where attrelid='public.payments'::regclass and attname='zabelie_original_method' and not attisdropped), 'conserve le moyen d’origine sans payload personnel (0132)'
  union all
  select 'zabelie_stripe_dispute_event_immutable()',to_regprocedure('public.zabelie_stripe_dispute_event_immutable()') is not null,'immutable Stripe receipts (0151)'
  union all
  select 'zabelie_stripe_dispute_events',to_regclass('public.zabelie_stripe_dispute_events') is not null,'durable Stripe receipt journal (0151)'
  union all
  select 'zabelie_stripe_dispute_event_immutable',exists(select 1 from pg_trigger where tgname='zabelie_stripe_dispute_event_immutable' and not tgisinternal and tgenabled<>'D'),'append-only Stripe receipt guard (0151)'
  union all
  select 'zabelie_stripe_dispute_event_no_truncate',exists(select 1 from pg_trigger where tgname='zabelie_stripe_dispute_event_no_truncate' and not tgisinternal and tgenabled<>'D'),'Stripe receipt truncate guard (0151)'
  union all
  select 'escrow_entries.dispute_frozen_at',exists(select 1 from pg_attribute where attrelid='public.escrow_entries'::regclass and attname='dispute_frozen_at' and not attisdropped),'independent escrow dispute hold (0151)'
  union all
  select 'zabelie_operations_config.stripe_dispute_freeze_enabled',exists(select 1 from pg_attribute where attrelid='public.zabelie_operations_config'::regclass and attname='stripe_dispute_freeze_enabled' and not attisdropped),'dormant dispute hold gate (0151)'
  union all
  select 'products.zabelie_authoring_project_id', exists(select 1 from pg_attribute where attrelid='public.products'::regclass and attname='zabelie_authoring_project_id' and not attisdropped), 'sans elle, « Soumettre a la revue » ne rattache aucun guide du Studio a sa fiche (0148) : la route rend une erreur'
  union all
  select v.objet, to_regprocedure('public.' || v.objet) is not null, v.pourquoi
  from (values
    ('zabelie_product_cover_review_guard()', 'sans ce garde, une couverture approuvee peut changer sans retour en revue (0152)'),
    ('zabelie_product_media_guard()', 'sans ce garde, photos et videos approuvees changent sans retour en revue (0152)')
  ) v(objet,pourquoi)
  union all
  select 'zabelie_product_cover_review', exists(
    select 1 from pg_trigger g where g.tgrelid = 'public.products'::regclass
      and g.tgname = 'zabelie_product_cover_review' and not g.tgisinternal
      and g.tgenabled in ('O', 'A') and g.tgtype = 19
      and g.tgfoid = to_regprocedure('public.zabelie_product_cover_review_guard()')
      and g.tgattr::text = (select attnum::text from pg_attribute
        where attrelid = 'public.products'::regclass and attname = 'cover_url' and not attisdropped)),
    'sans le trigger actif sur cover_url, une couverture change sans nouvelle revue (0152)'
  union all
  select 'zabelie_product_media_guard_trg', exists(
    select 1 from pg_trigger g where g.tgrelid = 'public.zabelie_product_media'::regclass
      and g.tgname = 'zabelie_product_media_guard_trg' and not g.tgisinternal
      and g.tgenabled in ('O', 'A') and g.tgtype = 31
      and g.tgfoid = to_regprocedure('public.zabelie_product_media_guard()')),
    'sans le trigger INSERT UPDATE DELETE actif, la galerie peut contourner la revue (0152)';
$$;

-- ── Post-conditions ─────────────────────────────────────────────────────────
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'zabelie_handover_codes'::regclass) then
    raise exception '0163 KO: RLS inactive sur zabelie_handover_codes';
  end if;
  if has_table_privilege('anon', 'zabelie_handover_codes', 'select')
     or has_table_privilege('authenticated', 'zabelie_handover_codes', 'select')
     or has_table_privilege('authenticated', 'zabelie_handover_codes', 'insert')
     or has_table_privilege('authenticated', 'zabelie_handover_codes', 'update')
     or has_table_privilege('authenticated', 'zabelie_handover_codes', 'delete') then
    raise exception '0163 KO: aucun acces client a la table des codes';
  end if;
  if has_function_privilege('anon', 'zabelie_handover_code_get(uuid,uuid)', 'execute')
     or has_function_privilege('authenticated', 'zabelie_handover_code_get(uuid,uuid)', 'execute')
     or has_function_privilege('public', 'zabelie_handover_code_get(uuid,uuid)', 'execute')
     or has_function_privilege('anon', 'zabelie_handover_confirm(uuid,uuid,text)', 'execute')
     or has_function_privilege('authenticated', 'zabelie_handover_confirm(uuid,uuid,text)', 'execute')
     or has_function_privilege('public', 'zabelie_handover_confirm(uuid,uuid,text)', 'execute') then
    raise exception '0163 KO: les fonctions security definer ne doivent pas etre exposees';
  end if;
  if not exists (select 1 from zabelie_fulfillment_limits where key = 'handover_code_max_attempts') then
    raise exception '0163 KO: le plafond d''essais n''est pas en config';
  end if;
  if (select count(*) from public.zabelie_objets_requis()
       where objet in ('zabelie_handover_code_get(uuid,uuid)', 'zabelie_handover_confirm(uuid,uuid,text)') and present) <> 2 then
    raise exception '0163 KO: la sonde ne voit pas les deux fonctions';
  end if;
  raise notice '0163 OK — code de remise pose';
end $$;

commit;
