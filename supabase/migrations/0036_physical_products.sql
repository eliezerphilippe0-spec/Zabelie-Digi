-- ============================================================================
-- 0036 — Chantier B : produits physiques, variantes, stock, compatibilité
-- ============================================================================
-- UNITÉ MONÉTAIRE — écart assumé avec la spec, motivé :
-- la spec demande des prix « en centimes entiers ». Tout le money-path existant
-- (orders.amount_htg, commission, escrow, wallet_transactions, ledger topup)
-- est en GOURDES ENTIÈRES. Introduire des centimes au niveau variante
-- imposerait une conversion à chaque étape — division, arrondi, et une classe
-- entière de bugs de rapprochement sur un système où les montants doivent
-- concorder à l'unité près. On conserve donc l'entier en gourdes : l'intention
-- de la spec (« entiers, jamais de flottant ») est respectée, la cohérence
-- d'unité aussi.
--
-- STOCK — invariant :
--     stock physique en main  =  quantity_available + quantity_reserved
--   réserver  : available −q · reserved +q   (total inchangé)
--   consommer : reserved −q                  (total baisse — vendu)
--   libérer   : reserved −q · available +q   (total inchangé)
-- Le stock est décrémenté À LA RÉSERVATION (commande), jamais à la livraison :
-- deux acheteurs ne peuvent pas acheter la même unité.
-- ============================================================================

alter type product_kind add value if not exists 'physical';

-- ───────────────────── 1. Extension « produit physique » ────────────────────

create table zabelie_physical_products (
  product_id   uuid primary key references products (id) on delete cascade,
  category_id  uuid not null references zabelie_categories (id),
  weight_grams integer not null check (weight_grams > 0 and weight_grams <= 200000),
  length_mm    integer check (length_mm > 0),
  width_mm     integer check (width_mm > 0),
  height_mm    integer check (height_mm > 0),
  fragile      boolean not null default false,
  -- Hors grille de port standard (mobilier, électroménager, pièces lourdes) :
  -- docs/16 note 5. Le calcul des frais s'y réfère au chantier D.
  bulky        boolean not null default false,
  created_at   timestamptz not null default now()
);
create index zabelie_physical_category_idx on zabelie_physical_products (category_id);

alter table zabelie_physical_products enable row level security;
-- Lecture publique : la fiche produit est publique, la RLS de `products`
-- gouverne déjà ce qui est visible.
create policy zabelie_physical_read on zabelie_physical_products
  for select using (true);
revoke insert, update, delete on zabelie_physical_products from anon, authenticated;

-- ───────────────────────────── 2. Variantes ─────────────────────────────────

create table zabelie_product_variants (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  sku        text not null unique,
  -- {"couleur": "noir", "taille": "M"} — libre, mais validé à la publication.
  options    jsonb not null default '{}'::jsonb,
  price_htg  integer not null check (price_htg > 0),
  active     boolean not null default true,
  position   smallint not null default 0,
  created_at timestamptz not null default now()
);
create index zabelie_variants_product_idx on zabelie_product_variants (product_id, position);

alter table zabelie_product_variants enable row level security;
create policy zabelie_variants_read on zabelie_product_variants
  for select using (active);
revoke insert, update, delete on zabelie_product_variants from anon, authenticated;

-- ─────────────────────────────── 3. Stock ───────────────────────────────────

create table zabelie_stock (
  variant_id         uuid primary key references zabelie_product_variants (id) on delete cascade,
  quantity_available integer not null default 0 check (quantity_available >= 0),
  quantity_reserved  integer not null default 0 check (quantity_reserved >= 0),
  alert_threshold    integer not null default 0 check (alert_threshold >= 0),
  updated_at         timestamptz not null default now()
);

alter table zabelie_stock enable row level security;
create policy zabelie_stock_read on zabelie_stock for select using (true);
revoke insert, update, delete on zabelie_stock from anon, authenticated;

-- ──────────────────────────── 4. Réservations ───────────────────────────────

create type stock_reservation_status as enum ('held', 'consumed', 'released');

create table zabelie_stock_reservations (
  id         uuid primary key default gen_random_uuid(),
  variant_id uuid not null references zabelie_product_variants (id) on delete restrict,
  order_id   uuid not null references orders (id) on delete cascade,
  quantity   integer not null check (quantity > 0),
  status     stock_reservation_status not null default 'held',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  -- Une seule réservation par (commande, variante) : rend la réservation
  -- idempotente sans logique applicative.
  constraint stock_reservation_unique unique (order_id, variant_id)
);
create index zabelie_reservations_due_idx on zabelie_stock_reservations (expires_at)
  where status = 'held';

alter table zabelie_stock_reservations enable row level security;
revoke insert, update, delete on zabelie_stock_reservations from anon, authenticated;

-- Délai de validité d'une réservation non payée — en config, jamais en dur.
create table zabelie_stock_limits (
  key text primary key,
  value integer not null,
  comment text,
  updated_at timestamptz not null default now()
);
insert into zabelie_stock_limits (key, value, comment) values
  ('reservation_ttl_minutes', 30,
   'Durée de vie d''une réservation non payée. Au-delà, le stock est relibéré. 30 min couvre un paiement MonCash sur 3G lente.');
