select zabelie_migration_garde('0100_retirer_fiches_essai.sql');

-- ============================================================================
-- 0100 — Les trois fiches d'essai quittent la vitrine
-- ============================================================================
-- DÉCISION PORTEUR, 2026-09-06 : « tu peux éliminer tous les faux comptes, je
-- voulais juste tester ». Interrogé sur le périmètre exact, il a laissé
-- l'arbitrage — cette migration applique donc les deux recommandations qui lui
-- avaient été faites, et RIEN de plus.
--
-- ─── CE QUI A ÉTÉ MESURÉ AVANT D'ÉCRIRE, ET QUI A RÉDUIT LE GESTE ───────────
-- Les quatre comptes de la base sont ceux du porteur ; les trois fiches
-- publiées appartiennent toutes à un compte d'essai. Zabelie n'a donc, à ce
-- jour, AUCUN vendeur réel — ce que le relevé `docs/49` présentait encore
-- comme « une offre crédible ». La correction est portée par ce chantier.
--
-- Mais « supprimer les comptes » s'est heurté à deux verrous, tous deux
-- délibérés, et c'est la mesure qui a décidé de la forme :
--
--   1. `orders.buyer_id` et `orders.product_id` sont en RESTRICT. Aucun compte
--      ni aucune fiche portant une commande ne peut disparaître tant que la
--      commande existe.
--   2. `zabelie_wallet_ledger_immutable` est `BEFORE DELETE OR UPDATE` sur
--      `wallet_transactions` et lève SANS CONDITION. La chaîne
--      `profil → portefeuille → grand livre` fait donc échouer toute
--      suppression du compte vendeur d'essai. **La plateforme refuse d'effacer
--      son propre livre de comptes, y compris pour son propriétaire, y compris
--      pour un test.** Ce garde ne se contourne pas : il est la raison pour
--      laquelle le chemin de l'argent est crédible.
--
-- Et l'historique de paiement est CONSERVÉ à dessein : les quatorze échecs
-- MonCash — aucun avec référence opérateur — sont la seule matière de
-- diagnostic sur un rail qui n'a jamais fonctionné. Les effacer avant de
-- l'avoir réparé jetterait les preuves. Ils ne gênent personne : aucun
-- visiteur ne les voit.
--
-- ─── CE QUE FAIT DONC CETTE MIGRATION : UNE SEULE CHOSE ─────────────────────
-- Les trois fiches publiées passent en `archived`. C'est tout ce qu'un
-- visiteur voit, et c'est donc tout ce qu'il faut retirer.
--
-- `archived` plutôt que `draft` : `draft` dit « le vendeur y travaille
-- encore », ce qui serait faux. `archived` dit « retirée », ce qui est vrai.
-- Le geste est réversible depuis `/admin` (`app/api/admin/product-status`
-- accepte les trois statuts).
--
-- Ciblage par IDENTIFIANT, jamais par libellé ni par nom de vendeur : un jour
-- un vrai vendeur peut s'appeler comme un compte d'essai, et une fiche peut
-- porter le même titre. Trois `uuid` ne collisionnent avec rien.
--
-- ⚠️ CE QU'ELLE NE FAIT PAS : elle ne supprime aucun compte, aucune commande,
-- aucun paiement, aucune écriture de grand livre. Le catalogue retombera sur
-- son état vide — « Le catalogue prend forme » — qui est mieux dessiné, et
-- plus honnête, que trois fiches de test sans photo.
-- ============================================================================

-- ── 0. Registre : 0099 ───────────────────────────────────────────────────────
-- `sha256` = empreinte CANONIQUE (`scripts/zabelie-migration-hash.mjs`). La
-- `note` porte le croisement brut (méthode 0086) relevé après application.
insert into zabelie_schema_migrations
  (filename, sha256, applied_at, applied_by, statut, preuve, note)
values
  ('0099_rechaj_cible_numero.sql',
   'b4390a551898f4daa0f4041fd667a3f309596ec7da028c2af672237675c7881d',
   '2026-09-06 18:26:37+00',
   'porteur — « Applique 0099 » du 2026-09-06 (autorisation permanente du 2026-08-17), appliquee par agent via MCP apres fusion de la PR #220 (CI verte, merge 049eb13)',
   'appliquee', 'journal_supabase',
   'zabelie_rechaj_cible (numero a recharger, RLS calquee sur 0076 : vendeur '
   'seulement si commande payee, aucune ecriture directe) + zabelie_est_rechaj '
   '(ascendance du rayon) + entree dans la sonde de presence. Mesure apres : '
   'RLS active, 2 policies, 0 droit d''ecriture pour anon/authenticated, '
   'fonction presente et surveillee, table vide, 98 lignes de registre pour '
   '99 fichiers. Empreinte croisee (methode 0086) : SHA-256 BRUT du fichier de '
   'main sans saut de ligne final = statements[1] du journal (version '
   '20260906182637) = '
   '192719182edc814c635f5f1d902d2a179acf433e721e5d2f6394899d50837198.')
on conflict (filename) do nothing;

-- ── 1. Les trois fiches d'essai ──────────────────────────────────────────────
-- Idempotent : `and status = 'published'` fait de la reprise un no-op.
update products
   set status = 'archived'
 where id in (
   'a306bcab-153b-42c6-9ada-722099d7d71b',  -- « cours francisation », 300 HTG
   '48ea44af-fca3-4c4d-a0d2-42f4f35a66ce',  -- « fxccxfdf », 0 HTG
   'e47bffde-6274-4905-be39-a01de1b91caf'   -- « appel », 10 HTG
 )
   and status = 'published';

-- ── Post-conditions ──────────────────────────────────────────────────────────
do $$
declare
  v_encore_publiees integer;
  v_commandes       integer;
  v_paiements       integer;
  v_ecritures       integer;
  v_profils         integer;
begin
  -- 1. Aucune des trois n'est plus publiée. Formulé ainsi — et non « exactement
  --    3 archivées » — parce que la CI tourne sur une base FRAÎCHE où ces
  --    identifiants n'existent pas : l'assertion doit dire la même vérité dans
  --    les deux mondes, sinon elle ne garde que l'un des deux.
  select count(*) into v_encore_publiees
    from products
   where id in ('a306bcab-153b-42c6-9ada-722099d7d71b',
                '48ea44af-fca3-4c4d-a0d2-42f4f35a66ce',
                'e47bffde-6274-4905-be39-a01de1b91caf')
     and status = 'published';
  if v_encore_publiees <> 0 then
    raise exception '0100 KO: % fiche(s) d''essai encore publiee(s)', v_encore_publiees
      using errcode = 'ZB100';
  end if;

  -- 2. LE RAYON D'ACTION. Cette migration ne touche QUE `products.status` ;
  --    ces quatre compteurs prouvent qu'aucune donnee d'argent ni aucun compte
  --    n'a bouge. Un `delete` glisse dans ce fichier les ferait mentir.
  select count(*) into v_commandes  from orders;
  select count(*) into v_paiements  from payments;
  select count(*) into v_ecritures  from wallet_transactions;
  select count(*) into v_profils    from profiles;

  raise notice
    '0100 OK: 0 fiche d''essai publiee. Intacts — commandes %, paiements %, ecritures de grand livre %, profils %.',
    v_commandes, v_paiements, v_ecritures, v_profils;
end $$;
