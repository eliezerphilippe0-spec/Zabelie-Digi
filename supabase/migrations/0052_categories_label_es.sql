-- ============================================================================
-- 0052 — `label_es` : les rayons parlent enfin espagnol
-- ============================================================================
-- ⚠️ NON APPLIQUÉE. À exécuter par le porteur.
--
-- ⚠️ ÉTAT DE LA BASE AU MOMENT DE L'ÉCRITURE — constaté, pas déduit
--    (`zabelie_schema_migrations` + `information_schema`, 2026-08-02) :
--    dernière appliquée `0050` ; `zabelie_categories` porte `label_kr`,
--    `label_fr`, `label_en` et RIEN d'autre. `0043`, `0044` et `0051` sont
--    écrites mais non appliquées ; celle-ci ne dépend d'aucune des trois.
--
-- LE TROU QU'ELLE FERME
-- ---------------------
-- L'espagnol est devenu la quatrième langue de l'interface le 2026-08-02. Il
-- n'était PAS symétrique de l'anglais : celui-ci disposait de `label_en`
-- depuis la création de la table (`0035`), l'espagnol n'avait rien. Résultat
-- constaté et assumé dans `lib/taxonomy.ts` : un hispanophone voyait
-- « Alimentation & épicerie » au milieu d'une interface espagnole.
--
-- Ce n'est pas un détail de finition. L'espagnol a été ouvert pour la diaspora
-- haïtienne d'Amérique latine et la République dominicaine voisine ; une demi-
-- interface ne la sert pas.
--
-- POURQUOI LA COLONNE RESTE NULLABLE
-- ----------------------------------
-- `not null` obligerait toute catégorie future à naître traduite, ou à ne pas
-- naître. Le repli applicatif (`label_es || label_fr`) est préférable : une
-- catégorie nouvelle s'affiche en français, ce qui est lisible, plutôt que de
-- bloquer une migration produit sur une question de traduction.
--
-- En contrepartie, la garde de fin ÉCHOUE si une ligne existante reste sans
-- traduction. C'est le seul moment où une omission de ma part est encore
-- rattrapable à peu de frais : après, elle se dissout dans un repli silencieux
-- que personne ne remarquera.
-- ============================================================================

alter table zabelie_categories add column if not exists label_es text;

comment on column zabelie_categories.label_es is
  'Libellé espagnol. NULLABLE : le code replie sur `label_fr` (lib/taxonomy.ts). '
  'Ajouté par 0052, à l''ouverture de la quatrième langue.';