alter table zabelie_stock_limits enable row level security;
revoke all on zabelie_stock_limits from anon, authenticated;

-- ───────────────── 5. RPC — réservation ATOMIQUE (anti-survente) ────────────

create function zabelie_reserve_stock(
  p_variant_id uuid,
  p_order_id   uuid,
  p_quantity   integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_available integer;
  v_ttl       integer;
  v_existing  zabelie_stock_reservations;
  v_stale     record;
begin
  if p_quantity is null or p_quantity <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'quantite_invalide');
  end if;

  select coalesce(max(value), 30) into v_ttl
    from zabelie_stock_limits where key = 'reservation_ttl_minutes';

  -- EXPIRATION PARESSEUSE (contrainte Vercel Hobby : crons quotidiens
  -- uniquement). Sans elle, un panier abandonné bloquerait l'unité jusqu'au
  -- prochain passage du cron — jusqu'à 24 h sur du mono-unité, une vente
  -- perdue à chaque fois. Ici, les réservations échues de CETTE variante sont
  -- libérées au moment exact où quelqu'un d'autre veut l'unité — le seul
  -- moment où ça compte. Même ordre de verrouillage que le cron
  -- (réservation → stock) : pas d'interblocage possible entre les deux.
  for v_stale in
    select * from zabelie_stock_reservations
     where variant_id = p_variant_id and status = 'held' and expires_at < now()
       and order_id <> p_order_id
     for update skip locked
  loop
    update zabelie_stock
       set quantity_reserved  = quantity_reserved - v_stale.quantity,
           quantity_available = quantity_available + v_stale.quantity,
           updated_at = now()
     where variant_id = v_stale.variant_id;
    update zabelie_stock_reservations set status = 'released' where id = v_stale.id;
  end loop;

  -- Réservation déjà existante pour cette (commande, variante).
  select * into v_existing from zabelie_stock_reservations
   where order_id = p_order_id and variant_id = p_variant_id;
  if found then
    -- Encore tenue : rejeu (double-clic, retry réseau) → no-op.
    if v_existing.status = 'held' then
      return jsonb_build_object('ok', true, 'duplicate', true,
                                'reservation_id', v_existing.id);
    end if;
    -- Déjà payée : rien à re-réserver.
    if v_existing.status = 'consumed' then
      return jsonb_build_object('ok', false, 'reason', 'deja_consomme');
    end if;
    -- LIBÉRÉE (session de paiement expirée, très fréquent sur 3G) : l'acheteur
    -- doit pouvoir reprendre sa commande. On RÉ-ACQUIERT le stock si toujours
    -- disponible — sans ce cas, la contrainte d'unicité rendrait la commande
    -- définitivement impayable.
    select quantity_available into v_available
      from zabelie_stock where variant_id = p_variant_id for update;
    if coalesce(v_available, 0) < p_quantity then
      return jsonb_build_object('ok', false, 'reason', 'stock_insuffisant',
                                'disponible', coalesce(v_available, 0));
    end if;
    update zabelie_stock
       set quantity_available = quantity_available - p_quantity,
           quantity_reserved  = quantity_reserved + p_quantity,
           updated_at = now()
     where variant_id = p_variant_id;
    update zabelie_stock_reservations
       set status = 'held', quantity = p_quantity,
           expires_at = now() + make_interval(mins => v_ttl)
     where id = v_existing.id;
    return jsonb_build_object('ok', true, 'duplicate', false, 'renewed', true,
                              'reservation_id', v_existing.id);
  end if;

  -- LE verrou : sérialise toutes les tentatives sur cette variante. C'est ici
  -- que se joue l'absence de survente.
  select quantity_available into v_available
    from zabelie_stock where variant_id = p_variant_id for update;
  if v_available is null then
    return jsonb_build_object('ok', false, 'reason', 'variante_sans_stock');
  end if;
  if v_available < p_quantity then
    return jsonb_build_object('ok', false, 'reason', 'stock_insuffisant',
                              'disponible', v_available);
  end if;

  update zabelie_stock
     set quantity_available = quantity_available - p_quantity,
         quantity_reserved  = quantity_reserved + p_quantity,
         updated_at = now()
   where variant_id = p_variant_id;

  insert into zabelie_stock_reservations (variant_id, order_id, quantity, expires_at)
  values (p_variant_id, p_order_id, p_quantity,
          now() + make_interval(mins => v_ttl))
  returning * into v_existing;

  return jsonb_build_object('ok', true, 'duplicate', false,
                            'reservation_id', v_existing.id,
                            'expires_at', v_existing.expires_at);
end;
$$;
revoke all on function zabelie_reserve_stock(uuid, uuid, integer)
  from public, anon, authenticated;

-- ───────────── 6. RPC — consommation (paiement confirmé) ────────────────────

