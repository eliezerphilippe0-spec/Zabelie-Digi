select zabelie_migration_garde('0078_sak_vwayaj_repare.sql');

-- ============================================================================
-- 0078 — LA LIGNE QUE 0077 A PERDUE EN SILENCE
-- ============================================================================
-- Mesuré juste après l'application de `0077` (2026-08-15) : 468 lignes semées,
-- 452 insérées. Quinze absences étaient VOULUES — des collisions de concept
-- avec la vague 1, qui garde sa ligne et son état actif grâce au
-- `on conflict do nothing`. La seizième ne l'était pas :
--
--   « Sacs de voyage » (niveau 3) portait le slug `sak-vwayaj`, qui est déjà
--   celui de son PROPRE PARENT de niveau 2 (« Bagagerie »). Le slug étant
--   unique sur toute la table, tous niveaux confondus, la ligne a été avalée
--   sans erreur et sans trace.
--
-- Le contrôle du dépôt vérifiait l'unicité DANS le seed, jamais contre les
-- slugs déjà pris aux niveaux 1 et 2 : `tests/taxonomie-seed.test.ts` porte
-- désormais ce croisement, avec la collision ci-dessus en exemption datée qui
-- se périme dans les deux sens.
--
-- Réparation minimale : la sous-catégorie renaît sous un slug distinct.
-- `0077` n'est pas touchée — elle est appliquée, son fichier ne bouge plus.
-- Aucun impact utilisateur en attendant : le rayon « Bagagerie » est inactif.
-- ============================================================================

insert into zabelie_categories (parent_id, level, slug, label_fr, label_kr, label_en, active, position)
select p.id, 3, 'sak-de-vwayaj', 'Sacs de voyage', 'Sak vwayaj', 'Travel bags', false, 20
  from zabelie_categories p
 where p.level = 2 and p.slug = 'sak-vwayaj'
on conflict (slug) do nothing;

-- ── Post-conditions ─────────────────────────────────────────────────────────
do $$
declare v_enfants integer;
begin
  select count(*) into v_enfants
    from zabelie_categories c
    join zabelie_categories p on p.id = c.parent_id
   where p.slug = 'sak-vwayaj' and c.level = 3;
  if v_enfants <> 4 then
    raise exception '0078: « Bagagerie » a % sous-catégories, 4 attendues', v_enfants;
  end if;
  -- La réparation n'active rien : le rayon reste dormant jusqu'à sa vague.
  if exists (select 1 from zabelie_categories where slug = 'sak-de-vwayaj' and active) then
    raise exception '0078: la ligne réparée ne devait pas être active';
  end if;
end $$;
