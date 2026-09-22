select zabelie_migration_garde('0106_rail_kobara.sql');

-- ============================================================================
-- 0106 — LE RAIL `kobara` EXISTE EN BASE (et rien de plus)
-- ============================================================================
-- Kobara est une passerelle haïtienne qui encaisse NatCash ET MonCash
-- (`docs/03-PAIEMENTS.md` §9.1). Cette migration ajoute UNE valeur à
-- `payment_rail`. Elle ne crée aucune table, ne touche à aucune fonction
-- d'argent, ne modifie aucune policy.
--
-- ─── CE QU'ELLE N'AUTORISE PAS ──────────────────────────────────────────────
-- Appliquer ce fichier ne fait apparaître aucun moyen de paiement sur le site.
-- L'affichage du rail est commandé par `isKobaraEnabled()`, qui exige DEUX
-- variables d'environnement absentes de la production au moment où ces lignes
-- sont écrites. La base sait nommer le rail ; personne ne peut l'emprunter.
--
-- C'est l'ordre « expand/contract » habituel ici : le schéma avance en premier,
-- rétro-compatible, et le code se dégrade proprement tant qu'il n'a pas suivi.
-- L'inverse — du code qui insère `kobara` dans une énumération qui l'ignore —
-- est précisément le défaut que `0087` a produit : l'insertion du paiement
-- échouait à la ligne `payments.insert`, avec un message générique, et le
-- repli écrit pour ce cas était placé plus bas, sur un chemin jamais parcouru.
--
-- ─── ⚠️ CE QUE L'ÉTAPE 0 N'A TOUJOURS PAS VALIDÉ ────────────────────────────
-- Deux cases de `docs/03` §9.1 restent vides, et aucune ligne de SQL ne les
-- remplit :
--   • le statut de l'entité auprès de la BRH (circulaire 121) ;
--   • QUI DÉTIENT les fonds entre l'encaissement et le retrait.
-- Le dossier `docs/17` est chez le conseil depuis le 2026-08-21, sans réponse.
-- Cette migration est écrite sur instruction directe du porteur du
-- 2026-09-17, après que les deux points lui aient été exposés. Elle est
-- délibérément la plus petite chose qui puisse exister : une valeur
-- d'énumération, réversible dans les faits par le simple fait que personne ne
-- l'écrit tant que les secrets sont absents.
--
-- ⚠️ Une valeur d'énumération ne se RETIRE pas en PostgreSQL. C'est la raison
-- pour laquelle cette migration ne fait que ça, et pourquoi elle n'est pas
-- accompagnée d'une table `zabelie_kobara_*` : ce qui n'est pas ajouté n'a pas
-- à être défait.
-- ============================================================================

alter type payment_rail add value if not exists 'kobara';

-- ─────────── POST-CONDITIONS ────────────────────────────────────────────────
-- ⚠️ Formulées pour être VRAIES sur une base fraîche de CI comme en
-- production. Les post-conditions de `0100` et `0101` avaient d'abord
-- interrogé des uuid de production et échouaient sur la base neuve de la CI :
-- une assertion qui ne tient que dans un seul des deux mondes ne prouve rien
-- dans l'autre, et c'est l'autre qui tourne à chaque commit.
do $$
declare
  v_valeurs text[];
begin
  select array_agg(e.enumlabel::text order by e.enumsortorder)
    into v_valeurs
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
   where t.typname = 'payment_rail';

  -- K1 — la valeur est là.
  if not ('kobara' = any(v_valeurs)) then
    raise exception 'ZB106 : payment_rail ne contient pas kobara apres 0106 (%)',
      array_to_string(v_valeurs, ',');
  end if;

  -- K2 — AUCUNE valeur existante n'a disparu. Un `alter type` ne peut pas les
  -- supprimer, mais c'est la migration qui le DIT qui permettra de lire le
  -- jour où quelqu'un remplacera ce fichier par autre chose.
  if not (v_valeurs @> array['moncash', 'stripe', 'zelle', 'gratis']) then
    raise exception 'ZB106 : une valeur de payment_rail a disparu (%)',
      array_to_string(v_valeurs, ',');
  end if;

  -- K3 — AUCUN paiement ne porte encore ce rail. Si cette assertion échouait,
  -- c'est que du code écrit `kobara` avant que le rail soit ouvert, et il
  -- faudrait le savoir AVANT de croire que la migration est inoffensive.
  if exists (select 1 from payments where rail::text = 'kobara') then
    raise exception 'ZB106 : des paiements portent deja le rail kobara — 0106 n''est pas le premier geste';
  end if;

  raise notice 'ZB106 : payment_rail = %', array_to_string(v_valeurs, ',');
end $$;

comment on type payment_rail is
  'Rails de paiement. `kobara` (0106) = passerelle tierce encaissant NatCash/MonCash ; son affichage dépend de KOBARA_SECRET_KEY et KOBARA_WEBHOOK_SECRET, pas de la presence de cette valeur. Etape 0 de docs/03 §9.1 incomplete : statut BRH et detention des fonds non etablis.';
