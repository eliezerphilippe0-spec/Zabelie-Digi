-- ============================================================================
-- SEED IDEMPOTENT : les trois `insert` portent `on conflict (slug) do nothing`.
-- Les migrations sont appliquées À LA MAIN dans l'éditeur SQL : un script
-- interrompu à mi-course laisse la table créée et le seed incomplet. Sans cette
-- clause, la reprise dupliquerait la taxonomie — et une sonde qui ne teste que
-- l'existence des OBJETS verrait « 0035 présente » sans rien remarquer.
-- ============================================================================
-- 0035 — Chantier B : taxonomie catalogue (arbre 3 niveaux, KR/FR/EN)
-- ============================================================================
-- Référence : docs/16-TAXONOMIE-CATALOGUE.md (16 départements).
--
-- Principe d'activation (arbitré) : TOUT est défini en base, seule une partie
-- est ACTIVE au lancement. Un nœud inactif n'apparaît ni à la publication ni
-- dans les filtres. Ouvrir un département = un UPDATE, jamais une migration.
--
-- Périmètre du seed :
--   • les 16 départements (niveau 1) et leurs catégories (niveau 2) : COMPLET ;
--   • les sous-catégories (niveau 3) : uniquement pour les branches ACTIVES en
--     vague 1. Seeder 330 feuilles pour des départements fermés serait du
--     poids mort — elles arriveront avec l'ouverture de chaque département,
--     accompagnées de leurs traductions relues.
--
-- ⚠️ Le Kreyòl est à faire relire par un locuteur natif avant ouverture
-- publique (même règle que lib/i18n.ts).
-- ============================================================================

create table zabelie_categories (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references zabelie_categories (id) on delete restrict,
  level      smallint not null check (level between 1 and 3),
  slug       text not null unique,
  label_kr   text not null,
  label_fr   text not null,
  label_en   text not null,
  active     boolean not null default false,
  position   smallint not null default 0,
  created_at timestamptz not null default now(),
  -- Un niveau 1 n'a pas de parent ; un niveau 2 ou 3 en a forcément un.
  constraint level_parent_coherent check (
    (level = 1 and parent_id is null) or (level > 1 and parent_id is not null)
  )
);

create index zabelie_categories_parent_idx on zabelie_categories (parent_id, position);
create index zabelie_categories_active_idx on zabelie_categories (level, position)
  where active;

-- Un enfant doit être exactement un niveau sous son parent : sans ce contrôle,
-- l'arbre peut se retrouver avec un niveau 3 accroché à un niveau 1.
create function zabelie_categories_depth_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_parent_level smallint;
begin
  if new.parent_id is null then return new; end if;
  select level into v_parent_level from zabelie_categories where id = new.parent_id;
  if v_parent_level is null then
    raise exception 'catégorie parente introuvable';
  end if;
  if new.level <> v_parent_level + 1 then
    raise exception 'niveau incohérent : parent au niveau %, enfant au niveau %',
      v_parent_level, new.level;
  end if;
  return new;
end;
$$;
revoke all on function zabelie_categories_depth_guard() from public, anon, authenticated;

create trigger zabelie_categories_depth
  before insert or update on zabelie_categories
  for each row execute function zabelie_categories_depth_guard();

-- ───────────────────────────── RLS ─────────────────────────────
alter table zabelie_categories enable row level security;

-- Lecture publique des seules catégories ACTIVES : un département fermé
-- n'existe pas pour le client (ni filtre, ni publication).
create policy zabelie_categories_read_active on zabelie_categories
  for select using (active);

revoke insert, update, delete on zabelie_categories from anon, authenticated;

-- ═══════════════════════ SEED — niveaux 1 et 2 ═══════════════════════

