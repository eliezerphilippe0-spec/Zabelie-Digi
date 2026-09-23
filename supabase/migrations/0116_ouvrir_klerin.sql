select zabelie_migration_garde('0116_ouvrir_klerin.sql');

-- ============================================================================
-- 0116 — Le rayon « Clairin » s'ouvre, réservé aux 18 ans et plus
-- ============================================================================
-- DÉCISION PORTEUR, 2026-09-23 : « oui 18 ans, go sur le plan ». Cette
-- migration est l'étape 5 du plan, et la DERNIÈRE à appliquer :
--
--   ⚠️ ORDRE D'APPLICATION — ne pas inverser.
--   1. `0115` appliquée (seuil en base, fonction, table d'attestations) ;
--   2. le code qui exige l'attestation DÉPLOYÉ en production
--      (`/api/checkout` → 422 `age_attestation_requise` sans elle) ;
--   3. alors seulement, `0116`.
--   Appliquée avant l'étape 2, le rayon serait ouvert sur un checkout qui ne
--   pose pas la question. La base ne peut pas voir un déploiement Vercel :
--   cet ordre est tenu par le rapport de session, pas par un garde SQL.
--
-- Ce que la base PEUT garantir, et que les post-conditions exigent : le rayon
-- ne s'ouvre pas sans son seuil de 18 ans, ni sous un parent fermé.
--
-- Retour arrière, sans migration :
--   update zabelie_categories set active = false where slug = 'klerin';
-- ============================================================================

update zabelie_categories
   set active = true
 where slug = 'klerin'
   and level = 3
   and not active;

-- ── Post-conditions ──────────────────────────────────────────────────────────
do $$
declare
  v_age      smallint;
  v_actif    boolean;
  v_parent   boolean;
  v_restreint integer;
begin
  select c.age_minimum, c.active, p.active
    into v_age, v_actif, v_parent
    from zabelie_categories c
    join zabelie_categories p on p.id = c.parent_id
   where c.slug = 'klerin' and c.level = 3 and p.slug = 'pwodwi-lokal';

  if v_age is distinct from 18 then
    raise exception '0116 KO: klerin sans seuil de 18 ans (%) — 0115 doit passer avant', v_age
      using errcode = 'ZB116';
  end if;
  if not coalesce(v_actif, false) then
    raise exception '0116 KO: klerin n''est pas actif' using errcode = 'ZB116';
  end if;
  if not coalesce(v_parent, false) then
    raise exception '0116 KO: pwodwi-lokal est ferme — klerin serait orphelin' using errcode = 'ZB116';
  end if;

  -- Le seuil doit être celui que le checkout lira : par la fonction, pas par
  -- la colonne seule. Une fonction absente ou fausse ouvrirait un rayon non gardé.
  select count(*) into v_restreint
    from zabelie_categories c
   where c.slug = 'klerin'
     and to_regprocedure('zabelie_age_minimum(uuid)') is not null;
  if v_restreint <> 1 then
    raise exception '0116 KO: zabelie_age_minimum absente — 0115 doit passer avant' using errcode = 'ZB116';
  end if;

  raise notice '0116 OK: klerin ouvert, 18 ans exiges';
end $$;
