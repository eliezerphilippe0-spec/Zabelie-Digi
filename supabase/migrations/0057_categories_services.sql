-- 0057 — Ouvrir l'éventail des SERVICES (demande porteur 2026-08-11).
--
-- État mesuré en base avant écriture : sous le rayon `dijital-sevis`, un seul
-- nœud de service — `sevis-pwofesyonel` (« Services professionnels »), sans
-- aucun enfant. Un vendeur qui propose un cours par Zoom, une coupe de
-- cheveux ou une réparation de téléphone n'avait donc qu'une case
-- fourre-tout, et l'acheteur aucun moyen de parcourir par métier.
--
-- Ce que cette migration ajoute : DOUZE feuilles de niveau 3 sous
-- `sevis-pwofesyonel`, choisies sur ce qui se vend réellement en Haïti et
-- dans la diaspora — pas sur un catalogue générique de marketplace.
--
-- ⚠️ Aucune donnée existante n'est touchée : que des insertions, toutes
-- idempotentes (`on conflict (slug) do nothing`). Rejouer la migration ne
-- duplique rien et n'écrase aucun libellé qu'un humain aurait retouché.
--
-- Libellés dans les trois langues portées par la table (`label_kr`,
-- `label_fr`, `label_en`). L'espagnol vit dans `0052`, non appliquée : quand
-- elle le sera, ces lignes recevront `label_es` par la même voie que les
-- autres — elles ne créent pas de dette nouvelle.
--
-- Le kreyòl est la langue de référence : c'est lui qui nomme, le français et
-- l'anglais traduisent.
--
-- ⚠️ Le `slug` est UNIQUE À TOUTE LA TABLE, pas au sein d'un parent. La
-- première rédaction employait `konstriksyon`, déjà pris par un sous-rayon
-- de `kay-kizin` (matériaux de construction) : `on conflict do nothing`
-- l'avalait en silence et 11 feuilles sur 12 arrivaient. C'est la
-- post-condition ci-dessous — et elle seule — qui l'a fait voir, sur la base
-- de répétition. D'où `sevis-konstriksyon` : le préfixe dit le rayon.

do $$
declare
  v_parent uuid;
  v_pos    integer;
begin
  select id into v_parent from zabelie_categories where slug = 'sevis-pwofesyonel';
  if v_parent is null then
    raise exception '0057: le rayon sevis-pwofesyonel est introuvable'
      using errcode = 'ZB057';
  end if;

  -- On repart APRÈS la dernière position existante : si un enfant a été
  -- ajouté à la main entre-temps, on ne lui marche pas dessus.
  select coalesce(max(position), 0) into v_pos
  from zabelie_categories where parent_id = v_parent;

  insert into zabelie_categories (parent_id, level, slug, label_kr, label_fr, label_en, active, position)
  select v_parent, 3, s.slug, s.kr, s.fr, s.en, true, v_pos + s.rang
  from (values
    ('kou-ak-fòmasyon',   'Kou ak fòmasyon',      'Cours & formation',        'Classes & training',      10),
    ('tradiksyon',        'Tradiksyon',           'Traduction',               'Translation',             20),
    ('konsèy-ak-jesyon',  'Konsèy ak jesyon',     'Conseil & gestion',        'Consulting & admin',      30),
    ('grafik-ak-design',  'Grafik ak design',     'Graphisme & design',       'Graphics & design',       40),
    ('foto-ak-videyo',    'Foto ak videyo',       'Photo & vidéo',            'Photo & video',           50),
    ('mizik-ak-son',      'Mizik ak son',         'Musique & son',            'Music & audio',           60),
    ('devlopman-web',     'Devlopman web ak app', 'Développement web & app',  'Web & app development',   70),
    ('maketin-rezo',      'Maketin ak rezo sosyal','Marketing & réseaux sociaux','Marketing & social',   80),
    ('bote-ak-swen',      'Bote ak swen',         'Beauté & soins',           'Beauty & care',           90),
    ('reparasyon',        'Reparasyon',           'Réparation & dépannage',   'Repair & maintenance',   100),
    ('sevis-konstriksyon','Konstriksyon ak metye','Construction & métiers',   'Construction & trades',  110),
    ('evenman-ak-treteur','Evènman ak tretè',     'Événementiel & traiteur',  'Events & catering',      120)
  ) as s(slug, kr, fr, en, rang)
  on conflict (slug) do nothing;

  -- Post-condition DANS la migration : si l'insertion n'a rien produit ET
  -- que les feuilles n'existent pas déjà, quelque chose a échoué en silence.
  if (select count(*) from zabelie_categories
      where parent_id = v_parent and level = 3) < 12 then
    raise exception '0057: moins de 12 feuilles de service après insertion'
      using errcode = 'ZB057';
  end if;

  raise notice '0057 — feuilles de service sous sevis-pwofesyonel : %',
    (select count(*) from zabelie_categories where parent_id = v_parent and level = 3);
end;
$$;
