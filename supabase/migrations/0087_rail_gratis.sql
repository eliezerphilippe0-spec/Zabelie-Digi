select zabelie_migration_garde('0087_rail_gratis.sql');

-- ============================================================================
-- 0087 — Rail « gratis » : acquisition d'un produit affiché à 0 HTG
-- ============================================================================
-- ⚠️ ÉTAT : RÉDIGÉE, NON APPLIQUÉE. Tant qu'elle ne l'est pas, un produit à
-- 0 HTG ne peut pas être acquis : l'insertion dans `payments` échoue sur une
-- valeur d'énumération inconnue. Le rail gratuit est DORMANT, pas cassé.
--
-- POURQUOI CETTE MIGRATION EXISTE — un défaut mesuré, pas une idée.
--
-- L'accueil porte un rail « Produits gratuits » depuis toujours
-- (`app/page.tsx:178` : `products.filter(p => p.priceHTG === 0)`), avec sa
-- section et ses trois clés i18n VIVANTES. Mais aucune voie d'acquisition
-- n'existait : `buildBuyOptions` proposait MonCash INCONDITIONNELLEMENT, et un
-- produit à 0 envoyait `{ amount: 0 }` à MonCash, qui refuse.
--
-- Autrement dit : la vitrine annonçait une porte, et la porte était murée.
-- Trouvé le 2026-08-21 sur une question du porteur — « et pourtant les essais
-- gratuits fonctionnent ? » — à laquelle la réponse mesurée était : l'AFFICHAGE
-- fonctionne, l'acquisition n'a jamais eu de chemin.
--
-- ── CE QUI REND CE RAIL SÛR, ET CE N'EST PAS CE FICHIER ──────────────────────
--
-- Un rail qui marque une commande « payée » sans paiement est, en soi, le pire
-- objet qu'on puisse ajouter à ce dépôt. Trois garanties le bornent, et AUCUNE
-- n'est nouvelle — elles existaient déjà et ont été VÉRIFIÉES une par une :
--
--   1. `amount_htg = 0` ne peut venir QUE d'un produit affiché à 0.
--      • flash : `prix_flash_htg > 0` (0080)
--      • coupon : `discount_percentage between 1 and 90` (0021, 0031) ET
--        `discountedPriceHtg` plancher à 10 HTG (lib/zabelie-coupons.ts)
--      Aucune remise ne peut donc FABRIQUER un gratuit à partir d'un payant.
--
--   2. `confirm_payment` refuse tout écart de montant :
--        if p_amount is not null and p_amount <> v_order.amount_htg then raise
--      La route passe `p_amount = 0`. Si une commande non nulle atteignait ce
--      chemin par erreur, LA BASE la rejette. Le garde n'est pas dans la route
--      — il est dans la fonction, et il est fail-closed.
--
--   3. Le montant vient de `orders.amount_htg` RELU en base après insertion
--      (`.select("id, amount_htg")`), jamais du client. Règle dure n°3.
--
-- ── L'INVARIANT COMPTABLE (0033) N'EST PAS ENTAMÉ ───────────────────────────
-- Σ(wallet_transactions) = wallets.balance_htg + wallets.pending_htg
-- Une acquisition gratuite produit commission 0, net vendeur 0, escrow 0 :
-- l'identité passe de « x = x » à « x + 0 = x + 0 ». Ni `escrow_entries` ni
-- `wallet_transactions` ne portent de contrainte de positivité (vérifié) —
-- une ligne à 0 est représentable, et elle documente qu'un transfert de
-- propriété a eu lieu sans mouvement de fonds.
--
-- ── PÉRIMÈTRE : NUMÉRIQUE SEULEMENT ─────────────────────────────────────────
-- Le rail gratuit est refusé aux produits `physical`, et ce n'est pas une
-- prudence de principe : la base le dit déjà pour les articles à variantes —
-- `zabelie_product_variants.price_htg > 0` (0036). Un physique gratuit
-- signifierait « le vendeur expédie à ses frais », ce qui est un arbitrage
-- commercial du porteur, pas une décision d'implémentation. Le garde est côté
-- route ; cette migration ne fait que l'accompagner.
-- ============================================================================

-- `add value if not exists` est idempotent : rejouer cette migration ne lève
-- pas. C'est la même forme que `0009`, qui a ajouté `stripe` et `zelle` au même
-- type et a été appliquée sans incident — précédent vérifié, pas supposé.
alter type payment_rail add value if not exists 'gratis';

-- ── Post-condition ──────────────────────────────────────────────────────────
-- ⚠️ Dans un MÊME bloc de transaction, PostgreSQL refuse d'utiliser une valeur
-- d'énumération ajoutée juste avant. La sonde interroge donc le CATALOGUE
-- (`pg_enum`), qui voit l'étiquette dès son ajout, plutôt que de tenter un
-- `cast` — lequel échouerait pour une raison qui n'a rien à voir avec ce qu'on
-- veut mesurer, et se lirait comme un échec de la migration.
do $$
declare v_ok boolean;
begin
  select exists (
    select 1 from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'payment_rail' and e.enumlabel = 'gratis'
  ) into v_ok;

  if not v_ok then
    raise exception
      '0087 KO: la valeur « gratis » est absente de payment_rail — '
      'le rail gratuit resterait dormant et toute acquisition a 0 HTG '
      'echouerait a l''insertion du paiement'
      using errcode = 'ZB087';
  end if;

  raise notice '0087 OK: payment_rail porte « gratis » — le rail gratuit peut s''ouvrir';
end $$;
