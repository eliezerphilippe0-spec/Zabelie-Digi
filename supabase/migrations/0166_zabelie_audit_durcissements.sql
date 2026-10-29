select zabelie_migration_garde('0166_zabelie_audit_durcissements.sql');

-- 0166 — Durcissements de l'AUDIT PRÉ-LANCEMENT du 2026-10-29 (docs/78 §4, §7).
-- Instruction directe du porteur : « applique aussi les correctifs ».
--
-- ─── CE QUE ÇA FERME ───────────────────────────────────────────────────────
--   M1  Une vente flash est validée contre `products.price_htg` : elle ne dit
--       rien d'une variante à un autre prix. Le trigger ZB080 refuse désormais
--       une offre sur un produit à PLUSIEURS variantes actives — la règle exacte
--       des rabais (0109, `variantes_multiples`), pas une règle nouvelle. Le
--       checkout, lui, n'applique plus l'offre à une unité dont le prix diffère
--       (app/api/checkout) : une variante ajoutée APRÈS l'offre paie son prix.
--   L2  L'adresse publique d'une boutique (`boutik_slug`) se fige côté client,
--       comme le rôle et la suspension : seule l'attribution serveur (service
--       role, `is(boutik_slug, null)`) l'écrit. Et « zabelie », « zabelie-… »
--       et les mots d'autorité (officiel, support…) rejoignent les noms
--       réservés : une boutique ne peut plus se présenter comme la plateforme.
--   L10 Défense en profondeur : `anon` perd INSERT/UPDATE/DELETE sur toutes les
--       tables publiques (aucune policy d'écriture ne laisse passer un visiteur
--       sans `auth.uid()` — mesuré le 2026-10-29), et `anon`/`authenticated`
--       perdent TRUNCATE, que RLS ne contrôle pas. Idem pour les tables à venir.
--
-- ─── CE QUE ÇA NE CHANGE PAS ───────────────────────────────────────────────
-- Aucune fonction d'argent, aucune écriture sur un solde, une commande ou un
-- paiement. Aucune donnée modifiée : les trois adresses existantes (bebeto,
-- eliezer, ruby) respectent la nouvelle forme, la sonde le vérifie.
-- `zabelie_flash_sales` est vide en production : aucune offre ne devient
-- invalide.

begin;

-- ── 1. M1 — ZB080 refuse une offre sur un produit à plusieurs variantes ───────
create or replace function zabelie_flash_garde()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_cfg      zabelie_flash_config;
  v_product  products;
  v_rabais   numeric;
  v_actives  integer;
  v_variants integer;
begin
  if tg_op = 'UPDATE' then
    -- Une offre ne se modifie pas : elle s'annule (annulee_a) ou elle expire.
    -- Modifier le prix d'une offre en cours changerait le contrat sous les
    -- yeux de l'acheteur qui a vu l'affiche.
    if new.product_id     is distinct from old.product_id
       or new.prix_flash_htg is distinct from old.prix_flash_htg
       or new.debut       is distinct from old.debut
       or new.fin         is distinct from old.fin
       or new.unites_max  is distinct from old.unites_max then
      raise exception 'ZB080: une offre flash ne se modifie pas — annulez-la (annulee_a) et créez-en une autre';
    end if;
    return new;
  end if;

  select * into v_cfg from zabelie_flash_config;

  select * into v_product from products where id = new.product_id;
  if v_product.status <> 'published' then
    raise exception 'ZB080: produit non publié — une offre flash sur un brouillon est une affiche sans magasin';
  end if;

  -- 0166 (audit M1) : le prix flash est comparé à `price_htg` ci-dessous ; il
  -- ne dit rien d'une variante à un autre prix. Même règle que les rabais
  -- (0109) : on réduit le prix d'UNE variante, pas d'un produit à plusieurs.
  select count(*) into v_variants
    from zabelie_product_variants
   where product_id = new.product_id and active;
  if v_variants > 1 then
    raise exception using
      errcode = 'ZB166',
      message = 'ZB080: plusieurs variantes actives — une vente flash vaut pour un seul prix';
  end if;

  if new.prix_flash_htg >= v_product.price_htg then
    raise exception 'ZB080: le prix flash (%) doit être INFÉRIEUR au prix courant (%)',
      new.prix_flash_htg, v_product.price_htg;
  end if;

  v_rabais := 100 - (new.prix_flash_htg::numeric * 100 / v_product.price_htg);
  if v_rabais < v_cfg.rabais_min_pct then
    raise exception 'ZB080: rabais de %%% — sous le minimum de %%%, « flash » serait un mensonge marketing',
      round(v_rabais), v_cfg.rabais_min_pct;
  end if;
  if v_rabais > v_cfg.rabais_max_pct then
    raise exception 'ZB080: rabais de %%% — au-delà de %%%, une erreur de saisie est plus probable qu''une intention',
      round(v_rabais), v_cfg.rabais_max_pct;
  end if;

  if new.fin - new.debut > make_interval(hours => v_cfg.duree_max_h) then
    raise exception 'ZB080: fenêtre de plus de % h', v_cfg.duree_max_h;
  end if;

  -- Une seule offre VIVANTE par produit — le chevauchement est un double prix.
  if exists (
    select 1 from zabelie_flash_sales f
     where f.product_id = new.product_id
       and f.annulee_a is null
       and f.fin > now()
       and tstzrange(f.debut, f.fin) && tstzrange(new.debut, new.fin)
  ) then
    raise exception 'ZB080: une offre est déjà active sur ce produit';
  end if;

  -- L'urgence ne survit pas à l'abondance : plafond d'offres par vendeur.
  select count(*) into v_actives
    from zabelie_flash_sales f
    join products p on p.id = f.product_id
   where p.seller_id = v_product.seller_id
     and f.annulee_a is null
     and f.fin > now();
  if v_actives >= v_cfg.offres_max_vendeur then
    raise exception 'ZB080: % offres actives — le plafond est %', v_actives, v_cfg.offres_max_vendeur;
  end if;

  return new;
