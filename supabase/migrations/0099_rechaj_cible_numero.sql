select zabelie_migration_garde('0099_rechaj_cible_numero.sql');

-- ============================================================================
-- 0099 — LE NUMÉRO À RECHARGER : le maillon qui manquait au rayon « Recharge »
-- ============================================================================
-- `0098` a ouvert les trois rayons de recharge et donné un sous-rayon à tout
-- produit. Mesuré APRÈS, en parcourant le chemin de bout en bout plutôt qu'en
-- le raisonnant : un acheteur pouvait payer une recharge **sans jamais dire
-- quel numéro recharger**. `POST /api/checkout` prend `{ productId, rail }` ;
-- `zabelie_delivery_info` (0076) porte l'adresse de l'ACHETEUR pour un colis ;
-- `zabelie_fulfillment.shipment_note` est ce que le VENDEUR déclare après coup.
-- Aucun des trois n'est un canal pour la donnée sans laquelle une recharge
-- n'existe pas.
--
-- Le vendeur aurait donc reçu une commande PAYÉE et INDÉLIVRABLE. C'est le pire
-- cas du dépôt : de l'argent encaissé sur une promesse qu'on ne peut pas tenir.
--
-- ─── CE QUE FONT LES AUTRES, ET CE QU'ON EN GARDE ───────────────────────────
-- Relevé du 2026-09-06 (Ding, Recharge.com, BOSS Revolution, Hablax,
-- SalutHaiti) : trois champs, toujours dans le même ordre — opérateur, numéro
-- du destinataire, montant — puis une CONFIRMATION du numéro avant paiement,
-- parce qu'un chiffre faux est irrécupérable.
--
-- Sur Zabelie deux des trois champs existent déjà sans être des champs :
-- l'opérateur EST le sous-rayon (`rechaj-digicel` / `rechaj-natcom`), le
-- montant EST le prix de la fiche — un vendeur publie ses coupures comme autant
-- de produits, ce qui est le modèle à coupures fixes de l'industrie, obtenu
-- sans rien coder. Il ne manquait que le numéro. Cette migration ne pose donc
-- QU'UNE table, et c'est délibéré.
--
-- ⚠️ RELEVÉ TIRÉ DE RÉSUMÉS DE RECHERCHE — aucune page ouverte : le proxy de
-- sortie a refusé les quatre domaines et le service de scraping était hors clé.
-- Même limite que `docs/45`. Rien de ce qui est ci-dessus n'est une mesure ;
-- c'est pourquoi RIEN ici ne dépend d'un préfixe d'opérateur. La borne posée en
-- base est celle sur laquelle les sources s'accordent : huit chiffres, mobile.
--
-- ─── POURQUOI UNE TABLE ET PAS DEUX COLONNES SUR `orders` ───────────────────
-- `orders` est une table d'ARGENT, lisible du vendeur dès la commande créée.
-- Un numéro de téléphone y serait visible avant paiement, c'est-à-dire avant
-- que quiconque ait le droit de l'avoir. La règle du dépôt est déjà écrite, et
-- c'est celle de `0076` : la donnée personnelle vit à part, et le « moment d'en
-- avoir besoin » est encodé DANS la policy, pas dans une bonne intention.
-- ============================================================================

-- ── 0. Registre : 0098 ───────────────────────────────────────────────────────
-- `sha256` = empreinte CANONIQUE (`scripts/zabelie-migration-hash.mjs`). La
-- `note` porte le croisement brut (méthode 0086) relevé après application.
insert into zabelie_schema_migrations
  (filename, sha256, applied_at, applied_by, statut, preuve, note)
values
  ('0098_sous_rayon_tout_produit_rechaj_ouvert.sql',
   '595fba04e9d5b131bded6a7be6c1a05e031f0b6064194b89104d91d381c9b1d7',
   '2026-09-06 17:47:06+00',
   'porteur — « rajoute la section, en cas d''interdit je vais l''enlever » du 2026-09-05 (autorisation permanente du 2026-08-17), appliquee par agent via MCP apres fusion de la PR #217 par le porteur lui-meme (dfecad9)',
   'appliquee', 'journal_supabase',
   'products.category_id (FK restrictive vers zabelie_categories + index), '
   'backfill depuis l''extension physique, ouverture des trois rayons de '
   'recharge. Mesure apres : colonne presente, FK presente, index pose, '
   '3/3 rayons actifs, 1 physique sur 1 recopie, registre 0097 conforme, '
   '97 lignes pour 98 fichiers (l''ecart d''une ligne est la convention). '
   'Empreinte croisee (methode 0086) : SHA-256 BRUT du fichier de main sans '
   'saut de ligne final = statements[1] du journal (version 20260906174706) = '
   '58a87abf8e48f0a29f737938d73088f7b20d15919eb89ebf189dd47a74803e62.')
