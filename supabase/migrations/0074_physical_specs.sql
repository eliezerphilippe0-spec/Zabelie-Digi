select zabelie_migration_garde('0074_physical_specs.sql');

-- ============================================================================
-- 0074 — FICHE RICHE : marque, matière, état (V-2, docs/35)
-- ============================================================================
-- Le socle de la fiche riche existe depuis 0036 : poids, dimensions, fragile,
-- encombrant. Cette migration ajoute les TROIS attributs restants — nullables,
-- purement additifs. Le formulaire ne montre ces trois champs que si les
-- colonnes existent (sonde serveur) : sans 0074, rien ne se saisit, donc rien
-- ne se perd en silence.
--
-- `condition` : énumération fermée — « nèf » / « dezyèm men », le vocabulaire
-- du marché. Pas de texte libre : un état se filtre, il ne se raconte pas.
-- ============================================================================

alter table zabelie_physical_products
  add column brand     text check (brand is null or char_length(btrim(brand)) between 1 and 60),
  add column material  text check (material is null or char_length(btrim(material)) between 1 and 60),
  add column condition text check (condition in ('nef', 'dezyem-men'));

comment on column zabelie_physical_products.brand is
  'Marque (V-2, docs/35) — libre, borné 60. Null = non renseigné.';
comment on column zabelie_physical_products.condition is
  'État : nef | dezyem-men — énumération fermée, jamais de texte libre.';

-- ── Post-conditions ─────────────────────────────────────────────────────────
do $$
begin
  if (select count(*) from information_schema.columns
       where table_name = 'zabelie_physical_products'
         and column_name in ('brand', 'material', 'condition')) <> 3 then
    raise exception '0074: colonnes manquantes';
  end if;
end $$;
