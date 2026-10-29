select zabelie_migration_garde('0158_zabelie_seller_service_zones.sql');

-- 0158 — Zones de service des vendeurs (docs/77 §8, lot 2 ; décision du porteur
-- du 2026-10-29).
--
-- ─── CE QUE C'EST ──────────────────────────────────────────────────────────
-- Zabelie ne livre pas : le vendeur fait sa propre remise (docs/26). Il déclare
-- donc, en plus de l'endroit où il est installé (`profiles.zone_id`, 0069), les
-- zones où il livre — une ou plusieurs, au niveau qu'il veut : un quartier, une
-- commune, ou un département entier. L'acheteur lit « dessert votre commune »,
-- ATTRIBUÉ au vendeur. Zabelie ne garantit ni délai ni couverture.
--
-- ─── CE QUE ÇA N'EST PAS ───────────────────────────────────────────────────
-- Pas une coordonnée : la granularité maximale reste le quartier (0069), aucune
-- position précise n'existe nulle part. Pas un verrou : la zone classe, elle
-- n'interdit pas (un acheteur de la diaspora commande pour un proche resté en
-- Haïti). Pas une donnée personnelle : c'est une information commerciale que
-- le vendeur choisit de publier, au même titre que sa zone d'installation.
--
-- ─── QUI ÉCRIT, QUI LIT ────────────────────────────────────────────────────
-- • Lecture : publique (anon, authenticated). Une zone desservie se montre à
--   l'acheteur, c'est son seul usage.
-- • Écriture : le vendeur sur SES lignes, sous sa session (RLS) — pas de
--   service-role, donc aucun chemin où un identifiant fourni par l'appelant
--   remplacerait celui de la session. `insert` et `delete` seulement : une zone
--   desservie se pose ou se retire, elle ne se modifie pas (aucun `update`).
-- • Pas de condition de rôle, et c'est voulu : le rôle `creator` n'est promu
--   qu'à la création du premier produit (lib/product-draft.ts), donc exiger ce
--   rôle empêcherait un vendeur de déclarer ses zones À L'INSCRIPTION, avant
--   de publier — ce que la décision du porteur demande. Une ligne posée par un
--   compte qui ne vend pas ne produit rien : le classement ne lit que les zones
--   des vendeurs dont une offre est publiée. Le plafond borne le reste.
--
-- ─── LES GARDES (ZB158) ────────────────────────────────────────────────────
-- Un trigger refuse (1) une zone inconnue ou fermée — la RLS de `zabelie_zones`
-- (0069) ne montre que les actives, le trigger s'exécute sous la même session —
-- et (2) le dépassement du plafond. Le plafond est un PARAMÈTRE COMMERCIAL :
-- il vit en table de config (CLAUDE.md, règle dure n°3), jamais en dur.
-- Le verrou consultatif sérialise deux ajouts simultanés du même vendeur : sans
-- lui, deux requêtes parallèles passeraient chacune sous le plafond.
--
-- ─── CE QUE CETTE MIGRATION NE FAIT PAS ────────────────────────────────────
-- Aucune fonction `security definer`, aucune RPC (donc rien à ajouter à la
-- sonde zabelie_objets_requis : le code lit ces tables par `select` sous RLS),
-- aucun `drop`. Elle ne touche ni commandes, ni paiements, ni grand livre.

begin;

-- ── 1. Le plafond, en config ────────────────────────────────────────────────
create table zabelie_service_zone_config (
  id         boolean primary key default true check (id),
  max_zones  integer not null default 20 check (max_zones between 1 and 100)
);
comment on table zabelie_service_zone_config is
  'Parametres des zones de service des vendeurs (0158). Une seule ligne. Plafond de zones par vendeur : valeur commerciale, jamais en dur.';
insert into zabelie_service_zone_config (id) values (true);

alter table zabelie_service_zone_config enable row level security;
create policy zabelie_service_zone_config_read on zabelie_service_zone_config
  for select using (true);
revoke all on zabelie_service_zone_config from public, anon, authenticated;
grant select on zabelie_service_zone_config to anon, authenticated;