on conflict (filename) do nothing;

-- ── 1. La cible ──────────────────────────────────────────────────────────────
create table zabelie_rechaj_cible (
  order_id   uuid primary key references orders (id) on delete cascade,
  -- Huit chiffres, mobile (3 ou 4). Le fixe (2) est refusé : recharger un fixe
  -- n'a pas de sens, et c'est la faute de frappe la plus banale — un numéro de
  -- maison saisi à la place d'un portable. La contrainte est ici ET dans
  -- `lib/rechaj.ts` : la seconde donne un message, la première rend l'erreur
  -- impossible même si une route future oublie de valider.
  msisdn     text not null check (msisdn ~ '^[34][0-9]{7}$'),
  created_at timestamptz not null default now()
);

comment on table zabelie_rechaj_cible is
  'Numero a recharger, fourni par l''ACHETEUR au checkout (0099). Table separee '
  'd''orders exactement comme zabelie_delivery_info (0076) : le vendeur ne le lit '
  'qu''une fois la commande PAYEE, et la policy le dit. Aucune ecriture directe : '
  'la route de checkout ecrit en service-role, comme pour zabelie_fulfillment.';

comment on column zabelie_rechaj_cible.msisdn is
  'Huit chiffres, sans indicatif, mobile haitien (prefixe 3 ou 4). Normalise '
  'par lib/rechaj.ts avant insertion. AUCUNE attribution d''operateur n''est '
  'stockee : elle serait derivee du sous-rayon de la fiche, donc une seconde '
  'source de verite qui peut deriver de la premiere.';

alter table zabelie_rechaj_cible enable row level security;

-- L'acheteur relit ce qu'il a saisi — c'est ce qui lui permet de voir son
-- erreur pendant que la commande est encore en attente.
create policy zabelie_rechaj_cible_buyer_read on zabelie_rechaj_cible
  for select using (
    exists (select 1 from orders o
             where o.id = zabelie_rechaj_cible.order_id and o.buyer_id = auth.uid())
  );

-- Le « moment de recharger » : commande PAYÉE, sur un produit du vendeur
-- connecté. Une commande `pending` n'ouvre RIEN — sinon il suffirait de créer
-- une commande jamais payée pour collecter des numéros. C'est la même fenêtre
-- que `zabelie_delivery_seller_read` (0076), pour la même raison.
create policy zabelie_rechaj_cible_seller_read on zabelie_rechaj_cible
  for select using (
    exists (
      select 1
        from orders o
        join products p on p.id = o.product_id
       where o.id = zabelie_rechaj_cible.order_id
         and p.seller_id = auth.uid()
         and o.status = 'paid'
    )
  );

-- Aucune écriture directe, comme `zabelie_fulfillment` (0043 §1). Et pas
-- d'`update` non plus : un numéro modifiable APRÈS paiement serait un numéro
-- sur lequel le vendeur ne peut pas s'appuyer — il recharge, puis la cible
-- change, et la preuve de ce qu'il a fait ne correspond plus à la ligne.
revoke insert, update, delete on zabelie_rechaj_cible from anon, authenticated;

-- ── 2. « Cette fiche exige-t-elle un numéro ? » ───────────────────────────────
-- La question se pose côté serveur à chaque checkout, et elle ne se répond pas
-- par le libellé : elle se répond en remontant l'ASCENDANCE du sous-rayon
-- jusqu'à `rechaj-telefon`. Écrit en SQL parce que c'est là que vit l'arbre, et
-- que la route n'a pas à le reconstituer en trois allers-retours.
--
-- `security invoker` (défaut) : la fonction ne lit que `products` et
-- `zabelie_categories`, et n'accorde donc aucun droit que l'appelant n'a pas.
create or replace function zabelie_est_rechaj(p_product uuid)
returns boolean
language sql
stable
-- `search_path` épinglé : sans lui, un schéma posé devant `public` par
-- l'appelant ferait lire un FAUX `zabelie_categories`. Garde du dépôt :
-- `supabase/tests/search_path_epingle.test.sql`, qui a refusé cette migration
-- à sa première exécution — l'oubli n'a pas eu besoin d'être remarqué.
set search_path = public
as $$
  with recursive remonte as (
    select c.id, c.parent_id, c.slug
      from products p
      join zabelie_categories c on c.id = p.category_id
     where p.id = p_product
    union all
    select c.id, c.parent_id, c.slug
      from zabelie_categories c
      join remonte r on r.parent_id = c.id
  )
  select exists (select 1 from remonte where slug = 'rechaj-telefon');