-- Départements (niveau 1). `active` suit l'arbitrage vague 1.
insert into zabelie_categories (slug, level, label_kr, label_fr, label_en, active, position) values
  ('otomobil-moto',   1, 'Otomobil & Moto',    'Auto & Moto',            'Automotive',            true,  10),
  ('elektwonik',      1, 'Elektwonik',         'Électronique',           'Electronics',           true,  20),
  ('mod-akseswa',     1, 'Mòd & Akseswa',      'Mode & accessoires',     'Fashion',               false, 30),
  ('soulye',          1, 'Soulye',             'Chaussures',             'Shoes',                 false, 40),
  ('sak-bagay',       1, 'Sak & Bagay',        'Sacs & bagagerie',       'Bags & luggage',        false, 50),
  ('bote-swen',       1, 'Bote & Swen',        'Beauté & soins',         'Beauty & care',         true,  60),
  ('savon-netwayaj',  1, 'Savon & Netwayaj',   'Savon & entretien',      'Soap & cleaning',       false, 70),
  ('manje-machandiz', 1, 'Manje & Machandiz',  'Alimentation & épicerie','Food & grocery',        false, 80),
  ('mache-agrikol',   1, 'Mache Agrikòl',      'Marché agricole',        'Agriculture',           false, 90),
  ('kay-kizin',       1, 'Kay & Kizin',        'Maison & cuisine',       'Home & kitchen',        false, 100),
  ('sante-byennet',   1, 'Sante & Byennèt',    'Santé & bien-être',      'Health & wellness',     false, 110),
  ('espo-lwazi',      1, 'Espò & Lwazi',       'Sport & loisirs',        'Sports & leisure',      false, 120),
  ('liv-papet',       1, 'Liv & Papèt',        'Livres & papeterie',     'Books & stationery',    false, 130),
  ('timoun-bebe',     1, 'Timoun & Bebe',      'Bébé & enfants',         'Baby & kids',           false, 140),
  ('atizana-kado',    1, 'Atizana & Kado',     'Artisanat & cadeaux',    'Crafts & gifts',        false, 150),
  ('dijital-sevis',   1, 'Dijital & Sèvis',    'Digital & services',     'Digital & services',    true,  160)
on conflict (slug) do nothing;