-- ── 2. Les zones desservies ─────────────────────────────────────────────────
create table zabelie_seller_service_zones (
  seller_id   uuid not null references profiles (id) on delete cascade,
  zone_id     uuid not null references zabelie_zones (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (seller_id, zone_id)
);
create index zabelie_seller_service_zones_zone_idx
  on zabelie_seller_service_zones (zone_id);
comment on table zabelie_seller_service_zones is
  'Zones ou un vendeur declare livrer (0158). Declaratif : Zabelie ne livre pas et ne garantit aucun delai. Granularite max = quartier, aucune coordonnee.';

alter table zabelie_seller_service_zones enable row level security;

create policy zabelie_seller_service_zones_read on zabelie_seller_service_zones
  for select using (true);

create policy zabelie_seller_service_zones_insert on zabelie_seller_service_zones
  for insert to authenticated
  with check (seller_id = auth.uid());

create policy zabelie_seller_service_zones_delete on zabelie_seller_service_zones
  for delete to authenticated
  using (seller_id = auth.uid());

-- ── 3. Le garde (ZB158) ─────────────────────────────────────────────────────
create function zabelie_service_zone_garde()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_max integer;
  v_nb  integer;
begin
  -- Zone connue ET active : la lecture passe par la RLS de 0069, qui masque
  -- les zones fermees. Une zone fermee est donc « introuvable », comme pour
  -- tout autre client.
  if not exists (select 1 from zabelie_zones where id = new.zone_id) then
    raise exception 'ZB158 : zone introuvable ou fermee';
  end if;

  perform pg_advisory_xact_lock(hashtext('zabelie_service_zones:' || new.seller_id::text));

  select max_zones into v_max from zabelie_service_zone_config where id;
  select count(*) into v_nb from zabelie_seller_service_zones where seller_id = new.seller_id;
  if v_nb >= coalesce(v_max, 20) then
    raise exception 'ZB158 : plafond de % zones de service atteint', coalesce(v_max, 20);
  end if;
  return new;
end;
$$;
revoke all on function zabelie_service_zone_garde() from public, anon, authenticated;

create trigger zabelie_service_zone_garde_trg
  before insert on zabelie_seller_service_zones
  for each row execute function zabelie_service_zone_garde();

-- ── 4. Les droits ───────────────────────────────────────────────────────────
-- Piège Supabase : `anon` et `authenticated` reçoivent des droits par défaut
-- sur toute nouvelle table ; on les retire d'abord, puis on rend le strict
-- nécessaire. Pas d'`update`.
revoke all on zabelie_seller_service_zones from public, anon, authenticated;
grant select on zabelie_seller_service_zones to anon, authenticated;
grant insert, delete on zabelie_seller_service_zones to authenticated;

-- ── 5. Post-conditions — la migration se prouve avant de se déclarer faite ──
do $$
declare
  v_nb integer;
begin
  select count(*) into v_nb from zabelie_service_zone_config;
  if v_nb <> 1 then
    raise exception '0158 KO: la config doit porter exactement une ligne (%)', v_nb;
  end if;

  if not (select relrowsecurity from pg_class where oid = 'zabelie_seller_service_zones'::regclass) then
    raise exception '0158 KO: RLS inactive sur zabelie_seller_service_zones';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'zabelie_service_zone_config'::regclass) then
    raise exception '0158 KO: RLS inactive sur zabelie_service_zone_config';
  end if;

  if not has_table_privilege('anon', 'zabelie_seller_service_zones', 'select') then
    raise exception '0158 KO: anon doit pouvoir lire les zones desservies';
  end if;
  if has_table_privilege('anon', 'zabelie_seller_service_zones', 'insert')
     or has_table_privilege('anon', 'zabelie_seller_service_zones', 'delete') then
    raise exception '0158 KO: anon ne doit pas ecrire';
  end if;
  if has_table_privilege('authenticated', 'zabelie_seller_service_zones', 'update') then
    raise exception '0158 KO: aucun update : une zone desservie se pose ou se retire';
  end if;
  if not (has_table_privilege('authenticated', 'zabelie_seller_service_zones', 'insert')
          and has_table_privilege('authenticated', 'zabelie_seller_service_zones', 'delete')) then
    raise exception '0158 KO: authenticated doit pouvoir poser et retirer';
  end if;
  if has_table_privilege('authenticated', 'zabelie_service_zone_config', 'insert')
     or has_table_privilege('authenticated', 'zabelie_service_zone_config', 'update') then
    raise exception '0158 KO: la config ne s''ecrit pas depuis le client';
  end if;

  if (select prosecdef from pg_proc where proname = 'zabelie_service_zone_garde') then
    raise exception '0158 KO: le garde doit rester SECURITY INVOKER (il lit zabelie_zones sous RLS)';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'zabelie_seller_service_zones'::regclass
                    and tgname = 'zabelie_service_zone_garde_trg') then
    raise exception '0158 KO: trigger de garde absent';
  end if;
  raise notice '0158 OK — zones de service posees';
end $$;

commit;