$$;

comment on function zabelie_est_rechaj(uuid) is
  'Vrai si la fiche est rangee sous « Recharge telephone » (0097/0098), a '
  'n''importe quelle profondeur. Une fiche sans sous-rayon rend faux. Appelee '
  'par app/api/checkout : sans numero, la commande n''est pas creee du tout.';

revoke execute on function zabelie_est_rechaj(uuid) from anon;

-- ── 3. La sonde de présence apprend la nouvelle fonction ─────────────────────
-- `zabelie_objets_requis()` (0085) est lue par `/api/admin/coherence`. Le
-- croisement `tests/objets-requis-couverture.test.ts` a REFUSÉ cette migration
-- tant que `zabelie_est_rechaj` n'y figurait pas — sans quoi, si la fonction
-- disparaissait, le tableau de bord resterait vert pendant que tout achat
-- échouerait. La liste ci-dessous est RECOPIÉE MÉCANIQUEMENT depuis `0085`,
-- jamais retapée : une transcription de mémoire échoue en silence (leçon 0086).
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
       'les marchands d''une zone (0084) : absente, le filtre acheteur par zone rend zéro vendeur en journalisant « introuvables », ce qui se lit comme « cette zone est vide »'),

      -- ── Ajoutée PAR LE GARDE, une seconde fois (0099) ────────────────────
      -- Le croisement code × sonde a nommé celle-ci dès la première exécution,
      -- exactement comme les deux de `0084` ci-dessus. Deux fois sur deux, il a
      -- trouvé un cas réel avant qu'on y pense.
      ('zabelie_est_rechaj(uuid)',
       'decide si une fiche exige un numero a recharger (0099) : absente, /api/checkout leve sur toute fiche portant un sous-rayon — c''est-a-dire que PLUS AUCUN achat ne passe, recharge ou non')
    ) as v(objet, pourquoi);
$$;

-- ── Post-conditions ──────────────────────────────────────────────────────────
do $$
declare
  v_policies integer;
  v_ecritures integer;
  v_rayons   integer;
  v_faux     boolean;
begin
  if to_regclass('public.zabelie_rechaj_cible') is null then
    raise exception '0099 KO: zabelie_rechaj_cible absente' using errcode = 'ZB099';
  end if;

  select count(*) into v_policies
    from pg_policies where tablename = 'zabelie_rechaj_cible';
  if v_policies <> 2 then
    raise exception '0099 KO: % policy(ies) sur zabelie_rechaj_cible, 2 attendues', v_policies
      using errcode = 'ZB099';
  end if;

  -- Le `revoke` a-t-il porté ? Un grant d'écriture qui survivrait rendrait les
  -- deux policies de lecture décoratives : n'importe quel compte connecté
  -- pourrait écrire une cible sur la commande d'un autre.
  select count(*) into v_ecritures
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'zabelie_rechaj_cible'
     and grantee in ('anon', 'authenticated')
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
  if v_ecritures <> 0 then
    raise exception '0099 KO: % droit(s) d''ecriture restant(s) pour anon/authenticated', v_ecritures
      using errcode = 'ZB099';
  end if;

  -- La fonction répond, et elle répond FAUX sur ce qui n'est pas une recharge.
  -- Un `exists` qui rendrait vrai partout passerait toutes les autres sondes.
  select zabelie_est_rechaj('00000000-0000-0000-0000-000000000000'::uuid) into v_faux;
  if v_faux is distinct from false then
    raise exception '0099 KO: zabelie_est_rechaj rend % sur une fiche inexistante', v_faux
      using errcode = 'ZB099';
  end if;

  -- Le rayon que tout ceci sert doit exister et être ouvert : sans lui, cette
  -- table serait un filet sur un chemin impraticable.
  select count(*) into v_rayons
    from zabelie_categories
   where slug in ('rechaj-telefon', 'rechaj-digicel', 'rechaj-natcom') and active;
  if v_rayons <> 3 then
    raise exception '0099 KO: % rayon(s) de recharge actif(s), 3 attendus — 0098 appliquee ?', v_rayons
      using errcode = 'ZB099';
  end if;

  raise notice '0099 OK: zabelie_rechaj_cible posee (2 policies, 0 ecriture directe), zabelie_est_rechaj repond, 3 rayons ouverts';
end $$;