update zabelie_categories c set label_es = v.es
  from (values
    -- ── Niveau 1 : les 16 départements ──────────────────────────────────────
    ('otomobil-moto',       'Autos y Motos'),
    ('elektwonik',          'Electrónica'),
    ('mod-akseswa',         'Moda y accesorios'),
    ('soulye',              'Calzado'),
    ('sak-bagay',           'Bolsos y equipaje'),
    ('bote-swen',           'Belleza y cuidado'),
    ('savon-netwayaj',      'Jabón y limpieza'),
    ('manje-machandiz',     'Alimentación y abarrotes'),
    ('mache-agrikol',       'Mercado agrícola'),
    ('kay-kizin',           'Hogar y cocina'),
    ('sante-byennet',       'Salud y bienestar'),
    ('espo-lwazi',          'Deporte y ocio'),
    ('liv-papet',           'Libros y papelería'),
    ('timoun-bebe',         'Bebé y niños'),
    ('atizana-kado',        'Artesanía y regalos'),
    ('dijital-sevis',       'Digital y servicios'),

    -- ── Niveau 2 : les 74 rayons ────────────────────────────────────────────
    ('atizana-ayisyen',     'Artesanía haitiana'),
    ('ekipman-espo',        'Equipamiento deportivo'),
    ('legim-fwi',           'Frutas y verduras'),
    ('liv',                 'Libros'),
    ('meb',                 'Muebles'),
    ('parafamasi',          'Parafarmacia'),
    ('pwodwi-dijital',      'Productos digitales'),
    ('pwodwi-sek',          'Abarrotes secos'),
    ('pyes-detache-oto',    'Repuestos de auto'),
    ('rad-fanm',            'Ropa de mujer'),
    ('sak-fanm',            'Bolsos de mujer'),
    ('savon',               'Jabones'),
    ('soulye-fanm',         'Calzado de mujer'),
    ('swen-bebe',           'Cuidado del bebé'),
    ('swen-cheve',          'Cuidado del cabello'),
    ('telefon-tablet',      'Teléfonos y tabletas'),
    ('akseswa-telefon',     'Accesorios de teléfono'),
    ('bwason',              'Bebidas'),
    ('founiti-lekol',       'Útiles escolares'),
    ('grenn-semans',        'Granos y semillas'),
    ('kizin',               'Cocina'),
    ('lesiv',               'Detergentes'),
    ('materyel-bebe',       'Equipamiento de bebé'),
    ('pwodwi-natirel',      'Productos naturales'),
    ('pyes-detache-moto',   'Repuestos de moto'),
    ('rad-espo',            'Ropa deportiva'),
    ('rad-gason',           'Ropa de hombre'),
    ('sak-vwayaj',          'Equipaje'),
    ('sevis-pwofesyonel',   'Servicios profesionales'),
    ('soulye-gason',        'Calzado de hombre'),
    ('swen-po',             'Cuidado de la piel'),
    ('tablo-atizay',        'Arte y cuadros'),
    ('aktivite-deyo',       'Aire libre'),
    ('elektwomenaje',       'Electrodomésticos'),
    ('enfomatik',           'Informática'),
    ('founiti-biwo',        'Material de oficina'),
    ('jwet',                'Juguetes'),
    ('kado-fet',            'Regalos y fiestas'),
    ('kawotchou-jant',      'Neumáticos y llantas'),
    ('makiyaj',             'Maquillaje'),
    ('materyel-medikal',    'Material médico'),
    ('netwayaj-kay',        'Limpieza del hogar'),
    ('pwodwi-lokal',        'Productos locales'),
    ('rad-timoun',          'Ropa infantil'),
    ('rechaj-telefon',      'Recarga telefónica'),
    ('sak-lekol',           'Mochilas escolares'),
    ('soulye-timoun',       'Calzado infantil'),
    ('zouti-agrikol',       'Herramientas agrícolas'),
    ('angre-tretman',       'Fertilizantes y tratamientos'),
    ('antretyen-soulye',    'Cuidado del calzado'),
    ('atizay-kreyasyon',    'Artes creativas'),
    ('bijou-mont',          'Joyas y relojes'),
    ('dekorasyon',          'Decoración'),
    ('enstriman-mizik',     'Instrumentos musicales'),
    ('jwet-lwazi',          'Juegos y ocio'),
    ('konsev-sos',          'Conservas y condimentos'),
    ('luil-likid',          'Aceites y líquidos'),
    ('materyel-netwayaj',   'Material de limpieza'),
    ('odyo-imaj',           'Audio y video'),
    ('pafen',               'Perfumes'),
    ('sak-travay',          'Bolsos profesionales'),
    ('akseswa-mod',         'Accesorios de moda'),
    ('akseswa-oto',         'Accesorios de auto'),
    ('bet-pwovann',         'Ganadería y piensos'),
    ('eneji-kouran',        'Energía y electricidad'),
    ('goute-bonbon',        'Snacks y dulces'),
    ('ijyen-pesonel',       'Higiene personal'),
    ('kabann-twal',         'Ropa de cama y hogar'),
    ('apare-bote',          'Aparatos de belleza'),
    ('ekipman-motosiklis',  'Equipamiento de motociclista'),
    ('kamera-sekirite',     'Cámaras y seguridad'),
    ('konstriksyon',        'Bricolaje y construcción'),
    ('zouti-garaj',         'Herramientas y taller'),
    ('veyikil-2-wou',       'Vehículos de 2 ruedas'),

    -- ── Niveau 3 : les 33 sous-rayons ───────────────────────────────────────
    ('chanpou',             'Champús'),
    ('filtrasyon-moto',     'Filtración moto'),
    ('filtrasyon-oto',      'Filtración (aceite, aire, combustible, habitáculo)'),
    ('kes-pwoteksyon',      'Fundas y protectores de pantalla'),
    ('krem-figi',           'Cremas faciales'),
    ('luil-motè',           'Aceite de motor'),
    ('smartphone',          'Teléfonos inteligentes'),
    ('chaje-kab',           'Cargadores y cables'),
    ('fren-moto',           'Frenos de moto'),
    ('fren-oto',            'Frenos (pastillas, discos, pinzas)'),
    ('krem-kò',             'Lociones y cremas corporales'),
    ('luil-bwat',           'Aceite de caja y diferencial'),
    ('swen-mask',           'Acondicionadores y mascarillas'),
    ('telefon-senp',        'Teléfonos básicos'),
    ('batri-demaraj-oto',   'Baterías, alternadores, motores de arranque, bujías'),
    ('batri-moto',          'Baterías y encendido de moto'),
    ('likid-fren',          'Líquido de frenos'),
    ('luil-cheve',          'Aceites y sérums capilares'),
    ('powerbank',           'Baterías externas'),
    ('sewòm',               'Sérums'),
    ('tablet',              'Tabletas'),
    ('chen-pinyon',         'Cadenas, piñones y coronas'),
    ('ekoutè',              'Audífonos y auriculares'),
    ('kouwa-oto',           'Correas y cadenas de distribución'),
    ('likid-refwadisman',   'Líquido refrigerante'),
    ('mech-pewik',          'Mechas, extensiones y pelucas'),
    ('pwoteksyon-solè',     'Protectores solares'),
    ('pyes-telefon',        'Repuestos de teléfono (pantallas, baterías)'),
    ('aditif',              'Aditivos y tratamientos'),
    ('bè-luil-natirèl',     'Mantecas y aceites naturales (karité, coco, ricino)'),
    ('kat-memwa',           'Tarjetas de memoria'),
    ('très-kwochè',         'Trenzas y crochet'),
    ('akseswa-kwafi',       'Accesorios para el cabello'),

    -- ── Ajouté par 0051, traduit ici pour que l'ordre d'application ─────────
    --    des deux migrations n'ait pas d'importance.
    ('klerin',              'Clairin')
  ) as v(slug, es)
 where c.slug = v.slug;

-- ─────────────────────────── Garde de fin ───────────────────────────────────
-- ÉCHOUE si une catégorie EXISTANTE est restée sans traduction. C'est le seul
-- moment où mon oubli est encore rattrapable à peu de frais : ensuite il se
-- dissout dans un repli silencieux vers le français que personne ne remarque.
--
-- La garde NOMME les manquantes plutôt que de rendre un compte : « 3 lignes
-- non traduites » oblige à écrire une requête pour savoir lesquelles, et cette
-- requête ne s'écrit jamais à 23 h.
do $$
declare v_manquantes text;
begin
  select string_agg(slug, ', ' order by slug) into v_manquantes
    from zabelie_categories
   where label_es is null or btrim(label_es) = '';

  if v_manquantes is not null then
    raise exception
      'Catégories sans traduction espagnole : %. Complétez la liste de 0052 '
      'avant d''appliquer — le repli vers le français est silencieux.',
      v_manquantes
      using errcode = 'ZB052';
  end if;

  raise notice 'OK — % catégories traduites en espagnol',
    (select count(*) from zabelie_categories);
end $$;
