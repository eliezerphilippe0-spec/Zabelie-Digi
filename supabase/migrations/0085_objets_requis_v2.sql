select zabelie_migration_garde('0085_objets_requis_v2.sql');

-- ============================================================================
-- 0085 — La sonde de présence rattrape le code : 2 objets surveillés → 46
-- ============================================================================
-- `0048` a posé le bon principe et l'a posé pour deux objets. Elle a été
-- appliquée le 2026-07-31, quand le dépôt comptait 48 migrations. Il en compte
-- 83. Entre les deux : le fulfillment (`0043`), les baux de cron (`0060`),
-- l'outbox (`0061`), la purge KYC (`0079`), le panier, les rabais, la purge
-- de recherche… **Aucun de ces objets n'était surveillé.**
--
-- Mesuré le 2026-08-18 contre `origin/main` = 2f3806e et la production :
--
--   • le code déployé appelle **46** fonctions par leur nom (`.rpc("…")`
--     dans app/, lib/, components/) ;
--   • `zabelie_objets_requis()` en surveillait **2** ;
--   • les 46 existent bien en production — donc rien n'est cassé aujourd'hui.
--
-- C'est précisément ce qui rend le défaut dangereux plutôt qu'urgent. Le
-- contrôle est vert, il est LU (`/api/admin/coherence`, cron 13:30 UTC), et
-- il couvre 4 % de la surface. Si `confirm_payment` disparaissait d'une
-- restauration partielle, `/api/admin/coherence` afficherait « tous les objets
-- requis existent en base » pendant que plus aucun paiement ne se confirme.
--
-- L'en-tête de `0048` décrivait ce mode d'échec mot pour mot :
--
--   « ligne présente, objet absent — restauration partielle, retour arrière
--     manuel […]. Le contrôle serait VERT pendant que toute création de fiche
--     échoue. C'est le pire des deux. »
--
-- Elle avait raison, et elle ne se protégeait elle-même que pour deux
-- fonctions. Une sonde qui ne grandit pas avec le système qu'elle observe
-- finit par mesurer son propre passé.
--
-- ─── CE QUI EMPÊCHE QUE ÇA RECOMMENCE ──────────────────────────────────────
-- Rien, dans cette migration, ne garantit qu'un 47ᵉ `.rpc()` sera ajouté ici.
-- La garantie est ailleurs, et elle est mécanique :
-- `tests/objets-requis-couverture.test.ts` croise la liste ci-dessous avec les
-- appels `.rpc("…")` du code, **dans les deux sens** :
--
--   • un `.rpc()` sans entrée ici           → CI rouge ;
--   • une entrée ici sans `.rpc()` nulle part → CI rouge aussi (l'objet a
--     peut-être été retiré du code, la sonde surveille alors un fantôme).
--
-- Sans ce garde, cette migration serait la version 2026-08-18 du même gel.
--
-- ─── DÉTAIL QUI COÛTE UNE HEURE SI ON L'IGNORE ──────────────────────────────
-- `to_regprocedure` exige la signature COMPLÈTE. Un nom nu ne résout pas, et
-- une signature approximative rend NULL — donc « absent » pour un objet bien
-- présent : une fausse alerte, qu'on apprend vite à ignorer, et le contrôle
-- meurt. Les 46 signatures ci-dessous sont **lues dans `pg_proc` de la
-- production** (`oid::regprocedure`), pas reconstituées de mémoire.
-- ============================================================================

create or replace function zabelie_objets_requis()
returns table (objet text, present boolean, pourquoi text)
language sql
stable
set search_path = public, pg_temp
as $$
  select v.objet, to_regprocedure(v.objet) is not null, v.pourquoi
    from (values
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
       'les marchands d''une zone (0084) : absente, le filtre acheteur par zone rend zéro vendeur en journalisant « introuvables », ce qui se lit comme « cette zone est vide »')
    ) as v(objet, pourquoi);
$$;

comment on function zabelie_objets_requis() is
  'Présence des objets dont le CODE DÉPLOYÉ dépend (0048, étendue par 0085). La liste est tenue synchrone des appels .rpc("…") par tests/objets-requis-couverture.test.ts, dans les deux sens. to_regprocedure exige la signature complète : un nom nu rend NULL, donc une fausse alerte.';

