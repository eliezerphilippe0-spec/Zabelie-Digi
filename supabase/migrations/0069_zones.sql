select zabelie_migration_garde('0069_zones.sql');

-- ============================================================================
-- 0069 — ZONES : la localisation déclarative des vendeurs (Phase 1)
-- ============================================================================
-- Chantier `docs/33-ZONES-LOCALISATION.md` (spec arbitrée le 2026-08-13).
-- Le vendeur déclare sa zone — Département → Commune → Quartier + point de
-- repère — et l'acheteur filtre par zone. AUCUNE permission navigateur,
-- aucune coordonnée exacte dans le schéma : la granularité maximale est le
-- quartier, c'est le garde-fou vie privée PAR CONSTRUCTION. GPS/PostGIS est
-- un chantier séparé (Phase 2), volontairement non commencé.
--
-- ─── CE QUI EXISTE DÉJÀ, ET COMMENT ON COHABITE (arbitrage Z-A) ─────────────
-- `profiles.region_code` (0014) porte le département ISO-3166-2 (`HT-ND`…)
-- et alimente `analytics_geo_ht`, la carte admin des talents. On ne casse
-- rien : `zabelie_zones` porte le code ISO au niveau `depatman`, et le
-- trigger de profil DÉRIVE `region_code` de la zone déclarée. La zone devient
-- la source quand elle existe ; `region_code` reste le maître pour les
-- profils sans zone (héritage 0014, la vue analytics continue de compter).
--
-- ─── LES LIBELLÉS (arbitrage Z-D) ───────────────────────────────────────────
-- Même forme que `zabelie_categories` (0035/0052) : `label_kr` + `label_fr`
-- obligatoires, `label_en`/`label_es` nullables avec repli sur `label_fr` —
-- des toponymes se traduisent rarement. ⚠️ Les graphies kreyòl du seed sont
-- de l'agent, best-effort, EN ATTENTE DE RELECTURE NATIVE — même statut que
-- l'espagnol de 0052, même marquage au registre à l'application.
--
-- ─── LE SLUG (arbitrage Z-E) ────────────────────────────────────────────────
-- Unicité PAR PARENT, pas globale : deux communes peuvent porter un quartier
-- homonyme. Les filtres s'adressent par `id` ; le slug sert aux URLs et au
-- seed. (`coalesce` sur l'uuid nul : deux `depatman` de même slug se heurtent
-- aussi — les index uniques de Postgres laissent passer les NULL sinon.)
--
-- ─── CE QUE CETTE MIGRATION NE FAIT PAS ─────────────────────────────────────
-- Pas de RPC : une taxonomie publique se lit par `select` sous RLS, comme
-- `zabelie_categories` (c'est le chemin que `/api/readyz` sonde déjà côté
-- catégories). Pas d'UI, pas de filtre catalogue (PR-Z2/Z3). Pas d'écriture
-- admin (PR-Z4, via `createAdminClient()` + `zabelie_admin_actions`).
-- ============================================================================