create function zabelie_consume_stock(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r     record;
  v_count integer := 0;
begin
  for v_r in
    select * from zabelie_stock_reservations
     where order_id = p_order_id and status = 'held'
     for update
  loop
    update zabelie_stock
       set quantity_reserved = quantity_reserved - v_r.quantity,
           updated_at = now()
     where variant_id = v_r.variant_id;
    update zabelie_stock_reservations set status = 'consumed' where id = v_r.id;
    v_count := v_count + 1;
  end loop;
  return v_count; -- 0 = déjà consommé (idempotent)
end;
$$;
revoke all on function zabelie_consume_stock(uuid) from public, anon, authenticated;

-- ───────────── 7. RPC — libération (annulation / expiration) ────────────────

create function zabelie_release_stock(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r     record;
  v_count integer := 0;
begin
  for v_r in
    select * from zabelie_stock_reservations
     where order_id = p_order_id and status = 'held'
     for update
  loop
    update zabelie_stock
       set quantity_reserved  = quantity_reserved - v_r.quantity,
           quantity_available = quantity_available + v_r.quantity,
           updated_at = now()
     where variant_id = v_r.variant_id;
    update zabelie_stock_reservations set status = 'released' where id = v_r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function zabelie_release_stock(uuid) from public, anon, authenticated;

-- Cron : relibère les réservations échues (paiement jamais abouti).
create function zabelie_expire_stock_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r     record;
  v_count integer := 0;
begin
  for v_r in
    select * from zabelie_stock_reservations
     where status = 'held' and expires_at < now()
     for update
  loop
    update zabelie_stock
       set quantity_reserved  = quantity_reserved - v_r.quantity,
           quantity_available = quantity_available + v_r.quantity,
           updated_at = now()
     where variant_id = v_r.variant_id;
    update zabelie_stock_reservations set status = 'released' where id = v_r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function zabelie_expire_stock_reservations()
  from public, anon, authenticated;

-- ─────────── 8. Compatibilité véhicule (pièces auto/moto) ───────────────────
-- Voie retenue (docs/16 note 1) : champ structuré saisi par le vendeur +
-- liste CURÉE du parc haïtien. Aucune base externe type TecDoc.

create type vehicle_kind as enum ('auto', 'moto');

create table zabelie_vehicle_models (
  id       uuid primary key default gen_random_uuid(),
  kind     vehicle_kind not null,
  make     text not null,
  model    text not null,
  active   boolean not null default true,
  position smallint not null default 0,
  constraint vehicle_make_model_unique unique (kind, make, model)
);
alter table zabelie_vehicle_models enable row level security;
create policy zabelie_vehicle_models_read on zabelie_vehicle_models
  for select using (active);
revoke insert, update, delete on zabelie_vehicle_models from anon, authenticated;

create table zabelie_product_fitment (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references products (id) on delete cascade,
  vehicle_model_id uuid not null references zabelie_vehicle_models (id) on delete restrict,
  year_start       smallint not null check (year_start between 1950 and 2100),
  year_end         smallint check (year_end between 1950 and 2100),
  constraint fitment_years_ordered check (year_end is null or year_end >= year_start),
  constraint fitment_unique unique (product_id, vehicle_model_id, year_start)
);
create index zabelie_fitment_model_idx on zabelie_product_fitment (vehicle_model_id);

alter table zabelie_product_fitment enable row level security;
create policy zabelie_fitment_read on zabelie_product_fitment for select using (true);
revoke insert, update, delete on zabelie_product_fitment from anon, authenticated;

-- Parc haïtien réel — liste de départ, ajustable sans migration.
insert into zabelie_vehicle_models (kind, make, model, position) values
  ('auto','Toyota','Corolla',10),   ('auto','Toyota','Camry',20),
  ('auto','Toyota','RAV4',30),      ('auto','Toyota','Hilux',40),
  ('auto','Toyota','Land Cruiser',50), ('auto','Toyota','Yaris',60),
  ('auto','Toyota','Prado',70),
  ('auto','Nissan','Sentra',80),    ('auto','Nissan','Altima',90),
  ('auto','Nissan','X-Trail',100),  ('auto','Nissan','Frontier',110),
  ('auto','Nissan','Patrol',120),
  ('auto','Hyundai','Accent',130),  ('auto','Hyundai','Elantra',140),
  ('auto','Hyundai','Tucson',150),  ('auto','Hyundai','Santa Fe',160),
  ('auto','Hyundai','H-1',170),
  ('auto','Suzuki','Swift',180),    ('auto','Suzuki','Vitara',190),
  ('auto','Suzuki','Alto',200),
  ('auto','Kia','Rio',210),         ('auto','Kia','Sportage',220),
  ('auto','Honda','Civic',230),     ('auto','Honda','CR-V',240),
  ('auto','Mitsubishi','L200',250), ('auto','Isuzu','D-Max',260),
  ('moto','Haojue','HJ125',300),    ('moto','Haojue','HJ150',310),
  ('moto','Bajaj','Boxer',320),     ('moto','Bajaj','Pulsar',330),
  ('moto','Bajaj','CT100',340),
  ('moto','Sanya','SY125',350),     ('moto','Sanya','SY150',360),
  ('moto','TVS','Star City',370),   ('moto','TVS','Apache',380),
  ('moto','Honda','CG125',390),     ('moto','Yamaha','YBR125',400),
  ('moto','Suzuki','GN125',410);
