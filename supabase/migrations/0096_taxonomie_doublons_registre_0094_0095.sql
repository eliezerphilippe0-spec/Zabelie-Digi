select zabelie_migration_garde('0096_taxonomie_doublons_registre_0094_0095.sql');

-- ============================================================================
-- 0096 — Sept sous-catégories en double sous le même parent, et la garde qui
--        empêche que ça se reproduise ; lignes de registre de 0094 et 0095
-- ============================================================================
-- MESURÉ EN PRODUCTION le 2026-09-05, en lecture seule :
--
--   select p.label_fr, c.label_fr, string_agg(c.slug || ':' || c.active, ' | ')
--     from zabelie_categories c join zabelie_categories p on p.id = c.parent_id
--    group by 1, 2 having count(*) > 1;
--
--   Huiles & liquides      · Huile moteur                  luil-mote:false | luil-motè:true
--   Pièces détachées auto  · Filtration (huile, air, …)    filtrasyon:false | filtrasyon-oto:true
--   Pièces détachées moto  · Freinage moto                 frenaj-moto:false | fren-moto:true
--   Services professionnels· Marketing & réseaux sociaux   marketing-rezo-sosyal:false | maketin-rezo:true
--   Services professionnels· Photo & vidéo                 foto-videyo:false | foto-ak-videyo:true
--   Soins de la peau       · Protections solaires          pwoteksyon-sole:false | pwoteksyon-solè:true
--   Soins de la peau       · Sérums                        sewom:false | sewòm:true
--
-- D'OÙ ÇA VIENT. `0077` a semé tout le niveau 3 de docs/16 avec `on conflict
-- (slug) do nothing`, en comptant sur la collision de SLUG pour laisser sa
-- ligne à la vague 1 (0035, 0057). Là où la vague 1 avait choisi un slug
-- différent pour le même concept — `luil-motè` avec accent contre `luil-mote`
-- sans, `fren-moto` contre `frenaj-moto`, `foto-ak-videyo` contre
-- `foto-videyo` — il n'y a eu aucun conflit, et une seconde ligne dormante est
-- née sous le même parent avec le même libellé français. `0077` disait « ce
-- seed n'écrase RIEN » ; c'est vrai, et c'est précisément le défaut : il
-- n'écrase rien parce qu'il double.
--
-- POURQUOI C'EST INVISIBLE AUJOURD'HUI, ET PAS DEMAIN. La ligne en double est
-- inactive, et rien ne lit un nœud inactif (0035). Le jour où une branche est
-- ouverte pour la vague 2 par `update … set active = true where parent_id = …`
-- — le geste prévu par docs/16 et le journal d'`OPS_TODO` —, l'acheteur voit
-- deux fois « Huile moteur » dans la barre de facettes, avec deux comptes.
-- `tests/taxonomie-seed.test.ts` croisait les slugs, jamais les libellés :
-- rien ne le signalait, et rien ne l'aurait signalé.
--
-- CE QUE CETTE MIGRATION FAIT, dans l'ordre :
--   1. inscrit au registre les lignes de 0094 et 0095, appliquées le
--      2026-09-03 et jamais inscrites (0095 n'était pas une migration de
--      registre, et 0094 n'a inscrit que 0093) ;
--   2. RETIRE les sept lignes dormantes, nommées une à une par leur slug ET
--      revérifiées une à une (niveau 3, inactives, sans enfant, sans produit,
--      avec une jumelle ACTIVE sous le même parent) — un slug qui ne remplit
--      pas toutes ces conditions n'est pas touché, et le compte final doit
--      être exactement sept ;
--   3. pose une contrainte d'unicité sur (parent_id, label_fr), `nulls not
--      distinct` pour que deux départements homonymes soient refusés aussi.
--      Le prochain seed qui double une ligne échouera BRUYAMMENT, au lieu de
--      laisser une jumelle dormir jusqu'à son activation.
--
-- CE QU'ELLE NE FAIT PAS : aucune ligne active n'est touchée ; aucun produit
-- n'est rattaché aux sept lignes (mesuré : 0 référence dans
-- `zabelie_physical_products`, et la clé étrangère refuserait de toute façon)
-- ; les fichiers 0035, 0057, 0077 ne bougent pas — ils sont appliqués. Le
-- croisement de libellés vit désormais dans `tests/taxonomie-seed.test.ts`,
-- avec les sept slugs ci-dessous en exemption datée, qui se périme dans les
-- deux sens.
-- ============================================================================

-- ── 1. Registre : 0094 et 0095 ───────────────────────────────────────────────
-- `sha256` = empreinte CANONIQUE (`scripts/zabelie-migration-hash.mjs`), la
-- convention du registre. La `note` porte le croisement brut (méthode 0086) :
-- SHA-256 du fichier de `main` sans son saut de ligne final = SHA-256 de
-- `statements[1]` dans `supabase_migrations.schema_migrations`.
insert into zabelie_schema_migrations
  (filename, sha256, applied_at, applied_by, statut, preuve, note)
values
  ('0094_order_ref_extensions_registre_0093.sql',
   '2e2d780f646e6995f1f9f78f0f2d9012e7f1e9350c93d9a12f9939fa92b0d64b',
   '2026-09-03 17:57:12+00',
   'porteur — autorisation permanente du 2026-08-17, appliquee par agent via MCP (PR #198)',
   'appliquee', 'journal_supabase',
   'zabelie_order_ref_candidate retrouve pgcrypto (search_path = public, '
   'extensions) ; ligne de 0093. Correctif de « Creation de la commande '
   'impossible » (2026-09-03). Empreinte croisee (methode 0086) : SHA-256 BRUT '
   'du fichier de main = statements[1] du journal (version 20260903175712) = '
   '4abf0ee0e11d22f7d9eb1eb86b9eab53f4026e7b74f291016abb03e216b23dee.'),
  ('0095_profil_oauth_nom.sql',
   'b178753062489d86afc6fa8c8da8edb4ee1a7fa0c311d0fcebd9c9e805bb9837',
   '2026-09-03 19:39:38+00',
   'porteur — autorisation permanente du 2026-08-17, appliquee par agent via MCP (PR #199)',
   'appliquee', 'journal_supabase',
   'V-19 : le profil d un compte OAuth lit display_name → full_name → name, '
   'toujours via zabelie_safe_display_name ; revocation de 0049 redite. '
   'Empreinte croisee (methode 0086) : SHA-256 BRUT du fichier de main = '
   'statements[1] du journal (version 20260903193938) = '
   '3270d102c9f1488c8072d3cbc30803c4d4e30c7c73d93af5bb0d11373cb65bfd.')
on conflict (filename) do nothing;

-- ── 2. Les sept doublons dormants ────────────────────────────────────────────
-- Nommés ET revérifiés : la liste dit ce qu'on vise, les conditions disent ce
-- qu'on accepte de toucher. Une ligne nommée qui aurait changé d'état depuis
-- la mesure (activée, rattachée à un produit) reste en place — et le compte
-- final, exigé à sept, le fait savoir.
do $$
declare
  v_retirees integer;
begin
  with cibles as (
    select c.id
      from zabelie_categories c
      join zabelie_categories p on p.id = c.parent_id
     where c.slug in (
             'luil-mote', 'filtrasyon', 'frenaj-moto',
             'marketing-rezo-sosyal', 'foto-videyo',
             'pwoteksyon-sole', 'sewom'
           )
       and c.level = 3
       and not c.active
       and not exists (select 1 from zabelie_categories e where e.parent_id = c.id)
       and not exists (select 1 from zabelie_physical_products pp where pp.category_id = c.id)
       and exists (
             select 1 from zabelie_categories j
              where j.parent_id = c.parent_id
                and j.label_fr = c.label_fr
                and j.active
                and j.id <> c.id
           )
  ),
  retrait as (
    delete from zabelie_categories c using cibles where c.id = cibles.id
    returning c.id
  )
  select count(*) into v_retirees from retrait;

  if v_retirees <> 7 then
    raise exception '0096 KO: % ligne(s) retiree(s), 7 attendues — l etat de la base n est pas celui mesure le 2026-09-05, relire avant de forcer', v_retirees
      using errcode = 'ZB096';
  end if;
end $$;

-- ── 3. Plus jamais deux libellés sous le même parent ─────────────────────────
-- `nulls not distinct` : au niveau 1, `parent_id` est null pour tout le monde
-- ; sans cette clause, deux départements « Électronique » passeraient.
create unique index if not exists zabelie_categories_parent_label_fr_key
  on zabelie_categories (parent_id, label_fr) nulls not distinct;

comment on index zabelie_categories_parent_label_fr_key is
  'Un libellé français n''apparaît qu''une fois sous un même parent (0096). '
  'Un seed qui double une ligne échoue ici, au lieu de laisser une jumelle '
  'dormante attendre son activation.';

-- ── Post-conditions ──────────────────────────────────────────────────────────
-- Sur l'EFFET : aucun doublon (parent, label_fr) où que ce soit ; les sept
-- jumelles ACTIVES sont toujours là ; l'index existe et est unique ; les deux
-- lignes de registre disent bien `appliquee` / `journal_supabase`.
do $$
declare
  v_doublons  integer;
  v_jumelles  integer;
  v_index     boolean;
  v_registre  integer;
begin
  select count(*) into v_doublons
    from (select parent_id, label_fr from zabelie_categories
           group by parent_id, label_fr having count(*) > 1) d;
  if v_doublons <> 0 then
    raise exception '0096 KO: % couple(s) (parent, label_fr) encore en double', v_doublons
      using errcode = 'ZB096';
  end if;

  select count(*) into v_jumelles
    from zabelie_categories
   where active and slug in (
     'luil-motè', 'filtrasyon-oto', 'fren-moto',
     'maketin-rezo', 'foto-ak-videyo',
     'pwoteksyon-solè', 'sewòm'
   );
  if v_jumelles <> 7 then
    raise exception '0096 KO: % jumelle(s) active(s) sur 7 — une ligne de la vague 1 a ete touchee', v_jumelles
      using errcode = 'ZB096';
  end if;

  select exists (
    select 1 from pg_indexes
     where schemaname = 'public'
       and tablename = 'zabelie_categories'
       and indexname = 'zabelie_categories_parent_label_fr_key'
       and indexdef like 'CREATE UNIQUE INDEX%'
  ) into v_index;
  if not v_index then
    raise exception '0096 KO: index unique zabelie_categories_parent_label_fr_key absent'
      using errcode = 'ZB096';
  end if;

  select count(*) into v_registre
    from zabelie_schema_migrations
   where filename in ('0094_order_ref_extensions_registre_0093.sql', '0095_profil_oauth_nom.sql')
     and statut = 'appliquee' and preuve = 'journal_supabase';
  if v_registre <> 2 then
    raise exception '0096 KO: % ligne(s) de registre conformes pour 0094/0095, 2 attendues', v_registre
      using errcode = 'ZB096';
  end if;

  raise notice '0096 OK: 7 doublons retires, 7 jumelles actives intactes, index unique pose, registre 0094/0095 inscrit';
end $$;
