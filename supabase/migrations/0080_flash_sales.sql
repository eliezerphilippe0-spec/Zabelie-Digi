select zabelie_migration_garde('0080_flash_sales.sql');

-- ============================================================================
-- 0080 — VENTES FLASH : un rabais borné dans le temps, jamais un prix client
-- ============================================================================
-- Signal porteur du 2026-08-15 : « implémente tout ce qui manque, avancer ».
-- Spec : docs/37 §B (mécanique Lightning Deals mesurée, adaptée au terrain).
--
-- ─── CE QUE CETTE MIGRATION NE FAIT PAS ────────────────────────────────────
-- Elle ne touche AUCUNE fonction d'argent. Le prix payé reste calculé par le
-- serveur au checkout (app/api/checkout) : la fenêtre y est relue au moment
-- de créer la commande, jamais crue depuis l'affichage. La commission se
-- calcule sur le prix payé — automatiquement, puisqu'elle se calcule sur
-- `orders.amount_htg` et que rien d'autre n'y écrit.
--
-- ─── L'EXPIRATION EST CALCULÉE, JAMAIS EXÉCUTÉE ────────────────────────────
-- Aucun cron. Une offre expirée est une comparaison `fin > now()` qui rend
-- faux — l'absence de signal ne peut pas faire vendre au mauvais prix
-- (docs/37 : le vert d'un cron raté ressemble à un prix flash éternel).
--
-- ─── LES BORNES SONT DES DÉFAUTS DE CONFIG, PAS DES DÉCISIONS ──────────────
-- 24 h / 10–70 % / 3 offres par vendeur : propositions de docs/37, inscrites
-- au registre OPS_TODO, modifiables par UPDATE — règle dure n°3, aucun
-- paramètre commercial en dur.
-- ============================================================================

-- ── 1. Configuration (ligne unique, règle dure n°3) ─────────────────────────
create table zabelie_flash_config (
  id                 boolean primary key default true check (id),
  duree_max_h        integer not null default 24 check (duree_max_h between 1 and 168),
  rabais_min_pct     integer not null default 10 check (rabais_min_pct between 1 and 90),
  rabais_max_pct     integer not null default 70 check (rabais_max_pct between 1 and 95),
  offres_max_vendeur integer not null default 3 check (offres_max_vendeur between 1 and 20),
  check (rabais_max_pct > rabais_min_pct)
);
insert into zabelie_flash_config default values;
comment on table zabelie_flash_config is
  'Bornes des ventes flash (docs/37 §B). Défauts PROPOSÉS (24h/10-70%/3), au registre OPS_TODO comme arbitrage — modifiables par UPDATE, jamais en dur.';
alter table zabelie_flash_config enable row level security;
-- Aucune policy : service-role seul. Les routes lisent les bornes côté serveur.

-- ── 2. Les offres ───────────────────────────────────────────────────────────
create table zabelie_flash_sales (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references products (id) on delete cascade,
  prix_flash_htg bigint not null check (prix_flash_htg > 0),
  debut          timestamptz not null default now(),
  fin            timestamptz not null,
  -- Plafond d'unités (le « progress bar » Lightning Deals). NULL = fenêtre
  -- seule. Compté au checkout sur les commandes non annulées de la fenêtre.
  unites_max     integer check (unites_max is null or unites_max > 0),
  annulee_a      timestamptz,
  created_at     timestamptz not null default now(),
  check (fin > debut)
);
create index zabelie_flash_produit_idx on zabelie_flash_sales (product_id, fin desc);
comment on table zabelie_flash_sales is
  'Offres flash (docs/37 §B). Le prix d''origine (products.price_htg) ne bouge JAMAIS — l''offre expire, le prix n''a pas à revenir. Montants entiers en HTG.';

alter table zabelie_flash_sales enable row level security;
-- Lecture publique : un prix flash est une information d'étalage.
create policy zabelie_flash_read on zabelie_flash_sales for select using (true);
-- Aucune policy d'écriture : la création passe par la route serveur, qui
-- vérifie la propriété du produit. Le trigger ci-dessous redit les bornes en
-- base — une route contournée ne peut pas contourner le trigger.

-- ── 3. ZB080 — les bornes redites en base ───────────────────────────────────
create function zabelie_flash_garde()
returns trigger
language plpgsql
as $$
declare
  v_cfg     zabelie_flash_config;
  v_product products;
  v_rabais  numeric;
  v_actives integer;
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

create trigger zabelie_flash_garde_trg
  before insert or update on zabelie_flash_sales
  for each row execute function zabelie_flash_garde();

-- ── 4. Post-conditions ──────────────────────────────────────────────────────
do $$
begin
  if (select count(*) from zabelie_flash_config) <> 1 then
    raise exception '0080 KO: la config doit porter exactement une ligne';
  end if;
  if not exists (
    select 1 from pg_trigger where tgname = 'zabelie_flash_garde_trg'
  ) then
    raise exception '0080 KO: trigger ZB080 absent';
  end if;
  if exists (
    select 1 from pg_policies
     where tablename = 'zabelie_flash_sales'
       and cmd in ('INSERT', 'UPDATE', 'DELETE')
  ) then
    raise exception '0080 KO: une policy d''écriture ouvre la table — service-role seul';
  end if;
  if (select count(*) from zabelie_flash_sales) <> 0 then
    raise exception '0080 KO: la table doit naître vide — aucune offre n''existe avant qu''un vendeur en crée';
  end if;
end $$;
