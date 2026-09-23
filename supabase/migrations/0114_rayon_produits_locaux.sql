select zabelie_migration_garde('0114_rayon_produits_locaux.sql');

-- ============================================================================
-- 0114 — Le rayon « Produits locaux » s'ouvre, SANS le clairin
-- ============================================================================
-- DÉCISION PORTEUR, 2026-09-23 : « go », en réponse à la proposition de
-- préparer l'ouverture de « Produits locaux ». Le rayon existait depuis 0035
-- (niveau 2) et 0077 (ses huit sous-catégories de docs/16 §8.3), DORMANT :
-- présent en base, invisible sur /categories et à la publication.
--
-- CE QUE FAIT CETTE MIGRATION :
--   1. ouvre `pwodwi-lokal` et ses huit feuilles alimentaires — Rapadou,
--      Mamba, Cassave, Café haïtien, Cacao, Épices créoles, Confitures
--      locales, Miel local ;
--   2. ouvre le département `manje-machandiz` s'il est fermé. En production il
--      est déjà actif (relevé docs/50, 2026-09-07 : 16 départements sur 16) et
--      la ligne ne touche rien ; sur une base neuve (CI), le seed 0035 le laisse
--      fermé, et un rayon ouvert sous un parent fermé serait orphelin ;
--   3. donne leur libellé espagnol aux huit feuilles (0077 ne les portait pas),
--      comme toutes les entrées déjà actives — sans écraser une valeur posée.
--
-- CE QU'ELLE NE FAIT PAS : ouvrir `klerin` (0051). Le clairin est un
-- spiritueux ; Zabelie ne vérifie pas l'âge, le contrôle a lieu à la remise,
-- par le vendeur. Son ouverture reste un geste SÉPARÉ, qui engage — la
-- post-condition ci-dessous échoue si cette migration l'a ouvert, et exige
-- qu'il soit fermé s'il l'était avant.
--
-- Retour arrière, sans migration :
--   update zabelie_categories set active = false
--    where slug in ('pwodwi-lokal', 'rapadou', 'manba', 'kasav', 'kafe-ayisyen',
--                   'kakawo', 'epis-kreyol', 'konfiti-lokal', 'siwo-myel-lokal');
-- ============================================================================

-- ── 1. Libellés espagnols des huit feuilles ─────────────────────────────────
update zabelie_categories c
   set label_es = v.es
  from (values
    ('rapadou',         'Rapadou (panela)'),
    ('manba',           'Mamba (mantequilla de maní)'),
    ('kasav',           'Casabe'),
    ('kafe-ayisyen',    'Café haitiano'),
    ('kakawo',          'Cacao'),
    ('epis-kreyol',     'Especias criollas (epis)'),
    ('konfiti-lokal',   'Mermeladas locales'),
    ('siwo-myel-lokal', 'Miel local')
  ) as v(slug, es)
 where c.slug = v.slug
   and c.label_es is null;

-- ── 2. Le département, s'il est fermé ───────────────────────────────────────
update zabelie_categories
   set active = true
 where slug = 'manje-machandiz'
   and level = 1
   and not active;

-- ── 3. Le rayon et ses huit feuilles ────────────────────────────────────────
update zabelie_categories
   set active = true
 where slug in ('pwodwi-lokal', 'rapadou', 'manba', 'kasav', 'kafe-ayisyen',
                'kakawo', 'epis-kreyol', 'konfiti-lokal', 'siwo-myel-lokal')
   and not active;

-- ── Post-conditions ──────────────────────────────────────────────────────────
do $$
declare
  v_dept      boolean;
  v_rayon     uuid;
  v_ouvertes  integer;
  v_actifs    integer;
  v_klerin    boolean;
  v_sans_es   integer;
begin
  select active into v_dept
    from zabelie_categories where slug = 'manje-machandiz' and level = 1;
  if not coalesce(v_dept, false) then
    raise exception '0114 KO: departement manje-machandiz absent ou ferme'
      using errcode = 'ZB114';
  end if;

  select c.id into v_rayon
    from zabelie_categories c
    join zabelie_categories d on d.id = c.parent_id
   where c.slug = 'pwodwi-lokal' and c.level = 2 and c.active
     and d.slug = 'manje-machandiz';
  if v_rayon is null then
    raise exception '0114 KO: pwodwi-lokal absent, ferme ou detache de manje-machandiz'
      using errcode = 'ZB114';
  end if;

  -- Les huit feuilles de docs/16 §8.3, ouvertes, et rattachées au rayon.
  select count(*) into v_ouvertes
    from zabelie_categories
   where parent_id = v_rayon and level = 3 and active
     and slug in ('rapadou', 'manba', 'kasav', 'kafe-ayisyen',
                  'kakawo', 'epis-kreyol', 'konfiti-lokal', 'siwo-myel-lokal');
  if v_ouvertes <> 8 then
    raise exception '0114 KO: % feuille(s) alimentaire(s) ouverte(s) sous pwodwi-lokal, 8 attendues', v_ouvertes
      using errcode = 'ZB114';
  end if;

  -- Rien d'autre d'ouvert sous le rayon : le clairin en particulier.
  select count(*) into v_actifs
    from zabelie_categories where parent_id = v_rayon and active;
  if v_actifs <> 8 then
    raise exception '0114 KO: % sous-rayon(s) actif(s) sous pwodwi-lokal, 8 attendus — le clairin a-t-il ete ouvert ?', v_actifs
      using errcode = 'ZB114';
  end if;

  select active into v_klerin from zabelie_categories where slug = 'klerin';
  if coalesce(v_klerin, false) then
    raise exception '0114 KO: klerin est actif — son ouverture est une decision separee'
      using errcode = 'ZB114';
  end if;

  select count(*) into v_sans_es
    from zabelie_categories
   where parent_id = v_rayon and active and coalesce(label_es, '') = '';
  if v_sans_es <> 0 then
    raise exception '0114 KO: % feuille(s) ouverte(s) sans libelle espagnol', v_sans_es
      using errcode = 'ZB114';
  end if;

  raise notice '0114 OK: Produits locaux ouvert, 8 feuilles actives, clairin ferme';
end $$;