end;
$$;

-- ── 2. L2 — l'adresse publique se fige côté client ───────────────────────────
create or replace function protect_profile_privileges()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Rôles privilégiés (service_role via PostgREST, migrations) : aucun garde-fou.
  if current_user in (
    'service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin'
  ) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.role := 'buyer';       -- pas d'auto-attribution admin/creator à l'inscription
    new.tier := 'standard';    -- pas d'auto-attribution elite
    new.suspended_at     := null;
    new.suspended_reason := null;
    new.suspended_by     := null;
    new.created_at       := now();            -- l'inscription, pas une date choisie
    new.boutik_slug      := null;             -- attribuée par le serveur (0166)
  elsif tg_op = 'UPDATE' then
    new.role := old.role;      -- role figé côté client
    new.tier := old.tier;      -- tier figé côté client
    new.suspended_at     := old.suspended_at;     -- suspension figée côté client
    new.suspended_reason := old.suspended_reason;
    new.suspended_by     := old.suspended_by;
    new.created_at       := old.created_at;       -- date d'inscription figée (0144)
    new.id               := old.id;
    new.boutik_slug      := old.boutik_slug;      -- adresse publique figée côté client (0166)
  end if;
  return new;
end;
$$;

-- ── 3. L2 — la plateforme et ses mots d'autorité ne sont pas des boutiques ────
alter table profiles drop constraint zabelie_boutik_slug_forme;
alter table profiles
  add constraint zabelie_boutik_slug_forme
  check (
    boutik_slug is null
    or (
      boutik_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      and length(boutik_slug) between 2 and 40
      and boutik_slug not in (
        'admin','api','boutik','catalogue','createur','connexion','aide',
        'vendre','panier','rechaj','pro','talents','produit','nouveau','new',
        'officiel','official','support','assistance','securite','service-client'
      )
      and boutik_slug !~ '^zabelie(-|$)'
    )
  );

-- ── 4. L10 — aucune écriture anonyme, aucun TRUNCATE hors service ───────────
do $$
declare
  r record;
begin
  for r in
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('revoke insert, update, delete, truncate on table public.%I from anon', r.relname);
    execute format('revoke truncate on table public.%I from authenticated', r.relname);
  end loop;
end $$;
alter default privileges in schema public revoke insert, update, delete, truncate on tables from anon;
alter default privileges in schema public revoke truncate on tables from authenticated;

-- ── 5. Post-conditions ──────────────────────────────────────────────────────
do $$
declare
  v_def text;
  v_n   integer;
begin
  v_def := pg_get_functiondef('public.zabelie_flash_garde()'::regprocedure);
  if v_def !~ 'v_variants > 1' or v_def !~ 'ZB166' then
    raise exception '0166 KO: ZB080 ne refuse pas un produit à plusieurs variantes';
  end if;

  v_def := pg_get_functiondef('public.protect_profile_privileges()'::regprocedure);
  if v_def !~ 'new\.boutik_slug\s*:= old\.boutik_slug' or v_def !~ 'new\.role := old\.role'
     or v_def !~ 'new\.suspended_at\s*:= old\.suspended_at' or v_def !~ 'new\.created_at\s*:= old\.created_at' then
    raise exception '0166 KO: protect_profile_privileges a perdu un garde';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_protect_profile_privileges' and tgenabled = 'O') then
    raise exception '0166 KO: trg_protect_profile_privileges absent ou désactivé';
  end if;

  select count(*) into v_n
    from profiles
   where boutik_slug ~ '^zabelie(-|$)'
      or boutik_slug in ('officiel','official','support','assistance','securite','service-client');
  if v_n <> 0 then
    raise exception '0166 KO: % adresse(s) existante(s) désormais réservée(s)', v_n;
  end if;

  select count(*) into v_n
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and (has_table_privilege('anon', c.oid, 'INSERT') or has_table_privilege('anon', c.oid, 'UPDATE')
          or has_table_privilege('anon', c.oid, 'DELETE') or has_table_privilege('anon', c.oid, 'TRUNCATE')
          or has_table_privilege('authenticated', c.oid, 'TRUNCATE'));
  if v_n <> 0 then
    raise exception '0166 KO: % table(s) gardent une écriture anonyme ou un TRUNCATE', v_n;
  end if;

  raise notice '0166 OK — flash a une variante, adresse figee, ecritures anonymes retirees';
end $$;

commit;