-- Catégories (niveau 2) — complet pour les 16 départements.
insert into zabelie_categories (parent_id, slug, level, label_kr, label_fr, label_en, active, position)
select p.id, v.slug, 2, v.kr, v.fr, v.en, v.active, v.pos
from (values
  -- 1. Auto & Moto : seules les pièces d'usure et consommables en vague 1.
  ('otomobil-moto','pyes-detache-oto','Pyès detache oto','Pièces détachées auto','Car parts',true,10),
  ('otomobil-moto','pyes-detache-moto','Pyès detache moto','Pièces détachées moto','Motorcycle parts',true,20),
  ('otomobil-moto','kawotchou-jant','Kawotchou & jant','Pneus & jantes','Tires & rims',false,30),
  ('otomobil-moto','luil-likid','Luil & likid','Huiles & liquides','Oils & fluids',true,40),
  ('otomobil-moto','akseswa-oto','Akseswa oto','Accessoires auto','Car accessories',false,50),
  ('otomobil-moto','ekipman-motosiklis','Ekipman motosiklis','Équipement motard','Rider gear',false,60),
  ('otomobil-moto','zouti-garaj','Zouti & garaj','Outillage & garage','Tools & garage',false,70),
  ('otomobil-moto','veyikil-2-wou','Veyikil 2 wou','Véhicules 2 roues','Two-wheelers',false,80),
  -- 2. Électronique
  ('elektwonik','telefon-tablet','Telefòn & tablèt','Téléphones & tablettes','Phones & tablets',true,10),
  ('elektwonik','akseswa-telefon','Akseswa telefòn','Accessoires téléphone','Phone accessories',true,20),
  ('elektwonik','enfomatik','Enfòmatik','Informatique','Computing',false,30),
  ('elektwonik','odyo-imaj','Odyo & imaj','Audio & vidéo','Audio & video',false,40),
  ('elektwonik','eneji-kouran','Enèji & kouran','Énergie & électricité','Power & energy',false,50),
  ('elektwonik','kamera-sekirite','Kamera & sekirite','Caméras & sécurité','Cameras & security',false,60),
  -- 3. Mode
  ('mod-akseswa','rad-fanm','Rad fanm','Vêtements femme','Women''s clothing',false,10),
  ('mod-akseswa','rad-gason','Rad gason','Vêtements homme','Men''s clothing',false,20),
  ('mod-akseswa','rad-timoun','Rad timoun','Vêtements enfant','Kids'' clothing',false,30),
  ('mod-akseswa','bijou-mont','Bijou & mont','Bijoux & montres','Jewelry & watches',false,40),
  ('mod-akseswa','akseswa-mod','Akseswa mòd','Accessoires de mode','Fashion accessories',false,50),
  -- 4. Chaussures
  ('soulye','soulye-fanm','Soulye fanm','Chaussures femme','Women''s shoes',false,10),
  ('soulye','soulye-gason','Soulye gason','Chaussures homme','Men''s shoes',false,20),
  ('soulye','soulye-timoun','Soulye timoun','Chaussures enfant','Kids'' shoes',false,30),
  ('soulye','antretyen-soulye','Antretyen soulye','Entretien chaussures','Shoe care',false,40),
  -- 5. Sacs
  ('sak-bagay','sak-fanm','Sak fanm','Sacs femme','Women''s bags',false,10),
  ('sak-bagay','sak-vwayaj','Sak vwayaj','Bagagerie','Luggage',false,20),
  ('sak-bagay','sak-lekol','Sak lekòl','Sacs scolaires','School bags',false,30),
  ('sak-bagay','sak-travay','Sak travay','Sacs professionnels','Work bags',false,40),
  -- 6. Beauté
  ('bote-swen','swen-cheve','Swen cheve','Soins capillaires','Hair care',true,10),
  ('bote-swen','swen-po','Swen po','Soins de la peau','Skin care',true,20),
  ('bote-swen','makiyaj','Makiyaj','Maquillage','Makeup',false,30),
  ('bote-swen','pafen','Pafen','Parfums','Fragrances',false,40),
  ('bote-swen','ijyen-pesonel','Ijyèn pèsonèl','Hygiène personnelle','Personal hygiene',false,50),
  ('bote-swen','apare-bote','Aparèy bote','Appareils de beauté','Beauty devices',false,60),
  -- 7. Savon & entretien
  ('savon-netwayaj','savon','Savon','Savons','Soaps',false,10),
  ('savon-netwayaj','lesiv','Lesiv','Lessive','Laundry',false,20),
  ('savon-netwayaj','netwayaj-kay','Netwayaj kay','Entretien maison','Home cleaning',false,30),
  ('savon-netwayaj','materyel-netwayaj','Materyèl netwayaj','Matériel de nettoyage','Cleaning tools',false,40),
  -- 8. Alimentation
  ('manje-machandiz','pwodwi-sek','Pwodwi sèk','Épicerie sèche','Dry goods',false,10),
  ('manje-machandiz','bwason','Bwason','Boissons','Beverages',false,20),
  ('manje-machandiz','pwodwi-lokal','Pwodwi lokal','Produits locaux','Local products',false,30),
  ('manje-machandiz','konsev-sos','Konsèv & sòs','Conserves & condiments','Canned & condiments',false,40),
  ('manje-machandiz','goute-bonbon','Goute & bonbon','Snacks & confiserie','Snacks & sweets',false,50),
  -- 9. Agricole
  ('mache-agrikol','legim-fwi','Legim & fwi','Fruits & légumes','Fresh produce',false,10),
  ('mache-agrikol','grenn-semans','Grenn & semans','Graines & semences','Seeds',false,20),
  ('mache-agrikol','zouti-agrikol','Zouti agrikòl','Outils agricoles','Farm tools',false,30),
  ('mache-agrikol','angre-tretman','Angrè & tretman','Engrais & traitements','Fertilizers',false,40),
  ('mache-agrikol','bet-pwovann','Bèt & pwovann','Élevage & aliments','Livestock & feed',false,50),
  -- 10. Maison
  ('kay-kizin','meb','Mèb','Mobilier','Furniture',false,10),
  ('kay-kizin','kizin','Kizin','Cuisine','Kitchenware',false,20),
  ('kay-kizin','elektwomenaje','Elektwomenaje','Électroménager','Appliances',false,30),
  ('kay-kizin','dekorasyon','Dekorasyon','Décoration','Home decor',false,40),
  ('kay-kizin','kabann-twal','Kabann & twal','Literie & linge','Bedding & linen',false,50),
  ('kay-kizin','konstriksyon','Konstriksyon','Bricolage & construction','Hardware & DIY',false,60),
  -- 11. Santé
  ('sante-byennet','parafamasi','Parafamasi','Parapharmacie','Healthcare',false,10),
  ('sante-byennet','pwodwi-natirel','Pwodwi natirèl','Produits naturels','Natural remedies',false,20),
  ('sante-byennet','materyel-medikal','Materyèl medikal','Matériel médical','Medical supplies',false,30),
  -- 12. Sport
  ('espo-lwazi','ekipman-espo','Ekipman espò','Équipement sportif','Sports equipment',false,10),
  ('espo-lwazi','rad-espo','Rad espò','Vêtements de sport','Sportswear',false,20),
  ('espo-lwazi','aktivite-deyo','Aktivite deyò','Plein air','Outdoor',false,30),
  ('espo-lwazi','jwet-lwazi','Jwèt & lwazi','Jeux & loisirs','Games & hobbies',false,40),
  -- 13. Livres
  ('liv-papet','liv','Liv','Livres','Books',false,10),
  ('liv-papet','founiti-lekol','Founiti lekòl','Fournitures scolaires','School supplies',false,20),
  ('liv-papet','founiti-biwo','Founiti biwo','Fournitures de bureau','Office supplies',false,30),
  ('liv-papet','atizay-kreyasyon','Atizay & kreyasyon','Arts créatifs','Arts & crafts',false,40),
  -- 14. Bébé
  ('timoun-bebe','swen-bebe','Swen bebe','Soins bébé','Baby care',false,10),
  ('timoun-bebe','materyel-bebe','Materyèl bebe','Équipement bébé','Baby gear',false,20),
  ('timoun-bebe','jwet','Jwèt','Jouets','Toys',false,30),
  -- 15. Artisanat
  ('atizana-kado','atizana-ayisyen','Atizana ayisyen','Artisanat haïtien','Haitian crafts',false,10),
  ('atizana-kado','tablo-atizay','Tablo & atizay','Art & tableaux','Art & paintings',false,20),
  ('atizana-kado','kado-fet','Kado & fèt','Cadeaux & fêtes','Gifts & party',false,30),
  ('atizana-kado','enstriman-mizik','Enstriman mizik','Instruments de musique','Musical instruments',false,40),
  -- 16. Digital & services (existant — reste ouvert)
  ('dijital-sevis','pwodwi-dijital','Pwodwi dijital','Produits digitaux','Digital products',true,10),
  ('dijital-sevis','sevis-pwofesyonel','Sèvis pwofesyonèl','Services professionnels','Professional services',true,20),
  ('dijital-sevis','rechaj-telefon','Rechaj telefòn','Recharge téléphone','Mobile top-up',true,30)
) as v(parent_slug, slug, kr, fr, en, active, pos)
join zabelie_categories p on p.slug = v.parent_slug and p.level = 1
on conflict (slug) do nothing;