-- ── 1. La table ─────────────────────────────────────────────────────────────
create table zabelie_zones (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references zabelie_zones(id),
  level       text not null check (level in ('depatman', 'komin', 'katye')),
  -- Code ISO-3166-2, exactement au niveau depatman — le pont vers
  -- `profiles.region_code` (0014). Ni en-dessous, ni ailleurs.
  code        text unique
              check (code is null or code ~ '^HT-[A-Z]{2}$')
              check ((level = 'depatman') = (code is not null)),
  slug        text not null,
  label_kr    text not null,
  label_fr    text not null,
  label_en    text,
  label_es    text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index zabelie_zones_parent_idx on zabelie_zones (parent_id);
create unique index zabelie_zones_slug_scope on zabelie_zones
  (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);

comment on table zabelie_zones is
  'Hiérarchie géographique 3 niveaux (depatman > komin > katye), Phase 1 de docs/33. Granularité max = quartier : aucune coordonnée exacte, par construction. Libellés kreyòl du seed en attente de relecture native.';

-- ── 2. Le garde de hiérarchie (ZB069) ───────────────────────────────────────
-- Même forme que `zabelie_categories_depth_guard` (0035) : le niveau du
-- parent COMMANDE, la contrainte ne peut pas le voir seule.
create function zabelie_zones_hierarchy_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_parent_level text;
begin
  if new.level = 'depatman' then
    if new.parent_id is not null then
      raise exception 'ZB069 : un depatman n''a pas de parent';
    end if;
    return new;
  end if;

  if new.parent_id is null then
    raise exception 'ZB069 : % sans parent — komin exige un depatman, katye une komin',
      new.level;
  end if;

  select level into v_parent_level from zabelie_zones where id = new.parent_id;
  if v_parent_level is null then
    raise exception 'ZB069 : zone parente introuvable';
  end if;
  if new.level = 'komin'  and v_parent_level <> 'depatman' then
    raise exception 'ZB069 : une komin se rattache à un depatman, pas à %', v_parent_level;
  end if;
  if new.level = 'katye' and v_parent_level <> 'komin' then
    raise exception 'ZB069 : un katye se rattache à une komin, pas à %', v_parent_level;
  end if;
  return new;
end;
$$;
revoke all on function zabelie_zones_hierarchy_guard() from public, anon, authenticated;

create trigger zabelie_zones_hierarchy
  before insert or update on zabelie_zones
  for each row execute function zabelie_zones_hierarchy_guard();

-- ── 3. RLS ──────────────────────────────────────────────────────────────────
alter table zabelie_zones enable row level security;

-- Lecture publique des seules zones ACTIVES — même contrat que
-- `zabelie_categories_read_active` (0035) : une zone fermée n'existe pas
-- pour le client. Écritures : admin seulement, via service-role (PR-Z4),
-- journalisées dans `zabelie_admin_actions`.
create policy zabelie_zones_read_active on zabelie_zones
  for select using (is_active);

grant  select on zabelie_zones to anon, authenticated;
revoke insert, update, delete on zabelie_zones from anon, authenticated;

-- ── 4. Le vendeur déclare — deux colonnes sur `profiles` ────────────────────
-- `zabelie_vendors` n'existe pas : le vendeur EST un profil (`role =
-- 'creator'`). `profiles` est en lecture publique (0002) — c'est voulu, la
-- zone est l'info affichée à l'acheteur, volontairement grossière. L'UI ne
-- propose ces champs que dans le Seller Center (PR-Z3).
alter table profiles
  add column zone_id   uuid references zabelie_zones(id),
  add column pwen_repe text check (char_length(pwen_repe) <= 200);

create index profiles_zone_idx on profiles (zone_id) where zone_id is not null;

comment on column profiles.zone_id is
  'Zone déclarée (katye idéalement, komin acceptée — jamais depatman, ZB069). Source de region_code quand présente.';
comment on column profiles.pwen_repe is
  'Point de repère libre, public par construction (egz. « anfas legliz la ») — 200 caractères max.';

-- ── 5. La zone déclarée dérive `region_code` (arbitrage Z-A) ────────────────
-- Un vendeur qui choisit son quartier ne re-saisit pas son département : le
-- trigger remonte au depatman et pose son code ISO. `zone_id` null ne touche
-- RIEN — les profils de l'ère 0014 gardent leur region_code tel quel.
create function zabelie_profile_zone_sync()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_level  text;
  v_parent uuid;
  v_code   text;
begin
  if new.zone_id is null then
    return new;
  end if;

  select level, parent_id into v_level, v_parent
    from zabelie_zones where id = new.zone_id;

  -- Le FK garantit l'existence ; le NIVEAU, lui, se garde ici : une zone
  -- déclarée est une komin ou un katye, jamais un depatman entier (la
  -- granularité minimale utile à l'acheteur, docs/33 §3).
  if v_level not in ('komin', 'katye') then
    raise exception 'ZB069 : la zone déclarée doit être une komin ou un katye, pas %', v_level;
  end if;

  if v_level = 'katye' then
    select parent_id into v_parent from zabelie_zones where id = v_parent;
  end if;
  select code into v_code from zabelie_zones where id = v_parent;
  new.region_code := v_code;
  return new;
end;
$$;
revoke all on function zabelie_profile_zone_sync() from public, anon, authenticated;

create trigger zabelie_profile_zone_sync
  before insert or update of zone_id on profiles
  for each row execute function zabelie_profile_zone_sync();

-- ── 6. Seed ─────────────────────────────────────────────────────────────────
-- Les 10 départements (codes ISO-3166-2:HT — le référentiel que 0014 a déjà
-- choisi), les 19 communes du Nord, 5 quartiers du Cap. Le reste s'ajoute à
-- la demande via l'admin (PR-Z4, modération — arbitrage Z-C).
insert into zabelie_zones (level, code, slug, label_kr, label_fr) values
  ('depatman', 'HT-AR', 'artibonite', 'Latibonit', 'Artibonite'),
  ('depatman', 'HT-CE', 'centre',     'Sant',      'Centre'),
  ('depatman', 'HT-GA', 'grand-anse', 'Grandans',  'Grand''Anse'),
  ('depatman', 'HT-NI', 'nippes',     'Nip',       'Nippes'),
  ('depatman', 'HT-ND', 'nord',       'Nò',        'Nord'),
  ('depatman', 'HT-NE', 'nord-est',   'Nòdès',     'Nord-Est'),
  ('depatman', 'HT-NO', 'nord-ouest', 'Nòdwès',    'Nord-Ouest'),
  ('depatman', 'HT-OU', 'ouest',      'Lwès',      'Ouest'),
  ('depatman', 'HT-SD', 'sud',        'Sid',       'Sud'),
  ('depatman', 'HT-SE', 'sud-est',    'Sidès',     'Sud-Est');

insert into zabelie_zones (parent_id, level, slug, label_kr, label_fr)
select d.id, 'komin', v.slug, v.kr, v.fr
from (values
  ('cap-haitien',            'Okap',             'Cap-Haïtien'),
  ('limonade',               'Limonad',          'Limonade'),
  ('quartier-morin',         'Katye Moren',      'Quartier-Morin'),
  ('milot',                  'Milo',             'Milot'),
  ('plaine-du-nord',         'Plèn dinò',        'Plaine-du-Nord'),
  ('acul-du-nord',           'Akil dinò',        'Acul-du-Nord'),
  ('bahon',                  'Bawon',            'Bahon'),
  ('bas-limbe',              'Ba Lenbe',         'Bas-Limbé'),
  ('borgne',                 'Bòny',             'Borgne'),
  ('dondon',                 'Dondon',           'Dondon'),
  ('grande-riviere-du-nord', 'Grann Rivyè dinò', 'Grande-Rivière-du-Nord'),
  ('la-victoire',            'Lavictwa',         'La Victoire'),
  ('limbe',                  'Lenbe',            'Limbé'),
  ('pignon',                 'Pinyon',           'Pignon'),
  ('pilate',                 'Pilat',            'Pilate'),
  ('plaisance',              'Plezans',          'Plaisance'),
  ('port-margot',            'Pò Mago',          'Port-Margot'),
  ('ranquitte',              'Rankit',           'Ranquitte'),
  ('saint-raphael',          'Sen Rafayèl',      'Saint-Raphaël')
) as v(slug, kr, fr)
cross join (select id from zabelie_zones where code = 'HT-ND') d;

insert into zabelie_zones (parent_id, level, slug, label_kr, label_fr)
select k.id, 'katye', v.slug, v.kr, v.fr
from (values
  ('centre-ville',  'Sant vil',    'Centre-ville'),
  ('carenage',      'Karenaj',     'Carénage'),
  ('haut-du-cap',   'Odikap',      'Haut-du-Cap'),
  ('petite-anse',   'Petit Ans',   'Petite-Anse'),
  ('bande-du-nord', 'Bann dinò',   'Bande-du-Nord')
) as v(slug, kr, fr)
cross join (select id from zabelie_zones where level = 'komin' and slug = 'cap-haitien') k;

-- ── 7. POST-CONDITIONS — la migration prouve ce qu'elle affirme ─────────────
do $$
declare
  v_n integer;
begin
  select count(*) into v_n from zabelie_zones where level = 'depatman';
  if v_n <> 10 then
    raise exception 'ZB069 : % depatman au lieu de 10', v_n;
  end if;
  select count(*) into v_n from zabelie_zones where level = 'komin';
  if v_n <> 19 then
    raise exception 'ZB069 : % komin au lieu de 19 (le Nord en compte 19)', v_n;
  end if;
  select count(*) into v_n from zabelie_zones where level = 'katye';
  if v_n <> 5 then
    raise exception 'ZB069 : % katye au lieu de 5', v_n;
  end if;

  -- La requête jour-J de la spec (docs/33 §7) : hiérarchie sans orphelin.
  select count(*) into v_n
    from zabelie_zones z
    left join zabelie_zones p on p.id = z.parent_id
   where (z.level = 'komin'  and coalesce(p.level, '') <> 'depatman')
      or (z.level = 'katye'  and coalesce(p.level, '') <> 'komin')
      or (z.level = 'depatman' and z.parent_id is not null);
  if v_n <> 0 then
    raise exception 'ZB069 : % zone(s) orpheline(s) ou mal rattachée(s)', v_n;
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'zabelie_zones_hierarchy') then
    raise exception 'ZB069 : trigger de hiérarchie absent';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'zabelie_profile_zone_sync') then
    raise exception 'ZB069 : trigger de dérivation region_code absent';
  end if;
  if not exists (select 1 from pg_policies
                  where tablename = 'zabelie_zones' and policyname = 'zabelie_zones_read_active') then
    raise exception 'ZB069 : policy de lecture publique absente';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_name = 'profiles' and column_name = 'zone_id') then
    raise exception 'ZB069 : profiles.zone_id absente';
  end if;
end $$;