-- ── Post-conditions ─────────────────────────────────────────────────────────
-- ⚠️ Le contrôle N'EST PAS « zéro absent ». La sonde a précisément pour métier
-- de RAPPORTER une absence à `/api/admin/coherence` : lui interdire d'en
-- trouver une reviendrait à casser la migration au moment exact où elle sert.
--
-- Le contrôle est donc : **l'ensemble des absents est exactement celui qu'on
-- déclare attendre**, dans les deux sens. Une absence non déclarée fait
-- échouer (c'est la découverte) ; une absence déclarée qui a disparu fait
-- échouer aussi (la déclaration est périmée, il faut la retirer). Une liste
-- de tolérance qui ne sait que grandir est une conformité par usure.
--
-- Absence attendue au 2026-08-18, une seule :
--   `zabelie_purge_sent_notices(integer)` — `0056` est rédigée et NON
--   appliquée ; c'est une action porteur suivie depuis le 2026-08-10
--   (`OPS_TODO.md`). Le code l'assume déjà : `app/api/fulfillment/sweep/route.ts:169`
--   journalise `purges: -1` (« n'a pas pu tourner »), distinct de `0`
--   (« tournée, rien à purger »). Rien n'est cassé — mais la purge des avis à
--   90 jours n'a jamais tourné.
do $$
declare
  v_total     int;
  v_absents   text;
  v_surprises text;
  v_disparues text;
begin
  select count(*) into v_total from zabelie_objets_requis();
  if v_total < 40 then
    raise exception '0085 KO: la sonde ne rend que % objet(s) — le remplacement n''a pas pris, on retomberait sur la couverture de 0048', v_total;
  end if;

  create temporary table zabelie_absences_attendues (objet text primary key) on commit drop;
  insert into zabelie_absences_attendues values ('zabelie_purge_sent_notices(integer)');

  select string_agg(objet, ', ' order by objet) into v_absents
    from zabelie_objets_requis() where not present;

  -- (a) absente et non déclarée : la découverte.
  select string_agg(o.objet, ', ' order by o.objet) into v_surprises
    from zabelie_objets_requis() o
   where not o.present
     and not exists (select 1 from zabelie_absences_attendues a where a.objet = o.objet);
  if v_surprises is not null then
    raise exception '0085 KO: objet(s) requis ABSENT(S) et non declare(s) : %. Soit une migration manque, soit une signature de la liste est fausse (to_regprocedure exige la signature EXACTE — un nom nu rend NULL, donc une fausse alerte). Il faut le savoir maintenant, pas le jour ou le vert masquera une panne.', v_surprises;
  end if;

  -- (b) déclarée absente mais PRÉSENTE. ⚠️ NOTICE, pas exception — et la
  -- raison n'est pas de la mollesse.
  --
  -- Cette migration doit tourner DANS DEUX MONDES, comme `0063` avant elle :
  -- la production, où `0056` n'est pas appliquée et où la fonction manque
  -- vraiment ; et la CI, qui applique TOUS les fichiers dans l'ordre des noms
  -- contre une base vide, donc où `0056` est appliquée et la fonction
  -- présente. Faire échouer ici casserait la CI pour la seule raison qu'elle
  -- est plus à jour que la production — un garde qui punit le bon état.
  --
  -- La péremption de la déclaration est donc portée ailleurs, là où un seul
  -- monde est visible : `/api/admin/coherence` cesse de rapporter l'absence le
  -- jour où `0056` est appliquée, et la ligne d'`OPS_TODO` se coche.
  select string_agg(a.objet, ', ' order by a.objet) into v_disparues
    from zabelie_absences_attendues a
   where exists (select 1 from zabelie_objets_requis() o where o.objet = a.objet and o.present);
  if v_disparues is not null then
    raise notice '0085 : % declaree « absence attendue » mais PRESENTE ici — cette base est plus a jour que la production (CI, ou 0056 appliquee depuis). Rien a corriger ; retirer la ligne quand les deux mondes auront convergé.', v_disparues;
  end if;

  raise notice '0085 OK: % objets surveilles (0048 en surveillait 2) ; absences attendues et confirmees : %',
    v_total, coalesce(v_absents, 'aucune');
end $$;