-- ═══════════ SEED — niveau 3, branches ACTIVES en vague 1 uniquement ═══════

insert into zabelie_categories (parent_id, slug, level, label_kr, label_fr, label_en, active, position)
select p.id, v.slug, 3, v.kr, v.fr, v.en, true, v.pos
from (values
  -- Auto : pièces d'usure et consommables.
  ('pyes-detache-oto','filtrasyon-oto','Filtrasyon','Filtration (huile, air, carburant, habitacle)','Filters',10),
  ('pyes-detache-oto','fren-oto','Fren','Freinage (plaquettes, disques, étriers)','Brakes',20),
  ('pyes-detache-oto','batri-demaraj-oto','Batri & demaraj','Batteries, alternateurs, démarreurs, bougies','Battery & starting',30),
  ('pyes-detache-oto','kouwa-oto','Kouwa & chèn','Courroies et chaînes de distribution','Belts & chains',40),
  -- Moto : mêmes familles.
  ('pyes-detache-moto','filtrasyon-moto','Filtrasyon moto','Filtration moto','Motorcycle filters',10),
  ('pyes-detache-moto','fren-moto','Fren moto','Freinage moto','Motorcycle brakes',20),
  ('pyes-detache-moto','batri-moto','Batri moto','Batteries et allumage moto','Motorcycle battery',30),
  ('pyes-detache-moto','chen-pinyon','Chèn & pinyon','Chaînes, pignons et couronnes','Chains & sprockets',40),
  -- Huiles & liquides.
  ('luil-likid','luil-motè','Luil motè','Huile moteur','Engine oil',10),
  ('luil-likid','luil-bwat','Luil bwat','Huile de boîte et de pont','Gear oil',20),
  ('luil-likid','likid-fren','Likid fren','Liquide de frein','Brake fluid',30),
  ('luil-likid','likid-refwadisman','Likid refwadisman','Liquide de refroidissement','Coolant',40),
  ('luil-likid','aditif','Aditif','Additifs et traitements','Additives',50),
  -- Électronique vague 1.
  ('telefon-tablet','smartphone','Smartphone','Smartphones','Smartphones',10),
  ('telefon-tablet','telefon-senp','Telefòn senp','Téléphones simples','Feature phones',20),
  ('telefon-tablet','tablet','Tablèt','Tablettes','Tablets',30),
  ('telefon-tablet','pyes-telefon','Pyès telefòn','Pièces détachées téléphone (écrans, batteries)','Phone parts',40),
  ('akseswa-telefon','kes-pwoteksyon','Kès & pwoteksyon','Coques et protections d''écran','Cases & screen protection',10),
  ('akseswa-telefon','chaje-kab','Chajè & kab','Chargeurs et câbles','Chargers & cables',20),
  ('akseswa-telefon','powerbank','Powerbank','Batteries externes','Power banks',30),
  ('akseswa-telefon','ekoutè','Ekoutè','Écouteurs et oreillettes','Headphones',40),
  ('akseswa-telefon','kat-memwa','Kat memwa','Cartes mémoire','Memory cards',50),
  -- Beauté vague 1.
  ('swen-cheve','chanpou','Chanpou','Shampoings','Shampoos',10),
  ('swen-cheve','swen-mask','Swen & mask','Après-shampoings et masques','Conditioners & masks',20),
  ('swen-cheve','luil-cheve','Luil cheve','Huiles et sérums capillaires','Hair oils & serums',30),
  ('swen-cheve','mech-pewik','Mèch & pèwik','Mèches, extensions et perruques','Extensions & wigs',40),
  ('swen-cheve','très-kwochè','Très & kwochè','Tresses et crochets','Braids & crochet',50),
  ('swen-cheve','akseswa-kwafi','Akseswa kwafi','Accessoires coiffure','Hair accessories',60),
  ('swen-po','krem-figi','Krèm figi','Crèmes visage','Face creams',10),
  ('swen-po','krem-kò','Krèm kò','Laits et crèmes corps','Body lotions',20),
  ('swen-po','sewòm','Sewòm','Sérums','Serums',30),
  ('swen-po','pwoteksyon-solè','Pwoteksyon solè','Protections solaires','Sun protection',40),
  ('swen-po','bè-luil-natirèl','Bè & luil natirèl','Beurres et huiles naturelles (karité, coco, ricin)','Natural butters & oils',50)
) as v(parent_slug, slug, kr, fr, en, pos)
join zabelie_categories p on p.slug = v.parent_slug and p.level = 2
on conflict (slug) do nothing;
