-- Zabelie Digi — schéma complet (concaténation 0001→0040).
-- Généré pour un copier-coller unique dans le SQL Editor Supabase.
-- Source de vérité = supabase/migrations/*.sql. Régénéré par
-- scripts/build-schema.mjs (ne pas éditer ce fichier à la main).
-- NE PAS exécuter _bootstrap.sql sur Supabase (réservé au Postgres nu en CI).

-- ═══════════════════════════════════════════════════════════════════════════
-- 0001_schema.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Zabelie Digi — Schéma initial (Vague 1)
-- Décision D-3 (V-9) : comptes/wallet PROPRES à Zabelie Digi, fusion future
-- possible via profiles.zabelie1_user_id (nullable + unique).
--
-- Invariants paiement (docs/03-PAIEMENTS.md) garantis EN BASE :
--   1. Idempotence : contrainte UNIQUE sur les clés d'idempotence.
--   2. Confirmation serveur-à-serveur : la table payments est la vérité.
--   3. Réconciliation : statuts traçables, aucun paiement orphelin.

-- ───────────────────────── Extensions ─────────────────────────
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ───────────────────────── Enums ──────────────────────────────
create type user_role       as enum ('buyer', 'creator', 'admin');
create type product_kind    as enum ('fichier', 'service');
create type product_status  as enum ('draft', 'published', 'archived');
create type order_status     as enum ('pending', 'paid', 'delivered', 'cancelled', 'refunded', 'disputed');
create type payment_rail     as enum ('moncash'); -- 'natcash' ajouté en Vague 2 (bloqué)
create type payment_status   as enum ('pending', 'confirmed', 'failed');
create type wallet_txn_type  as enum ('credit', 'debit', 'payout');
create type payout_status    as enum ('requested', 'processing', 'paid', 'rejected');

-- ───────────────────────── profiles ───────────────────────────
-- 1:1 avec auth.users. Identité externe nullable pour fusion future (D-3/V-9).
create table profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  role            user_role   not null default 'buyer',
  display_name    text        not null,
  bio             text,
  avatar_url      text,
  zabelie1_user_id text unique,            -- NULL tant que non lié à Zabelie 1
  created_at      timestamptz not null default now()
);

-- ───────────────────────── products ───────────────────────────
create table products (
  id           uuid primary key default gen_random_uuid(),
  seller_id    uuid not null references profiles (id) on delete cascade,
  slug         text not null unique,
  title        text not null,
  description  text,
  kind         product_kind   not null,
  category     text,
  price_htg    integer not null check (price_htg >= 0),
  cover_url    text,
  status       product_status not null default 'draft',
  sales_count  integer not null default 0,
  created_at   timestamptz not null default now()
);
create index products_seller_idx   on products (seller_id);
create index products_status_idx   on products (status);

-- Livrables (fichiers) liés à un produit de type 'fichier'.
create table product_assets (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references products (id) on delete cascade,
  storage_path text not null,             -- chemin Supabase Storage (accès signé)
  file_name    text not null,
  size_bytes   bigint,
  created_at   timestamptz not null default now()
);
create index product_assets_product_idx on product_assets (product_id);

-- ───────────────────────── orders ─────────────────────────────
create table orders (
  id          uuid primary key default gen_random_uuid(),
  buyer_id    uuid not null references profiles (id) on delete restrict,
  product_id  uuid not null references products (id) on delete restrict,
  amount_htg  integer not null check (amount_htg >= 0),
  status      order_status not null default 'pending',
  created_at  timestamptz not null default now()
);
create index orders_buyer_idx   on orders (buyer_id);
create index orders_product_idx on orders (product_id);

-- ───────────────────────── payments ───────────────────────────
-- INVARIANT 1 : idempotency_key UNIQUE → rejeu sans doublon, garanti en base.
-- INVARIANT 2 : cette table est la source de vérité (alimentée par le webhook
--               serveur-à-serveur, jamais par le seul retour navigateur).
create table payments (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders (id) on delete cascade,
  rail            payment_rail   not null default 'moncash',
  idempotency_key text not null unique,
  provider_ref    text,                    -- référence opérateur (MonCash)
  status          payment_status not null default 'pending',
  raw             jsonb,                   -- payload brut pour réconciliation
  confirmed_at    timestamptz,
  created_at      timestamptz not null default now()
);
create index payments_order_idx    on payments (order_id);
create index payments_status_idx   on payments (status);
create index payments_provider_idx on payments (provider_ref);

-- ───────────────────────── wallets ────────────────────────────
create table wallets (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null unique references profiles (id) on delete cascade,
  balance_htg bigint not null default 0 check (balance_htg >= 0),
  created_at timestamptz not null default now()
);

-- Grand livre du wallet. idempotency_key UNIQUE → pas de double crédit.
create table wallet_transactions (
  id              uuid primary key default gen_random_uuid(),
  wallet_id       uuid not null references wallets (id) on delete cascade,
  type            wallet_txn_type not null,
  amount_htg      bigint not null,
  order_id        uuid references orders (id) on delete set null,
  idempotency_key text unique,            -- ex: 'order_credit:<order_id>'
  reference       text,
  created_at      timestamptz not null default now()
);
create index wallet_txn_wallet_idx on wallet_transactions (wallet_id);

-- ───────────────────────── payouts ────────────────────────────
-- ⛔ Retraits BLOQUÉS en Vague 1 (dépendance BRH — docs §11/§14).
--    Table créée pour figer le modèle ; exécution différée.
create table payouts (
  id         uuid primary key default gen_random_uuid(),
  wallet_id  uuid not null references wallets (id) on delete restrict,
  amount_htg bigint not null check (amount_htg > 0),
  status     payout_status not null default 'requested',
  created_at timestamptz not null default now()
);
create index payouts_wallet_idx on payouts (wallet_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 0002_rls.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Zabelie Digi — Row Level Security (Vague 1)
-- Principe : lecture publique du catalogue ; chacun gère ses propres données ;
-- les paiements/wallet ne sont JAMAIS écrits côté client (service role + RPC).

alter table profiles            enable row level security;
alter table products            enable row level security;
alter table product_assets      enable row level security;
alter table orders              enable row level security;
alter table payments            enable row level security;
alter table wallets             enable row level security;
alter table wallet_transactions enable row level security;
alter table payouts             enable row level security;

-- ───────────────────────── profiles ───────────────────────────
create policy "profiles_public_read"
  on profiles for select using (true);

create policy "profiles_self_update"
  on profiles for update using (auth.uid() = id);

create policy "profiles_self_insert"
  on profiles for insert with check (auth.uid() = id);

-- ───────────────────────── products ───────────────────────────
create policy "products_public_read_published"
  on products for select using (status = 'published');

create policy "products_seller_read_own"
  on products for select using (auth.uid() = seller_id);

create policy "products_seller_write_own"
  on products for all
  using (auth.uid() = seller_id)
  with check (auth.uid() = seller_id);

-- ─────────────────────── product_assets ───────────────────────
-- Les livrables ne sont PAS lisibles publiquement : l'accès au fichier passe
-- par une URL signée délivrée côté serveur APRÈS paiement confirmé.
create policy "assets_seller_manage"
  on product_assets for all
  using (
    exists (select 1 from products p
            where p.id = product_assets.product_id and p.seller_id = auth.uid())
  )
  with check (
    exists (select 1 from products p
            where p.id = product_assets.product_id and p.seller_id = auth.uid())
  );

-- ───────────────────────── orders ─────────────────────────────
-- L'acheteur lit ses commandes ; le vendeur lit les commandes de ses produits.
create policy "orders_buyer_read"
  on orders for select using (auth.uid() = buyer_id);

create policy "orders_seller_read"
  on orders for select using (
    exists (select 1 from products p
            where p.id = orders.product_id and p.seller_id = auth.uid())
  );

-- Pas de policy INSERT/UPDATE client : commandes & paiements créés/maj côté
-- serveur (service role / RPC) pour garantir les invariants paiement.

-- ───────────────────────── payments ───────────────────────────
create policy "payments_buyer_read"
  on payments for select using (
    exists (select 1 from orders o
            where o.id = payments.order_id and o.buyer_id = auth.uid())
  );

-- ───────────────────────── wallets ────────────────────────────
create policy "wallets_owner_read"
  on wallets for select using (auth.uid() = owner_id);

create policy "wallet_txn_owner_read"
  on wallet_transactions for select using (
    exists (select 1 from wallets w
            where w.id = wallet_transactions.wallet_id and w.owner_id = auth.uid())
  );

-- ───────────────────────── payouts ────────────────────────────
create policy "payouts_owner_read"
  on payouts for select using (
    exists (select 1 from wallets w
            where w.id = payouts.wallet_id and w.owner_id = auth.uid())
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 0003_payment_functions.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Zabelie Digi — Logique de paiement idempotente (EPIC 4)
-- docs/03-PAIEMENTS.md. À appeler UNIQUEMENT côté serveur (webhook MonCash
-- vérifié serveur-à-serveur, ou réconciliateur). Jamais depuis le navigateur.

-- confirm_payment : applique la confirmation d'un paiement de façon idempotente.
--   - Verrouille la ligne payment (FOR UPDATE).
--   - Si déjà 'confirmed' → no-op (rejeu sans effet de bord = INVARIANT 1).
--   - Si p_amount est fourni et ≠ montant de la commande → REJET (payment→failed,
--     aucun crédit). Protège contre un montant falsifié/incohérent.
--   - Sinon : payment→confirmed, order→paid, crédit du wallet vendeur UNE SEULE
--     fois (clé d'idempotence 'order_credit:<order_id>' sur wallet_transactions).
create or replace function confirm_payment(
  p_idempotency_key text,
  p_provider_ref    text default null,
  p_raw             jsonb default null,
  p_amount          integer default null
)
returns payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment   payments;
  v_order     orders;
  v_seller_id uuid;
  v_wallet_id uuid;
  v_credited  integer;
begin
  select * into v_payment
    from payments
   where idempotency_key = p_idempotency_key
   for update;

  if not found then
    raise exception 'confirm_payment: aucun paiement pour idempotency_key %',
      p_idempotency_key;
  end if;

  -- Rejeu : déjà confirmé → on renvoie l'état sans rien refaire.
  if v_payment.status = 'confirmed' then
    return v_payment;
  end if;

  select * into v_order from orders where id = v_payment.order_id;

  -- Garde-fou montant : si l'opérateur rapporte un montant différent de la
  -- commande, on REJETTE. Paiement → failed, commande → disputed (à examiner),
  -- aucun crédit, aucune livraison (la livraison exige une commande 'paid').
  if p_amount is not null and p_amount <> v_order.amount_htg then
    update payments
       set status       = 'failed',
           provider_ref = coalesce(p_provider_ref, provider_ref),
           raw          = coalesce(p_raw, raw)
     where id = v_payment.id
     returning * into v_payment;
    update orders set status = 'disputed' where id = v_payment.order_id;
    return v_payment;
  end if;

  update payments
     set status       = 'confirmed',
         provider_ref = coalesce(p_provider_ref, provider_ref),
         raw          = coalesce(p_raw, raw),
         confirmed_at = now()
   where id = v_payment.id
   returning * into v_payment;

  update orders
     set status = 'paid'
   where id = v_payment.order_id
   returning * into v_order;

  -- Wallet du vendeur (créé à la volée si absent).
  select p.seller_id into v_seller_id
    from products p
    join orders o on o.product_id = p.id
   where o.id = v_order.id;

  insert into wallets (owner_id)
       values (v_seller_id)
  on conflict (owner_id) do nothing;

  select id into v_wallet_id from wallets where owner_id = v_seller_id;

  -- Crédit idempotent : si la transaction existe déjà (rejeu), le solde n'est
  -- PAS incrémenté une seconde fois.
  with ins as (
    insert into wallet_transactions
      (wallet_id, type, amount_htg, order_id, idempotency_key, reference)
    values
      (v_wallet_id, 'credit', v_order.amount_htg, v_order.id,
       'order_credit:' || v_order.id, 'Vente #' || left(v_order.id::text, 8))
    on conflict (idempotency_key) do nothing
    returning amount_htg
  )
  update wallets w
     set balance_htg = w.balance_htg + (select amount_htg from ins)
   where w.id = v_wallet_id
     and exists (select 1 from ins);

  -- Nombre de lignes wallet mises à jour : 1 si crédit neuf, 0 si rejeu.
  get diagnostics v_credited = row_count;

  -- Compteur de ventes incrémenté UNE SEULE fois (même garde d'idempotence).
  if v_credited > 0 then
    update products p
       set sales_count = p.sales_count + 1
     where p.id = v_order.product_id;
  end if;

  return v_payment;
end;
$$;

revoke all on function confirm_payment(text, text, jsonb, integer) from public, anon, authenticated;
-- Exécutable uniquement via service role (webhook / réconciliateur).

-- ═══════════════════════════════════════════════════════════════════════════
-- 0004_storage.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Zabelie Digi — Storage (Vague 1)
-- Bucket PRIVÉ pour les fichiers livrables. L'accès se fait exclusivement par
-- URL signée délivrée côté serveur APRÈS paiement confirmé (app/api/download).
-- Upload : via le service role (app/api/products/asset), donc pas de policy
-- storage.objects côté client nécessaire.

insert into storage.buckets (id, name, public)
values ('product-files', 'product-files', false)
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0005_commission.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Zabelie Digi — Commission par tier (EPIC 4 / EPIC 5)
-- Le vendeur est crédité du NET ; la plateforme prélève une commission selon le
-- tier. C'est le modèle économique : sans ça, le ledger est faux à chaque vente.
--
-- ⚠️ Cette fonction SQL est le SEUL calculateur qui écrit de l'argent. Le miroir
-- TS (lib/commission.ts) sert d'oracle de test et d'affichage, jamais de second
-- calculateur. La formule doit rester identique des deux côtés :
--   commission = round(gross * rate_bps / 10000) ; net = gross - commission.
--
-- Supersède la définition de confirm_payment de 0003 (ajoute net + commission).

-- ───────────────────────── Tier vendeur ───────────────────────
create type creator_tier as enum ('standard', 'elite');

alter table profiles
  add column tier creator_tier not null default 'standard';

-- Taux en points de base (1000 = 10 %, 600 = 6 %). Source de vérité du taux.
create or replace function commission_rate_bps(p_tier creator_tier)
returns integer
language sql
immutable
as $$
  select case p_tier when 'elite' then 600 else 1000 end;
$$;

-- Grand livre des revenus de la plateforme (1 ligne par commande, idempotent).
create table platform_earnings (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null unique references orders (id) on delete cascade,
  gross_htg      bigint not null,
  commission_htg bigint not null,
  rate_bps       integer not null,
  created_at     timestamptz not null default now()
);

-- ─────────────────── confirm_payment (avec commission) ───────────────────
create or replace function confirm_payment(
  p_idempotency_key text,
  p_provider_ref    text default null,
  p_raw             jsonb default null,
  p_amount          integer default null
)
returns payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment    payments;
  v_order      orders;
  v_seller_id  uuid;
  v_wallet_id  uuid;
  v_credited   integer;
  v_tier       creator_tier;
  v_rate_bps   integer;
  v_commission bigint;
  v_net        bigint;
begin
  select * into v_payment
    from payments
   where idempotency_key = p_idempotency_key
   for update;

  if not found then
    raise exception 'confirm_payment: aucun paiement pour idempotency_key %',
      p_idempotency_key;
  end if;

  -- Rejeu : déjà confirmé → on renvoie l'état sans rien refaire.
  if v_payment.status = 'confirmed' then
    return v_payment;
  end if;

  select * into v_order from orders where id = v_payment.order_id;

  -- Garde-fou montant : opérateur ≠ commande → REJET (failed + disputed).
  if p_amount is not null and p_amount <> v_order.amount_htg then
    update payments
       set status       = 'failed',
           provider_ref = coalesce(p_provider_ref, provider_ref),
           raw          = coalesce(p_raw, raw)
     where id = v_payment.id
     returning * into v_payment;
    update orders set status = 'disputed' where id = v_payment.order_id;
    return v_payment;
  end if;

  update payments
     set status       = 'confirmed',
         provider_ref = coalesce(p_provider_ref, provider_ref),
         raw          = coalesce(p_raw, raw),
         confirmed_at = now()
   where id = v_payment.id
   returning * into v_payment;

  update orders
     set status = 'paid'
   where id = v_payment.order_id
   returning * into v_order;

  -- Vendeur + tier → commission/net (SQL = seule vérité monétaire).
  select p.seller_id into v_seller_id
    from products p
    join orders o on o.product_id = p.id
   where o.id = v_order.id;

  select tier into v_tier from profiles where id = v_seller_id;
  v_rate_bps   := commission_rate_bps(v_tier);
  v_commission := round(v_order.amount_htg::numeric * v_rate_bps / 10000);
  v_net        := v_order.amount_htg - v_commission;

  insert into wallets (owner_id)
       values (v_seller_id)
  on conflict (owner_id) do nothing;

  select id into v_wallet_id from wallets where owner_id = v_seller_id;

  -- Crédit idempotent du NET : rejeu = pas de second crédit.
  with ins as (
    insert into wallet_transactions
      (wallet_id, type, amount_htg, order_id, idempotency_key, reference)
    values
      (v_wallet_id, 'credit', v_net, v_order.id,
       'order_credit:' || v_order.id, 'Vente nette #' || left(v_order.id::text, 8))
    on conflict (idempotency_key) do nothing
    returning amount_htg
  )
  update wallets w
     set balance_htg = w.balance_htg + (select amount_htg from ins)
   where w.id = v_wallet_id
     and exists (select 1 from ins);

  get diagnostics v_credited = row_count;

  -- Effets « une seule fois » (même garde d'idempotence que le crédit).
  if v_credited > 0 then
    insert into platform_earnings (order_id, gross_htg, commission_htg, rate_bps)
    values (v_order.id, v_order.amount_htg, v_commission, v_rate_bps)
    on conflict (order_id) do nothing;

    update products p
       set sales_count = p.sales_count + 1
     where p.id = v_order.product_id;
  end if;

  return v_payment;
end;
$$;

revoke all on function confirm_payment(text, text, jsonb, integer) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0006_escrow_maturation.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Zabelie Digi — Escrow & maturation J+7 + remboursements (EPIC 5)
-- Fenêtre anti-fraude : le NET du vendeur est d'abord EN ATTENTE (pending), puis
-- DISPONIBLE (available, retirable) après 7 jours. Un remboursement avant
-- maturation annule l'escrow → aucun solde fantôme.
--
-- ⚠️ SQL = seul calculateur d'argent. Supersède confirm_payment de 0005
-- (crédite désormais l'escrow/pending au lieu du solde disponible).

-- ───────────────────────── Schéma escrow ──────────────────────
create type escrow_status as enum ('maturing', 'matured', 'reversed');

-- Solde disponible = wallets.balance_htg (retirable). Ajout du solde en attente.
alter table wallets
  add column pending_htg bigint not null default 0 check (pending_htg >= 0);

-- Une entrée d'escrow par commande payée (= guard d'idempotence du crédit).
create table escrow_entries (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null unique references orders (id) on delete cascade,
  wallet_id  uuid not null references wallets (id) on delete cascade,
  amount_htg bigint not null,                 -- NET vendeur
  matures_at timestamptz not null,
  status     escrow_status not null default 'maturing',
  created_at timestamptz not null default now()
);
create index escrow_due_idx on escrow_entries (status, matures_at);
create index escrow_wallet_idx on escrow_entries (wallet_id);

-- ─────────────────── confirm_payment (crédit en escrow) ───────────────────
create or replace function confirm_payment(
  p_idempotency_key text,
  p_provider_ref    text default null,
  p_raw             jsonb default null,
  p_amount          integer default null
)
returns payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment    payments;
  v_order      orders;
  v_seller_id  uuid;
  v_wallet_id  uuid;
  v_credited   integer;
  v_tier       creator_tier;
  v_rate_bps   integer;
  v_commission bigint;
  v_net        bigint;
begin
  select * into v_payment
    from payments
   where idempotency_key = p_idempotency_key
   for update;

  if not found then
    raise exception 'confirm_payment: aucun paiement pour idempotency_key %',
      p_idempotency_key;
  end if;

  if v_payment.status = 'confirmed' then
    return v_payment; -- rejeu : no-op
  end if;

  select * into v_order from orders where id = v_payment.order_id;

  -- Garde-fou montant : opérateur ≠ commande → REJET (failed + disputed).
  if p_amount is not null and p_amount <> v_order.amount_htg then
    update payments
       set status = 'failed',
           provider_ref = coalesce(p_provider_ref, provider_ref),
           raw = coalesce(p_raw, raw)
     where id = v_payment.id
     returning * into v_payment;
    update orders set status = 'disputed' where id = v_payment.order_id;
    return v_payment;
  end if;

  update payments
     set status = 'confirmed',
         provider_ref = coalesce(p_provider_ref, provider_ref),
         raw = coalesce(p_raw, raw),
         confirmed_at = now()
   where id = v_payment.id
   returning * into v_payment;

  update orders set status = 'paid'
   where id = v_payment.order_id
   returning * into v_order;

  -- Vendeur + tier → commission/net.
  select p.seller_id into v_seller_id
    from products p join orders o on o.product_id = p.id
   where o.id = v_order.id;

  select tier into v_tier from profiles where id = v_seller_id;
  v_rate_bps   := commission_rate_bps(v_tier);
  v_commission := round(v_order.amount_htg::numeric * v_rate_bps / 10000);
  v_net        := v_order.amount_htg - v_commission;

  insert into wallets (owner_id) values (v_seller_id)
  on conflict (owner_id) do nothing;
  select id into v_wallet_id from wallets where owner_id = v_seller_id;

  -- Mise en ESCROW du NET (maturation J+7). Idempotent via escrow_entries.order_id.
  with ins as (
    insert into escrow_entries (order_id, wallet_id, amount_htg, matures_at, status)
    values (v_order.id, v_wallet_id, v_net, now() + interval '7 days', 'maturing')
    on conflict (order_id) do nothing
    returning amount_htg
  )
  update wallets w
     set pending_htg = w.pending_htg + (select amount_htg from ins)
   where w.id = v_wallet_id
     and exists (select 1 from ins);

  get diagnostics v_credited = row_count;

  if v_credited > 0 then
    insert into wallet_transactions
      (wallet_id, type, amount_htg, order_id, idempotency_key, reference)
    values
      (v_wallet_id, 'credit', v_net, v_order.id, 'order_credit:' || v_order.id,
       'Vente nette en attente #' || left(v_order.id::text, 8))
    on conflict (idempotency_key) do nothing;

    insert into platform_earnings (order_id, gross_htg, commission_htg, rate_bps)
    values (v_order.id, v_order.amount_htg, v_commission, v_rate_bps)
    on conflict (order_id) do nothing;

    update products p set sales_count = p.sales_count + 1
     where p.id = v_order.product_id;
  end if;

  return v_payment;
end;
$$;
revoke all on function confirm_payment(text, text, jsonb, integer) from public, anon, authenticated;

-- ─────────────────── mature_wallets : pending → available ───────────────────
-- À déclencher par cron. Fait mûrir tout escrow 'maturing' arrivé à échéance.
create or replace function mature_wallets()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with matured as (
    update escrow_entries
       set status = 'matured'
     where status = 'maturing'
       and matures_at <= now()
    returning wallet_id, amount_htg
  ), agg as (
    select wallet_id, sum(amount_htg) as amt, count(*) as n
      from matured group by wallet_id
  ), upd as (
    update wallets w
       set pending_htg = w.pending_htg - a.amt,
           balance_htg = w.balance_htg + a.amt
      from agg a
     where w.id = a.wallet_id
    returning a.n
  )
  select coalesce(sum(n), 0) into v_count from upd;
  return v_count;
end;
$$;
revoke all on function mature_wallets() from public, anon, authenticated;

-- ─────────────────── refund_order : remboursement idempotent ───────────────────
-- Avant maturité  → annule l'escrow (pending réduit) : AUCUN solde fantôme.
-- Après maturité  → débite le solde disponible (peut échouer si déjà retiré).
create or replace function refund_order(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_esc escrow_entries;
begin
  select * into v_esc from escrow_entries where order_id = p_order_id for update;
  if not found then
    raise exception 'refund_order: aucun escrow pour order %', p_order_id;
  end if;

  if v_esc.status = 'reversed' then
    return 'already_reversed'; -- idempotent
  end if;

  if v_esc.status = 'maturing' then
    update wallets set pending_htg = pending_htg - v_esc.amount_htg
     where id = v_esc.wallet_id;
  else -- 'matured' : fonds déjà disponibles
    update wallets set balance_htg = balance_htg - v_esc.amount_htg
     where id = v_esc.wallet_id;
  end if;

  update escrow_entries set status = 'reversed' where id = v_esc.id;
  update orders set status = 'refunded' where id = p_order_id;

  insert into wallet_transactions
    (wallet_id, type, amount_htg, order_id, idempotency_key, reference)
  values
    (v_esc.wallet_id, 'debit', -v_esc.amount_htg, p_order_id,
     'order_refund:' || p_order_id, 'Remboursement #' || left(p_order_id::text, 8))
  on conflict (idempotency_key) do nothing;

  return 'reversed';
end;
$$;
revoke all on function refund_order(uuid) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0007_standalone.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Zabelie Digi — projet TOTALEMENT INDÉPENDANT (décision utilisateur, ferme).
-- Aucune fusion prévue avec Zabelie 1 ni aucun autre projet. On retire la
-- passerelle dormante prévue « au cas où » par l'ancienne V-9.
-- (Sur une base déjà déployée : exécuter cette migration ; sur une base neuve,
--  schema.sql inclut créé-puis-supprimé, résultat identique.)

alter table profiles drop column if exists zabelie1_user_id;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0008_reviews.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Zabelie Digi — Avis d'acheteurs VÉRIFIÉS (différenciateur confiance vs Chariow)
-- Règle dure : seul un acheteur ayant une commande PAYÉE peut laisser un avis,
-- et UN SEUL avis par commande (contrainte UNIQUE en base, pas seulement en API).
-- Marché à faible confiance → la preuve sociale doit être invérolable.

create table product_reviews (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  buyer_id   uuid not null references profiles (id) on delete cascade,
  order_id   uuid not null unique references orders (id) on delete cascade,
  rating     integer not null check (rating between 1 and 5),
  comment    text,
  created_at timestamptz not null default now()
);
create index reviews_product_idx on product_reviews (product_id);

-- Agrégats maintenus par trigger (lecture catalogue sans jointure coûteuse).
alter table products
  add column rating_count integer not null default 0,
  add column rating_sum   integer not null default 0;

create or replace function apply_review_aggregates()
returns trigger
language plpgsql
as $$
begin
  update products
     set rating_count = rating_count + 1,
         rating_sum   = rating_sum + new.rating
   where id = new.product_id;
  return new;
end;
$$;

create trigger product_reviews_aggregate
  after insert on product_reviews
  for each row execute function apply_review_aggregates();

-- RLS : lecture publique (preuve sociale), écriture UNIQUEMENT côté serveur
-- (l'API vérifie que la commande appartient au demandeur et est payée/livrée).
alter table product_reviews enable row level security;
create policy "reviews_public_read"
  on product_reviews for select using (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- 0009_rails_diaspora.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Zabelie Digi — Rails diaspora : Stripe (carte) + Zelle (V-10)
-- Décision produit : ouvrir les achats USD de la diaspora. Le LEDGER RESTE EN
-- HTG (net vendeur, commission, escrow inchangés — calculés sur amount_htg).
-- Le montant USD attendu est FIGÉ au checkout (expected_usd_cents) et vérifié
-- en base à la confirmation : même garde-fou anti-falsification que MonCash.
--
-- Zelle n'ayant pas d'API, sa confirmation est ADMINISTRATIVE (bouton admin)
-- mais passe par le même confirm_payment idempotent — aucune livraison sans
-- confirmation explicite.

alter type payment_rail add value if not exists 'stripe';
alter type payment_rail add value if not exists 'zelle';

alter table payments
  add column expected_usd_cents integer; -- figé au checkout pour rails USD

-- confirm_payment v4 : ajoute le garde-fou USD (p_usd_cents vs expected).
-- On supprime l'ancienne signature pour éviter toute ambiguïté de surcharge.
drop function if exists confirm_payment(text, text, jsonb, integer);

create or replace function confirm_payment(
  p_idempotency_key text,
  p_provider_ref    text default null,
  p_raw             jsonb default null,
  p_amount          integer default null,
  p_usd_cents       integer default null
)
returns payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment    payments;
  v_order      orders;
  v_seller_id  uuid;
  v_wallet_id  uuid;
  v_credited   integer;
  v_tier       creator_tier;
  v_rate_bps   integer;
  v_commission bigint;
  v_net        bigint;
begin
  select * into v_payment
    from payments
   where idempotency_key = p_idempotency_key
   for update;

  if not found then
    raise exception 'confirm_payment: aucun paiement pour idempotency_key %',
      p_idempotency_key;
  end if;

  if v_payment.status = 'confirmed' then
    return v_payment; -- rejeu : no-op
  end if;

  select * into v_order from orders where id = v_payment.order_id;

  -- Garde-fou HTG (MonCash) : opérateur ≠ commande → REJET.
  if p_amount is not null and p_amount <> v_order.amount_htg then
    update payments
       set status = 'failed',
           provider_ref = coalesce(p_provider_ref, provider_ref),
           raw = coalesce(p_raw, raw)
     where id = v_payment.id
     returning * into v_payment;
    update orders set status = 'disputed' where id = v_payment.order_id;
    return v_payment;
  end if;

  -- Garde-fou USD (Stripe/Zelle) : montant reçu ≠ montant figé → REJET.
  if p_usd_cents is not null
     and (v_payment.expected_usd_cents is null
          or p_usd_cents <> v_payment.expected_usd_cents) then
    update payments
       set status = 'failed',
           provider_ref = coalesce(p_provider_ref, provider_ref),
           raw = coalesce(p_raw, raw)
     where id = v_payment.id
     returning * into v_payment;
    update orders set status = 'disputed' where id = v_payment.order_id;
    return v_payment;
  end if;

  update payments
     set status = 'confirmed',
         provider_ref = coalesce(p_provider_ref, provider_ref),
         raw = coalesce(p_raw, raw),
         confirmed_at = now()
   where id = v_payment.id
   returning * into v_payment;

  update orders set status = 'paid'
   where id = v_payment.order_id
   returning * into v_order;

  -- Vendeur + tier → commission/net (LEDGER HTG, identique pour tous les rails).
  select p.seller_id into v_seller_id
    from products p join orders o on o.product_id = p.id
   where o.id = v_order.id;

  select tier into v_tier from profiles where id = v_seller_id;
  v_rate_bps   := commission_rate_bps(v_tier);
  v_commission := round(v_order.amount_htg::numeric * v_rate_bps / 10000);
  v_net        := v_order.amount_htg - v_commission;

  insert into wallets (owner_id) values (v_seller_id)
  on conflict (owner_id) do nothing;
  select id into v_wallet_id from wallets where owner_id = v_seller_id;

  with ins as (
    insert into escrow_entries (order_id, wallet_id, amount_htg, matures_at, status)
    values (v_order.id, v_wallet_id, v_net, now() + interval '7 days', 'maturing')
    on conflict (order_id) do nothing
    returning amount_htg
  )
  update wallets w
     set pending_htg = w.pending_htg + (select amount_htg from ins)
   where w.id = v_wallet_id
     and exists (select 1 from ins);

  get diagnostics v_credited = row_count;

  if v_credited > 0 then
    insert into wallet_transactions
      (wallet_id, type, amount_htg, order_id, idempotency_key, reference)
    values
      (v_wallet_id, 'credit', v_net, v_order.id, 'order_credit:' || v_order.id,
       'Vente nette en attente #' || left(v_order.id::text, 8))
    on conflict (idempotency_key) do nothing;

    insert into platform_earnings (order_id, gross_htg, commission_htg, rate_bps)
    values (v_order.id, v_order.amount_htg, v_commission, v_rate_bps)
    on conflict (order_id) do nothing;

    update products p set sales_count = p.sales_count + 1
     where p.id = v_order.product_id;
  end if;

  return v_payment;
end;
$$;
revoke all on function confirm_payment(text, text, jsonb, integer, integer)
  from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0010_topup.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Zabelie Digi — Service de recharge téléphonique (topup) Digicel/Natcom (V-11)
-- Positionnement BRH (Circulaire 121) : Zabelie Digi est un REVENDEUR de
-- recharge télécom, JAMAIS un émetteur de monnaie électronique.
--   • Aucun solde rechargeable acheteur, aucun P2P, aucun cash-in/cash-out.
--   • Flux strict : paiement (MonCash/Zelle) → livraison immédiate.
--   • Remboursement uniquement vers le moyen de paiement d'origine.
--   • Traçabilité totale : zabelie_topup_ledger APPEND-ONLY (trigger bloquant).
--   • Plafonds anti-abus configurables (zabelie_topup_limits) + velocity checks.
-- Pipeline volontairement SÉPARÉ du money-path marketplace (orders/payments/
-- wallets) : pas de vendeur, pas de commission, pas d'escrow — le wallet
-- vendeur existant n'est pas touché (contrainte BRH n°5).

-- ───────────────────────── Enums ─────────────────────────
create type topup_operator as enum ('digicel', 'natcom');

-- Machine à états (transitions validées par zabelie_topup_transition) :
-- created → payment_pending → paid → fulfillment_pending → delivered
--                                             ↓
--                                          failed → refund_pending → refunded
create type topup_status as enum (
  'created', 'payment_pending', 'paid', 'fulfillment_pending',
  'delivered', 'failed', 'refund_pending', 'refunded'
);

-- ───────────────────────── Catalogue ─────────────────────────
-- Prix TOUJOURS résolus côté serveur depuis cette table (jamais du client).
-- Montants en centimes ? Non : le HTG s'utilise en unités entières partout
-- ailleurs dans le schéma (amount_htg integer) — on garde la même convention.
create table zabelie_topup_products (
  id                  uuid primary key default gen_random_uuid(),
  operator            topup_operator not null,
  label               text not null,              -- ex. « Rechaj 100 HTG »
  face_value_htg      integer not null check (face_value_htg > 0),   -- valeur livrée
  cost_htg            integer not null check (cost_htg > 0),         -- prix coûtant fournisseur
  price_htg           integer not null check (price_htg > 0),        -- prix de vente
  provider            text not null default 'reloadly',
  provider_product_id text,                       -- operatorId Reloadly
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  check (price_htg >= cost_htg)                   -- marge jamais négative
);

-- ───────────────────────── Commandes ─────────────────────────
create table zabelie_topup_orders (
  id                 uuid primary key default gen_random_uuid(),
  buyer_id           uuid not null references auth.users(id),
  product_id         uuid not null references zabelie_topup_products(id),
  operator           topup_operator not null,
  beneficiary_phone  text not null,               -- format 509XXXXXXXX
  face_value_htg     integer not null,
  amount_htg         integer not null,            -- prix payé (figé au checkout)
  cost_htg           integer not null,            -- coûtant (figé au checkout)
  status             topup_status not null default 'created',
  rail               payment_rail not null,       -- moncash | zelle (natcash ⛔)
  expected_usd_cents integer,                     -- figé au checkout si rail USD
  payment_ref        text,                        -- transactionId MonCash / réf Zelle
  provider_ref       text,                        -- transactionId fournisseur topup
  attempts           integer not null default 0,  -- tentatives de fulfillment
  last_error         text,
  raw                jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Index velocity checks + relevés par compte (contrainte BRH n°7).
create index zabelie_topup_orders_buyer_idx
  on zabelie_topup_orders (buyer_id, created_at);
create index zabelie_topup_orders_beneficiary_idx
  on zabelie_topup_orders (beneficiary_phone, created_at);
create index zabelie_topup_orders_status_idx
  on zabelie_topup_orders (status, created_at);

-- ───────────────────────── Ledger append-only ─────────────────────────
-- Audit trail immuable (contrainte BRH n°6) : horodatage, compte acheteur,
-- bénéficiaire, opérateur, montant, référence paiement, référence fournisseur,
-- transition de statut. AUCUN UPDATE/DELETE possible (trigger).
create table zabelie_topup_ledger (
  id                bigint generated always as identity primary key,
  order_id          uuid not null references zabelie_topup_orders(id),
  buyer_id          uuid not null,
  beneficiary_phone text not null,
  operator          topup_operator not null,
  amount_htg        integer not null,
  from_status       topup_status,
  to_status         topup_status not null,
  payment_ref       text,
  provider_ref      text,
  detail            jsonb,
  created_at        timestamptz not null default now()
);

create index zabelie_topup_ledger_order_idx on zabelie_topup_ledger (order_id);

create or replace function zabelie_topup_ledger_guard()
returns trigger language plpgsql as $$
begin
  raise exception 'zabelie_topup_ledger est APPEND-ONLY (audit BRH) : % interdit', tg_op;
end;
$$;
create trigger zabelie_topup_ledger_immutable
  before update or delete on zabelie_topup_ledger
  for each row execute function zabelie_topup_ledger_guard();

-- ───────────────────────── Plafonds configurables ─────────────────────────
create table zabelie_topup_limits (
  key        text primary key,
  value      integer not null,
  comment    text,
  updated_at timestamptz not null default now()
);
insert into zabelie_topup_limits (key, value, comment) values
  ('per_tx_htg', 5000,
   'Plafond par transaction (HTG). Validé porteur 2026-07.'),
  ('per_day_htg', 25000,
   'Plafond par jour et par compte acheteur (HTG).'),
  ('distinct_beneficiaries_per_hour', 5,
   'Au-delà de N numéros bénéficiaires différents en 1 h → flag (velocity).');

-- ───────────────────────── RLS ─────────────────────────
alter table zabelie_topup_products enable row level security;
alter table zabelie_topup_orders   enable row level security;
alter table zabelie_topup_ledger   enable row level security;
alter table zabelie_topup_limits   enable row level security;

-- Catalogue : lecture publique des produits actifs (prix affichés).
create policy topup_products_read on zabelie_topup_products
  for select using (active);

-- Commandes : l'acheteur ne voit que les siennes. Écritures = service role
-- uniquement (aucune policy insert/update → refusé pour anon/authenticated).
create policy topup_orders_own on zabelie_topup_orders
  for select using (auth.uid() = buyer_id);

-- Ledger + limits : admin/service uniquement (aucune policy → service role seul).

-- ───────────────────────── Machine à états ─────────────────────────
-- Transitions autorisées — toute autre transition lève une erreur (et rien
-- n'est écrit). Chaque transition réussie ajoute une ligne au ledger.
create or replace function zabelie_topup_transition(
  p_order_id uuid,
  p_to       topup_status,
  p_detail   jsonb default null
)
returns zabelie_topup_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order zabelie_topup_orders;
  v_from  topup_status;
  v_ok    boolean;
begin
  select * into v_order from zabelie_topup_orders
   where id = p_order_id for update;
  if not found then
    raise exception 'zabelie_topup_transition: commande % introuvable', p_order_id;
  end if;
  v_from := v_order.status;

  -- Rejeu idempotent : déjà dans l'état cible → no-op.
  if v_order.status = p_to then
    return v_order;
  end if;

  v_ok := case
    when v_order.status = 'created'             and p_to in ('payment_pending', 'failed') then true
    when v_order.status = 'payment_pending'     and p_to in ('paid', 'failed') then true
    when v_order.status = 'paid'                and p_to in ('fulfillment_pending') then true
    when v_order.status = 'fulfillment_pending' and p_to in ('delivered', 'failed') then true
    when v_order.status = 'failed'              and p_to in ('refund_pending') then true
    when v_order.status = 'refund_pending'      and p_to in ('refunded') then true
    else false
  end;

  if not v_ok then
    raise exception 'zabelie_topup_transition: transition % → % interdite (commande %)',
      v_order.status, p_to, p_order_id;
  end if;

  update zabelie_topup_orders
     set status = p_to, updated_at = now()
   where id = p_order_id
   returning * into v_order;

  insert into zabelie_topup_ledger
    (order_id, buyer_id, beneficiary_phone, operator, amount_htg,
     from_status, to_status, payment_ref, provider_ref, detail)
  values
    (v_order.id, v_order.buyer_id, v_order.beneficiary_phone, v_order.operator,
     v_order.amount_htg, v_from, p_to,
     v_order.payment_ref, v_order.provider_ref, p_detail);

  return v_order;
end;
$$;
revoke all on function zabelie_topup_transition(uuid, topup_status, jsonb)
  from public, anon, authenticated;

-- ───────────────────────── Confirmation de paiement ─────────────────────────
-- Idempotente + garde-fous montant (HTG et USD), miroir des invariants du
-- marketplace. Rejouable sans double effet ; montant falsifié → failed.
create or replace function zabelie_topup_confirm_payment(
  p_order_id  uuid,
  p_payment_ref text default null,
  p_raw       jsonb default null,
  p_amount    integer default null,   -- HTG rapporté par MonCash
  p_usd_cents integer default null    -- cents USD (Zelle)
)
returns zabelie_topup_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order zabelie_topup_orders;
begin
  select * into v_order from zabelie_topup_orders
   where id = p_order_id for update;
  if not found then
    raise exception 'zabelie_topup_confirm_payment: commande % introuvable', p_order_id;
  end if;

  -- Rejeu (webhook livré deux fois) : déjà payé ou plus loin → no-op.
  if v_order.status in ('paid', 'fulfillment_pending', 'delivered',
                        'refund_pending', 'refunded') then
    return v_order;
  end if;

  update zabelie_topup_orders
     set payment_ref = coalesce(p_payment_ref, payment_ref),
         raw = coalesce(p_raw, raw)
   where id = p_order_id;

  -- Garde-fou HTG : montant opérateur ≠ prix figé → REJET tracé.
  if p_amount is not null and p_amount <> v_order.amount_htg then
    return zabelie_topup_transition(p_order_id, 'failed',
      jsonb_build_object('reason', 'payment_amount_mismatch',
                         'reported_htg', p_amount,
                         'expected_htg', v_order.amount_htg));
  end if;

  -- Garde-fou USD : montant reçu ≠ figé au checkout → REJET tracé.
  if p_usd_cents is not null
     and (v_order.expected_usd_cents is null
          or p_usd_cents <> v_order.expected_usd_cents) then
    return zabelie_topup_transition(p_order_id, 'failed',
      jsonb_build_object('reason', 'payment_usd_mismatch',
                         'reported_usd_cents', p_usd_cents,
                         'expected_usd_cents', v_order.expected_usd_cents));
  end if;

  return zabelie_topup_transition(p_order_id, 'paid',
    jsonb_build_object('payment_ref', p_payment_ref));
end;
$$;
revoke all on function zabelie_topup_confirm_payment(uuid, text, jsonb, integer, integer)
  from public, anon, authenticated;

-- ───────────────────────── Seed catalogue ─────────────────────────
-- Dénominations de départ. cost_htg = estimation à SYNCHRONISER avec les prix
-- réels Reloadly sandbox (voir OPS_TODO.md) ; price_htg = marge cible ~5 %
-- au-dessus du coûtant (validé porteur). provider_product_id à renseigner
-- après le mapping des operatorId Reloadly.
insert into zabelie_topup_products
  (operator, label, face_value_htg, cost_htg, price_htg) values
  ('digicel', 'Rechaj Digicel 25 HTG',    25,   25,   27),
  ('digicel', 'Rechaj Digicel 50 HTG',    50,   50,   53),
  ('digicel', 'Rechaj Digicel 100 HTG',  100,  100,  105),
  ('digicel', 'Rechaj Digicel 250 HTG',  250,  250,  263),
  ('digicel', 'Rechaj Digicel 500 HTG',  500,  500,  525),
  ('digicel', 'Rechaj Digicel 1000 HTG', 1000, 1000, 1050),
  ('natcom',  'Rechaj Natcom 25 HTG',     25,   25,   27),
  ('natcom',  'Rechaj Natcom 50 HTG',     50,   50,   53),
  ('natcom',  'Rechaj Natcom 100 HTG',   100,  100,  105),
  ('natcom',  'Rechaj Natcom 250 HTG',   250,  250,  263),
  ('natcom',  'Rechaj Natcom 500 HTG',   500,  500,  525),
  ('natcom',  'Rechaj Natcom 1000 HTG',  1000, 1000, 1050);

-- ═══════════════════════════════════════════════════════════════════════════
-- 0011_security_hardening.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Zabelie Digi — Durcissement sécurité (advisors Supabase, post-migration prod)
-- 1. RLS manquant sur 2 tables financières (niveau ERROR au linter) : sans RLS,
--    l'API REST Supabase (PostgREST) les expose aux clients authentifiés.
--    Aucune policy = service role uniquement — le bon défaut pour l'argent.
alter table platform_earnings enable row level security;
alter table escrow_entries    enable row level security;

-- Le vendeur peut lire SES entrées d'escrow (transparence du J+7) ; l'écriture
-- reste réservée aux fonctions SECURITY DEFINER / service role.
create policy "escrow_owner_read"
  on escrow_entries for select using (
    exists (select 1 from wallets w
            where w.id = escrow_entries.wallet_id and w.owner_id = auth.uid())
  );

-- 2. search_path mutable (niveau WARN) sur 3 fonctions : on le fige.
alter function commission_rate_bps(creator_tier) set search_path = public;
alter function apply_review_aggregates() set search_path = public;
alter function zabelie_topup_ledger_guard() set search_path = public;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0012_coupons.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Zabelie Digi — Codes promo vendeur (V-13, inspiration Chariow adaptée Haïti)
-- Le vendeur anime ses ventes lui-même (« PROMO50 sur WhatsApp jusqu'à
-- dimanche »). Règles dures respectées : la réduction est calculée CÔTÉ
-- SERVEUR (pourcentage borné 1–90, montants entiers), le prix final est figé
-- sur la commande AVANT paiement — tous les garde-fous montant existants
-- (HTG/USD, commission, escrow) s'appliquent au prix remisé tel quel.

create table zabelie_coupons (
  id          uuid primary key default gen_random_uuid(),
  seller_id   uuid not null references profiles (id) on delete cascade,
  -- null = valable sur tous les produits du vendeur.
  product_id  uuid references products (id) on delete cascade,
  code        text not null,
  percent     integer not null check (percent between 1 and 90),
  max_uses    integer check (max_uses is null or max_uses > 0),
  uses        integer not null default 0,
  expires_at  timestamptz,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  -- Un code est unique PAR vendeur (deux vendeurs peuvent avoir « PROMO50 »).
  unique (seller_id, code)
);
create index zabelie_coupons_seller_idx on zabelie_coupons (seller_id);

-- La commande garde la trace du code appliqué (audit + affichage).
alter table orders
  add column coupon_code  text,
  add column discount_htg integer not null default 0 check (discount_htg >= 0);

-- RLS : le vendeur gère SES codes ; validation/consommation côté serveur
-- uniquement (service role) — aucun code n'est lisible publiquement (sinon
-- n'importe qui énumérerait les promos des vendeurs).
alter table zabelie_coupons enable row level security;
create policy "coupons_seller_all"
  on zabelie_coupons for all
  using (auth.uid() = seller_id)
  with check (auth.uid() = seller_id);

-- Consommation ATOMIQUE d'une utilisation (appelée au checkout, service role).
-- Renvoie true si l'usage a été réservé, false si plafond atteint/inactif.
create or replace function zabelie_coupon_consume(p_coupon_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok integer;
begin
  update zabelie_coupons
     set uses = uses + 1
   where id = p_coupon_id
     and active
     and (max_uses is null or uses < max_uses)
     and (expires_at is null or expires_at > now());
  get diagnostics v_ok = row_count;
  return v_ok > 0;
end;
$$;
revoke all on function zabelie_coupon_consume(uuid) from public, anon, authenticated;

-- ─────────── Notifications post-paiement : réservation idempotente ───────────
-- Un paiement rejoué (webhook doublé, réconciliateur) ne doit produire qu'UN
-- envoi d'e-mails : marqueur atomique dans payments.raw, posé une seule fois.
create or replace function zabelie_claim_notification(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok integer;
begin
  update payments
     set raw = coalesce(raw, '{}'::jsonb)
               || jsonb_build_object('notified_at', now())
   where order_id = p_order_id
     and status = 'confirmed'
     and (raw ->> 'notified_at') is null;
  get diagnostics v_ok = row_count;
  return v_ok > 0;
end;
$$;
revoke all on function zabelie_claim_notification(uuid) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0013_geo_analytics.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Zabelie Digi — Géo-analytics back-office (Vague 1)
-- Objectif : dashboard interne « d'où viennent nos clients/talents », AGRÉGÉ
-- PAR PAYS uniquement. Aucune position individuelle, aucune coordonnée en base.
--
-- Choix privacy (cf. décision produit « dashboard interne, granularité pays ») :
--   • On stocke un simple code pays ISO-3166 alpha-2 sur profiles.
--   • Les vues n'exposent QUE des comptes agrégés (jamais un identifiant).
--   • Accès révoqué à anon/authenticated : seul le service role (back-office
--     admin, garde role='admin' en app) peut lire ces agrégats.

-- ───────────────────────── country_code ───────────────────────
-- ISO-3166-1 alpha-2 en MAJUSCULES (ex: 'HT', 'SN'), NULL tant que non renseigné.
alter table profiles
  add column if not exists country_code text
  check (country_code is null or country_code ~ '^[A-Z]{2}$');

create index if not exists profiles_country_idx on profiles (country_code);

-- ───────────────────── vue : talents/clients par pays ─────────
-- Une ligne par (pays, rôle) avec un simple compteur. '??' = non renseigné.
create or replace view analytics_geo_users as
  select
    coalesce(country_code, '??') as country_code,
    role,
    count(*)::int                as users
  from profiles
  group by 1, 2;

-- ───────────────────── vue : ventes par pays (acheteur) ───────
-- GMV et nombre de commandes honorées, ventilés par pays de l'ACHETEUR.
create or replace view analytics_geo_sales as
  select
    coalesce(b.country_code, '??')      as country_code,
    count(*)::int                       as orders,
    coalesce(sum(o.amount_htg), 0)::bigint as gmv_htg
  from orders o
  join profiles b on b.id = o.buyer_id
  where o.status in ('paid', 'delivered')
  group by 1;

-- ───────────────────────── verrouillage accès ────────────────
-- Les vues sont en « definer rights » (contournent la RLS des tables sources) :
-- on ferme donc explicitement l'accès public/API. Lecture réservée au back-office.
revoke all on analytics_geo_users, analytics_geo_sales from anon, authenticated;
grant  select on analytics_geo_users, analytics_geo_sales to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0014_haiti_departments.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Zabelie Digi — Zoom Haïti par département (back-office /admin/geo)
-- Marché ciblé : Haïti. On veut voir OÙ sont les TALENTS (créateurs) à l'échelle
-- des 10 départements, en restant agrégé (jamais une position individuelle).
--
-- Cohérent avec 0007 : region_code n'a de sens que si country_code = 'HT'.

-- ───────────────────────── region_code ───────────────────────
-- Département haïtien au format ISO-3166-2 (ex: 'HT-OU' = Ouest), NULL sinon.
alter table profiles
  add column if not exists region_code text
  check (region_code is null or region_code ~ '^HT-[A-Z]{2}$');

create index if not exists profiles_region_idx on profiles (region_code);

-- ───────────────── vue : talents Haïti par département ────────
-- Une ligne par département avec compteurs. '??' = pays Haïti mais département
-- non renseigné. Seuls les profils localisés en Haïti sont pris en compte.
create or replace view analytics_geo_ht as
  select
    coalesce(region_code, '??') as region_code,
    count(*) filter (where role = 'creator')::int as creators,
    count(*)::int                                  as users
  from profiles
  where country_code = 'HT'
  group by 1;

-- ───────────────────────── verrouillage accès ────────────────
revoke all on analytics_geo_ht from anon, authenticated;
grant  select on analytics_geo_ht to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0015_profiles_hardening.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Zabelie Digi — Durcissement RLS de `profiles` (audit sécurité)
-- Corrige trois failles issues d'un même angle mort : les policies de `profiles`
-- s'appliquent PAR LIGNE, jamais PAR COLONNE. Ajouter une colonne sensible à une
-- table dont la policy est `using(true)` / sans `with check` l'expose ou la rend
-- modifiable automatiquement.
--
--   [1] Auto-promotion admin : un utilisateur pouvait PATCH son propre profil
--       (role='admin') via la clé anon publique, en contournant /api/profile.
--   [2] Fraude commission : idem avec tier='elite' (commission 10 % → 6 %).
--   [3] Fuite de localisation : country_code/region_code (0007/0008) étaient
--       lisibles publiquement au niveau individuel via la policy public_read.

-- ─────────────────── [1][2] role & tier non modifiables côté client ───────────
-- Un BEFORE trigger neutralise toute tentative d'escalade : seul le service_role
-- (back-office / RPC) peut fixer role et tier. Les sessions anon/authenticated
-- se voient forcer les valeurs par défaut (INSERT) ou l'ancienne valeur (UPDATE),
-- SANS bloquer la mise à jour légitime des autres colonnes (nom, bio, pays…).
create or replace function protect_profile_privileges()
returns trigger
language plpgsql
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
  elsif tg_op = 'UPDATE' then
    new.role := old.role;      -- role figé côté client
    new.tier := old.tier;      -- tier figé côté client
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_privileges on profiles;
create trigger trg_protect_profile_privileges
  before insert or update on profiles
  for each row execute function protect_profile_privileges();

-- Défense en profondeur : la mise à jour reste bornée à sa propre ligne.
drop policy if exists "profiles_self_update" on profiles;
create policy "profiles_self_update"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ─────────────────── [3] lecture publique restreinte aux colonnes sûres ───────
-- La RLS ne filtre pas les colonnes : on le fait via des GRANTs colonne. On révoque
-- le SELECT « toutes colonnes » à anon/authenticated et on ne rouvre que le strict
-- nécessaire au catalogue public et à l'app. country_code / region_code restent
-- lisibles UNIQUEMENT par le service_role (dashboard /admin/geo).
revoke select on profiles from anon, authenticated;
grant  select (id, role, display_name, bio, avatar_url, tier, created_at)
  on profiles to anon, authenticated;
-- Les écritures self (nom, bio, avatar, pays, département) restent permises : on
-- ne révoque PAS les privilèges UPDATE/INSERT — seul le SELECT est restreint.

-- ═══════════════════════════════════════════════════════════════════════════
-- 0016_gdpr_retention.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Zabelie Digi — Rétention / minimisation (audit RGPD)
-- Le payload opérateur (payments.raw) n'est utile qu'à la réconciliation d'un
-- paiement encore 'pending'. Une fois le paiement clôturé (confirmed/failed) et
-- passé un délai d'audit, on efface raw : minimisation (Art. 5(1)(c)) + limitation
-- de conservation (Art. 5(1)(e)). L'identifiant du payeur n'est déjà plus écrit
-- (redactPayment côté app) ; cette purge nettoie aussi l'historique existant.

create or replace function purge_payment_raw(p_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update payments
     set raw = null
   where raw is not null
     and status in ('confirmed', 'failed')
     and coalesce(confirmed_at, created_at) < now() - make_interval(days => p_days);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Réservé au service role (cron / back-office), jamais exposé au client.
revoke all on function purge_payment_raw(integer) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0017_seller_suspension.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Zabelie Digi — Suspension réversible de compte (modération admin)
-- Sanction de modération SANS AUCUNE ÉCRITURE MONÉTAIRE (cadre BRH : Zabelie
-- n'est pas dépositaire — on ne gèle, ne débite, ne fige jamais un solde dû ;
-- l'escrow continue de mûrir normalement). La suspension agit sur :
--   • l'accès (ban auth réversible, côté app),
--   • la visibilité catalogue (policy produits ci-dessous),
--   • le décaissement futur (les retraits — déjà bloqués en Vague 1 — devront
--     vérifier suspended_at is null).
-- La remédiation financière d'une fraude passe par refund_order (moyen
-- d'origine + checkpoint humain), commande par commande — jamais par ici.

-- ───────────────────────── colonnes ───────────────────────────
alter table profiles
  add column if not exists suspended_at     timestamptz,
  add column if not exists suspended_reason text,
  add column if not exists suspended_by     uuid references profiles (id);

-- NB : ces colonnes ne sont volontairement PAS ajoutées au GRANT SELECT colonne
-- de 0015 → invisibles à anon/authenticated via l'API REST. Seul le service
-- role (back-office, écran « compte suspendu ») les lit.

-- ─────────────── trigger : suspension non modifiable côté client ──────────────
-- Sans ça, profiles_self_update permettrait à un suspendu de se dé-suspendre
-- via PostgREST. Même mécanique que role/tier (0015).
create or replace function protect_profile_privileges()
returns trigger
language plpgsql
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
  elsif tg_op = 'UPDATE' then
    new.role := old.role;      -- role figé côté client
    new.tier := old.tier;      -- tier figé côté client
    new.suspended_at     := old.suspended_at;     -- suspension figée côté client
    new.suspended_reason := old.suspended_reason;
    new.suspended_by     := old.suspended_by;
  end if;
  return new;
end;
$$;
-- (le trigger trg_protect_profile_privileges de 0015 pointe déjà sur cette fonction)

-- ──────────── catalogue : produits d'un vendeur suspendu masqués ──────────────
-- SECURITY DEFINER : la policy products est évaluée pour anon/authenticated,
-- qui n'ont pas le SELECT sur suspended_at (grants colonne 0015). Le helper
-- contourne proprement, sans réexposer la colonne.
create or replace function seller_is_active(p_seller uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
     where id = p_seller and suspended_at is null
  );
$$;
revoke all on function seller_is_active(uuid) from public;
grant execute on function seller_is_active(uuid) to anon, authenticated, service_role;

-- Réversible par design : à la réactivation (suspended_at → NULL), les produits
-- réapparaissent SANS re-publication. Le vendeur continue de voir ses propres
-- produits (policy products_seller_read_own intacte).
drop policy if exists "products_public_read_published" on products;
create policy "products_public_read_published"
  on products for select
  using (status = 'published' and seller_is_active(seller_id));

-- ═══════════════════════════════════════════════════════════════════════════
-- 0018_fix_search_path.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Zabelie Digi — Fige search_path sur protect_profile_privileges (advisor WARN)
-- Incohérence avec le reste du codebase (purge_payment_raw, zabelie_coupon_consume…
-- ont tous `set search_path = public`) : cette fonction trigger l'avait omis.
alter function protect_profile_privileges() set search_path = public;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0019_rate_limits.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Zabelie Digi — Limitation de débit en base (audit sécurité §6)
-- Compteur à FENÊTRE FIXE dans Postgres : fiable en serverless (pas de mémoire
-- process qui se vide à chaque déploiement Vercel), pas de service externe à
-- opérer. Protège les routes qui coûtent de l'argent à chaque appel
-- (checkout → session MonCash/Stripe, recharge) et la devinette de codes promo.

create table zabelie_rate_limits (
  key          text not null,        -- ex. 'checkout:<user_id>' / 'coupon_validate:<ip>'
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (key, window_start)
);

alter table zabelie_rate_limits enable row level security;
-- Aucune policy : service role uniquement (même défaut que le ledger topup).

-- Incrémente le compteur de la fenêtre courante et dit si l'appel est encore
-- dans le budget. ATOMIQUE (upsert) : deux requêtes simultanées ne peuvent pas
-- passer toutes les deux sous un plafond déjà atteint.
create or replace function zabelie_rate_limit(
  p_key            text,
  p_limit          integer,
  p_window_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_hits   integer;
begin
  if p_limit <= 0 or p_window_seconds <= 0 then
    raise exception 'zabelie_rate_limit: p_limit et p_window_seconds doivent être > 0';
  end if;

  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into zabelie_rate_limits as r (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start)
  do update set hits = r.hits + 1
  returning hits into v_hits;

  -- Ménage opportuniste (~2 % des appels) : les fenêtres passées ne servent
  -- plus jamais — la table reste minuscule sans cron dédié.
  if random() < 0.02 then
    delete from zabelie_rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_limit;
end;
$$;
revoke all on function zabelie_rate_limit(text, integer, integer)
  from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0020_service_fields.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Zabelie Digi — Page service façon Fiverr (délai + inclus)
-- Champs d'AFFICHAGE uniquement, ajoutés à products existant : aucune nouvelle
-- logique financière, aucun nouveau prix. price_htg reste l'unique source de
-- vérité du montant (inchangé), vérifiée au checkout comme avant.

alter table products
  add column delivery_days integer
    check (delivery_days is null or delivery_days > 0),
  add column service_includes text[];

-- ═══════════════════════════════════════════════════════════════════════════
-- 0021_points_rewards.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 0021 — Zabelie Points & Rewards (programme de fidélité NON monétaire)
-- ============================================================================
-- DÉGELÉ par décision porteur (2026-07-11), éclairée par l'analyse de risque
-- documentée dans docs/BRH-question-fidelite.md §Analyse : les points ne sont
-- PAS « émis contre remise de fonds » (définition monnaie électronique,
-- Circ. 121) — jamais achetés, jamais remboursables, circuit fermé. Le mémo
-- juridique reste recommandé en parallèle (pas un prérequis de déploiement).
--
-- Principe : JAMAIS de solde en gourdes stocké côté acheteur. Les points n'ont
-- aucune valeur cash directe — ils ne se convertissent qu'en coupons de remise
-- en POURCENTAGE, à usage unique, plafonnés, et dont la valeur vient TOUJOURS
-- d'un catalogue serveur (rewards_catalog), jamais du client.
--
-- Invariants durs respectés (miroir du money-path) :
--   • Aucune valeur/coût fourni par le client — tout vient de rewards_catalog.
--   • Toute écriture passe par une fonction SECURITY DEFINER révoquée du client
--     (service_role uniquement), jamais par un accès table direct.
--   • Ledger append-only (règles no-update/no-delete), lots FIFO immuables.
--   • search_path figé sur toutes les fonctions ET le trigger.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ENUMS
-- ----------------------------------------------------------------------------

create type points_reason as enum (
  'purchase',
  'review_text',
  'review_photo',
  'review_video',
  'referral_bonus_referrer',
  'referral_bonus_referee',
  'welcome_bonus',
  'challenge_completed',
  'promo_boost',
  'coupon_redemption',   -- valeur négative
  'expiration',          -- valeur négative
  'admin_adjustment'
);

create type coupon_status as enum ('active', 'redeemed', 'expired', 'cancelled');

-- BRH : uniquement 'percentage'. Un montant fixe en HTG serait une valeur
-- monétaire absolue transférable — trop proche d'un quasi-solde / instrument de
-- paiement. Le rabais en % n'a de valeur qu'appliqué à un prix.
create type coupon_type as enum ('percentage');

-- ----------------------------------------------------------------------------
-- 2. REWARDS_CATALOG (source de vérité SERVEUR du couple coût↔valeur)
-- La rédemption ne reçoit qu'un reward_id : impossible pour le client de
-- choisir « 1 point = 90 % ». Le catalogue est administré en service_role.
-- ----------------------------------------------------------------------------

create table rewards_catalog (
  id                  uuid primary key default gen_random_uuid(),
  label               text not null,                       -- ex. « -10 % sur une commande »
  points_cost         integer not null check (points_cost > 0),
  discount_percentage integer not null check (discount_percentage between 1 and 90),
  max_discount_htg    integer check (max_discount_htg is null or max_discount_htg > 0),
  coupon_validity_days integer not null default 30 check (coupon_validity_days > 0),
  active              boolean not null default true,
  created_at          timestamptz not null default now()
);

-- Paliers de départ (validés porteur avant activation — placeholder).
insert into rewards_catalog (label, points_cost, discount_percentage, max_discount_htg) values
  ('-5 % sur une commande',  250,  5,  500),
  ('-10 % sur une commande', 500, 10, 1000),
  ('-15 % sur une commande', 900, 15, 1500);

-- ----------------------------------------------------------------------------
-- 3. POINTS_BATCHES — expiration FIFO par lot, sans toucher le ledger
-- ----------------------------------------------------------------------------

create table points_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  points_earned integer not null check (points_earned > 0),
  points_remaining integer not null check (points_remaining >= 0),
  reason points_reason not null,
  order_id uuid references orders(id),
  expires_at timestamptz not null,
  expired boolean not null default false,
  created_at timestamptz not null default now(),
  constraint remaining_lte_earned check (points_remaining <= points_earned)
);

create index idx_points_batches_user_active
  on points_batches (user_id, expires_at)
  where points_remaining > 0 and not expired;

-- ----------------------------------------------------------------------------
-- 4. POINTS_LEDGER (append-only strict — jamais UPDATE ni DELETE)
-- ----------------------------------------------------------------------------

create table points_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  batch_id uuid references points_batches(id),
  delta integer not null,               -- + = gain, − = dépense/expiration
  balance_after integer not null check (balance_after >= 0),
  reason points_reason not null,
  order_id uuid references orders(id),
  coupon_id uuid,                       -- coupons.id si reason = coupon_redemption
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index idx_points_ledger_user on points_ledger (user_id, created_at desc);

create rule points_ledger_no_update as on update to points_ledger do instead nothing;
create rule points_ledger_no_delete as on delete to points_ledger do instead nothing;

-- ----------------------------------------------------------------------------
-- 5. POINTS_BALANCES (cache dénormalisé, maintenu par trigger)
-- ----------------------------------------------------------------------------

create table points_balances (
  user_id uuid primary key references auth.users(id),
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create function fn_points_ledger_update_balance()
returns trigger
language plpgsql
security definer
set search_path = public          -- figé (cohérence 0018 : advisor search_path)
as $$
begin
  -- Le candidat d'INSERT est validé par le CHECK (balance >= 0) AVANT que
  -- ON CONFLICT ne bascule sur l'UPDATE : un delta négatif brut y échouerait.
  -- greatest(delta,0) garde le candidat valide ; un delta négatif n'arrive
  -- jamais sans ligne préexistante (on ne dépense/expire pas des points
  -- jamais gagnés) → la vraie arithmétique se fait dans la branche UPDATE.
  insert into points_balances (user_id, balance, updated_at)
  values (new.user_id, greatest(new.delta, 0), now())
  on conflict (user_id)
  do update set
    balance = points_balances.balance + new.delta,
    updated_at = now();
  return new;
end;
$$;

create trigger trg_points_ledger_update_balance
  after insert on points_ledger
  for each row execute function fn_points_ledger_update_balance();

-- ----------------------------------------------------------------------------
-- 6. COUPONS (seule récompense convertible — % à usage unique, plafonné)
-- La valeur est COPIÉE depuis rewards_catalog à la rédemption (figée), jamais
-- fournie par le client.
-- ----------------------------------------------------------------------------

create table coupons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  reward_id uuid not null references rewards_catalog(id),
  code text not null unique,
  type coupon_type not null default 'percentage',
  discount_percentage integer not null check (discount_percentage between 1 and 90),
  max_discount_htg integer,              -- plafond absolu figé depuis le catalogue
  points_cost integer not null check (points_cost > 0),
  status coupon_status not null default 'active',
  order_id uuid references orders(id),   -- rempli à l'application au checkout
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  redeemed_at timestamptz
);

create index idx_coupons_user_active
  on coupons (user_id, status)
  where status = 'active';

-- ----------------------------------------------------------------------------
-- 7. RLS — lecture seule côté client ; écriture = service_role via RPC
-- ----------------------------------------------------------------------------

alter table rewards_catalog enable row level security;
alter table points_batches  enable row level security;
alter table points_ledger   enable row level security;
alter table points_balances enable row level security;
alter table coupons         enable row level security;

-- Catalogue : lecture publique des paliers actifs (affichage « échange »).
create policy rewards_catalog_read_active on rewards_catalog
  for select using (active);

create policy points_batches_select_own on points_batches
  for select using (auth.uid() = user_id);
create policy points_ledger_select_own on points_ledger
  for select using (auth.uid() = user_id);
create policy points_balances_select_own on points_balances
  for select using (auth.uid() = user_id);
create policy coupons_select_own on coupons
  for select using (auth.uid() = user_id);

-- Défense en profondeur : révocation explicite des écritures directes.
revoke insert, update, delete on rewards_catalog from authenticated, anon;
revoke insert, update, delete on points_batches  from authenticated, anon;
revoke insert, update, delete on points_ledger   from authenticated, anon;
revoke insert, update, delete on points_balances from authenticated, anon;
revoke insert, update, delete on coupons         from authenticated, anon;

-- ----------------------------------------------------------------------------
-- 8. RPC — award_points
-- Attribution de points (achat, avis, parrainage…). service_role uniquement.
-- ----------------------------------------------------------------------------

create function award_points(
  p_user_id uuid,
  p_points integer,
  p_reason points_reason,
  p_order_id uuid default null,
  p_expires_in_days integer default 90,
  p_metadata jsonb default '{}'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_new_balance integer;
begin
  if p_points <= 0 then
    raise exception 'award_points: points must be positive';
  end if;

  -- Verrou du solde AVANT lecture : balance_after cohérent même sous
  -- attributions concurrentes (crée la ligne à 0 si absente).
  insert into points_balances (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  select balance into v_new_balance
  from points_balances
  where user_id = p_user_id
  for update;

  v_new_balance := v_new_balance + p_points;

  insert into points_batches
    (user_id, points_earned, points_remaining, reason, order_id, expires_at)
  values
    (p_user_id, p_points, p_points, p_reason, p_order_id,
     now() + make_interval(days => p_expires_in_days))
  returning id into v_batch_id;

  insert into points_ledger
    (user_id, batch_id, delta, balance_after, reason, order_id, metadata)
  values
    (p_user_id, v_batch_id, p_points, v_new_balance, p_reason, p_order_id, p_metadata);

  return v_batch_id;
end;
$$;
revoke all on function award_points(uuid, integer, points_reason, uuid, integer, jsonb)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 9. RPC — redeem_points_for_coupon
-- N'accepte qu'un reward_id : coût ET valeur viennent de rewards_catalog.
-- Verrou du solde (anti double-rédemption), consommation FIFO des lots.
-- ----------------------------------------------------------------------------

create function redeem_points_for_coupon(
  p_user_id   uuid,
  p_reward_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reward   rewards_catalog;
  v_balance  integer;
  v_to_deduct integer;
  v_batch    record;
  v_deduct   integer;
  v_coupon_id uuid;
  v_new_balance integer;
  v_code     text;
begin
  -- Récompense = source de vérité serveur (coût, %, plafond, validité).
  select * into v_reward from rewards_catalog
   where id = p_reward_id and active;
  if not found then
    raise exception 'redeem_points_for_coupon: récompense inconnue ou inactive';
  end if;

  -- Verrou du solde : sérialise les rédemptions concurrentes.
  select balance into v_balance
    from points_balances where user_id = p_user_id for update;
  if v_balance is null or v_balance < v_reward.points_cost then
    raise exception 'redeem_points_for_coupon: solde de points insuffisant';
  end if;

  -- Consommation FIFO des lots actifs (les plus proches de l'expiration).
  v_to_deduct := v_reward.points_cost;
  for v_batch in
    select id, points_remaining
      from points_batches
     where user_id = p_user_id and points_remaining > 0 and not expired
     order by expires_at asc
     for update
  loop
    exit when v_to_deduct <= 0;
    v_deduct := least(v_batch.points_remaining, v_to_deduct);
    update points_batches
       set points_remaining = points_remaining - v_deduct
     where id = v_batch.id;
    v_to_deduct := v_to_deduct - v_deduct;
  end loop;

  if v_to_deduct > 0 then
    raise exception 'redeem_points_for_coupon: incohérence lots/solde — rédemption annulée';
  end if;

  v_code := 'ZBR-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  v_new_balance := v_balance - v_reward.points_cost;

  -- Valeur du coupon FIGÉE depuis le catalogue (jamais du client).
  insert into coupons
    (user_id, reward_id, code, discount_percentage, max_discount_htg,
     points_cost, expires_at)
  values
    (p_user_id, v_reward.id, v_code, v_reward.discount_percentage,
     v_reward.max_discount_htg, v_reward.points_cost,
     now() + make_interval(days => v_reward.coupon_validity_days))
  returning id into v_coupon_id;

  insert into points_ledger
    (user_id, delta, balance_after, reason, coupon_id, metadata)
  values
    (p_user_id, -v_reward.points_cost, v_new_balance, 'coupon_redemption',
     v_coupon_id, jsonb_build_object('coupon_code', v_code, 'reward_id', v_reward.id));

  return v_coupon_id;
end;
$$;
revoke all on function redeem_points_for_coupon(uuid, uuid)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 10. RPC — apply_coupon_to_order (branchement checkout)
-- Revalide TOUT côté serveur (propriété, statut, expiration), consomme le
-- coupon (usage unique) et renvoie le % + plafond figés. Le checkout calcule
-- le prix remisé à partir de CES valeurs — jamais d'un montant envoyé par le
-- client. Renvoie NULL si le coupon est invalide (le checkout facture plein).
-- ----------------------------------------------------------------------------

create function apply_coupon_to_order(
  p_user_id uuid,
  p_code    text,
  p_order_id uuid
) returns table (discount_percentage integer, max_discount_htg integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coupon coupons;
begin
  -- Verrou du coupon : un seul checkout peut le consommer.
  select * into v_coupon from coupons
   where code = p_code and user_id = p_user_id
   for update;

  if not found
     or v_coupon.status <> 'active'
     or v_coupon.expires_at < now() then
    return;  -- aucune ligne → coupon invalide, le checkout facture plein tarif
  end if;

  update coupons
     set status = 'redeemed', order_id = p_order_id, redeemed_at = now()
   where id = v_coupon.id;

  discount_percentage := v_coupon.discount_percentage;
  max_discount_htg    := v_coupon.max_discount_htg;
  return next;
end;
$$;
revoke all on function apply_coupon_to_order(uuid, text, uuid)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 11. RPC — expire_points_batch_job (cron quotidien)
-- ----------------------------------------------------------------------------

create function expire_points_batch_job() returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch record;
  v_new_balance integer;
  v_total integer := 0;
begin
  for v_batch in
    select * from points_batches
     where not expired and expires_at < now() and points_remaining > 0
     for update
  loop
    update points_batches set expired = true where id = v_batch.id;

    select greatest(coalesce(balance, 0) - v_batch.points_remaining, 0)
      into v_new_balance
      from points_balances where user_id = v_batch.user_id;

    insert into points_ledger
      (user_id, batch_id, delta, balance_after, reason, metadata)
    values
      (v_batch.user_id, v_batch.id, -v_batch.points_remaining,
       coalesce(v_new_balance, 0), 'expiration',
       jsonb_build_object('expired_points', v_batch.points_remaining));

    v_total := v_total + 1;
  end loop;
  return v_total;
end;
$$;
revoke all on function expire_points_batch_job() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 12. RPC — expire_coupons_job (cron, cosmétique — n'affecte pas les points)
-- ----------------------------------------------------------------------------

create function expire_coupons_job() returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update coupons set status = 'expired'
   where status = 'active' and expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function expire_coupons_job() from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0022_business_v1.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 0022 — Zabelie Business, Vague 1 « Fè m peye » (se faire payer)
-- ============================================================================
-- Cadrage : docs/13-BUSINESS-V1-TECH.md. Décisions porteur (2026-07-13) :
--   • Commission 10 % (config, ajustable sans migration).
--   • SANS escrow/rétention : le pro est crédité IMMÉDIATEMENT sur son solde
--     disponible (balance_htg), pas de fenêtre J+7. → migration 100 % ADDITIVE :
--     ne touche NI escrow_entries NI mature_wallets NI platform_earnings.
--   • Le mouvement d'argent passe par le livre unique wallet_transactions.
--
-- Invariants money-path respectés (miroir de confirm_payment) :
--   • Totaux JAMAIS acceptés du client — recalculés serveur (qty × unit_price).
--   • Confirmation idempotente (clé unique), montant vérifié en base.
--   • Toute écriture via fonction SECURITY DEFINER révoquée du client.
-- ============================================================================

-- ───────────────────────── Config (taux ajustable) ─────────────────────────
create table zabelie_biz_config (
  key   text primary key,
  value integer not null,
  note  text
);
insert into zabelie_biz_config (key, value, note) values
  ('commission_bps', 1000,
   'Commission Business en points de base (1000 = 10 %). Ajustable sans migration. Défaut de départ — à revalider selon le coût réel du rail MonCash.');

-- ───────────────────────── Taxonomie fermée (docs/12 §3) ────────────────────
create table zabelie_biz_categories (
  slug                text primary key,
  label_fr            text not null,
  label_ht            text not null,
  sort_order          integer not null default 0,
  is_bookable_default boolean not null default false,
  active              boolean not null default true
);
insert into zabelie_biz_categories (slug, label_fr, label_ht, sort_order, is_bookable_default) values
  ('creatif-design',       'Création & design',        'Kreyasyon & desen',      10, false),
  ('audio-musique',        'Audio & musique',          'Odyo & mizik',           20, false),
  ('dev-tech',             'Développement & tech',     'Devlopman & teknoloji',  30, false),
  ('marketing-digital',    'Marketing digital',        'Maketin dijital',        40, false),
  ('redaction-traduction', 'Rédaction & traduction',   'Redaksyon & tradiksyon', 50, false),
  ('formation-coaching',   'Formation & coaching',     'Fòmasyon & kotchin',     60, false),
  ('beaute-bienetre',      'Beauté & bien-être',       'Bèlte & byennèt',        70, true),
  ('evenementiel',         'Événementiel',             'Evènman',                80, true),
  ('artisanat-mode',       'Artisanat & mode',         'Atizana & mòd',          90, false),
  ('services-pro',         'Services professionnels',  'Sèvis pwofesyonèl',     100, false),
  ('maison-reparation',    'Maison & réparation',      'Kay & reparasyon',      110, false),
  ('autre',                'Autre',                    'Lòt',                   999, false);

-- ───────────────────────── Espace professionnel ────────────────────────────
create table zabelie_biz_professionals (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null unique references auth.users(id) on delete cascade,
  display_name     text not null,
  slug             text not null unique,
  bio              text,
  avatar_url       text,
  next_invoice_seq integer not null default 1,   -- numéro de facture lisible, par pro
  created_at       timestamptz not null default now()
);

-- ───────────────────────── Répertoire client (propre au pro) ────────────────
create table zabelie_biz_clients (
  id              uuid primary key default gen_random_uuid(),
  professional_id uuid not null references zabelie_biz_professionals(id) on delete cascade,
  name            text not null,
  phone           text,
  email           text,
  linked_user_id  uuid references auth.users(id),
  notes           text,
  created_at      timestamptz not null default now()
);
create index biz_clients_pro_idx on zabelie_biz_clients (professional_id);

-- ───────────────────────── Facture ─────────────────────────────────────────
create type zabelie_biz_invoice_status as enum
  ('draft', 'sent', 'partially_paid', 'paid', 'overdue', 'void');

create table zabelie_biz_invoices (
  id              uuid primary key default gen_random_uuid(),
  professional_id uuid not null references zabelie_biz_professionals(id) on delete cascade,
  client_id       uuid not null references zabelie_biz_clients(id) on delete restrict,
  invoice_number  text,                          -- 'FCT-000123', généré à l'envoi
  status          zabelie_biz_invoice_status not null default 'draft',
  subtotal_htg    bigint not null default 0 check (subtotal_htg >= 0),   -- SERVEUR
  total_htg       bigint not null default 0 check (total_htg >= 0),      -- SERVEUR
  paid_htg        bigint not null default 0 check (paid_htg >= 0),       -- SERVEUR
  currency        text not null default 'HTG',
  due_date        date,
  public_token    text not null unique,
  reminded_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (paid_htg <= total_htg)                  -- jamais de sur-paiement
);
create index biz_invoices_pro_idx on zabelie_biz_invoices (professional_id, status);
create index biz_invoices_due_idx on zabelie_biz_invoices (status, due_date);

create table zabelie_biz_invoice_items (
  id             uuid primary key default gen_random_uuid(),
  invoice_id     uuid not null references zabelie_biz_invoices(id) on delete cascade,
  label          text not null,
  qty            integer not null check (qty > 0),
  unit_price_htg bigint not null check (unit_price_htg >= 0),
  line_total_htg bigint not null check (line_total_htg >= 0),   -- RECALCULÉ serveur
  sort_order     integer not null default 0
);
create index biz_items_invoice_idx on zabelie_biz_invoice_items (invoice_id);

-- Paiements — commission stockée ICI (additif ; platform_earnings non touché).
create table zabelie_biz_payments (
  id              uuid primary key default gen_random_uuid(),
  invoice_id      uuid not null references zabelie_biz_invoices(id) on delete cascade,
  provider        payment_rail not null,
  provider_ref    text,
  amount_htg      bigint not null check (amount_htg > 0),      -- brut de CE versement
  commission_htg  bigint not null default 0,                   -- part plateforme
  net_htg         bigint not null default 0,                   -- crédité au pro
  rate_bps        integer not null default 0,                  -- taux figé au paiement
  status          text not null default 'confirmed',
  idempotency_key text unique,                                 -- anti-rejeu
  paid_at         timestamptz not null default now()
);
create index biz_payments_invoice_idx on zabelie_biz_payments (invoice_id);

-- ───────────────────────── RLS ─────────────────────────────────────────────
alter table zabelie_biz_config        enable row level security;
alter table zabelie_biz_categories    enable row level security;
alter table zabelie_biz_professionals enable row level security;
alter table zabelie_biz_clients       enable row level security;
alter table zabelie_biz_invoices      enable row level security;
alter table zabelie_biz_invoice_items enable row level security;
alter table zabelie_biz_payments      enable row level security;

-- Catégories : lecture publique (liste fermée). Config : service role only.
create policy biz_cat_read on zabelie_biz_categories for select using (active);

-- Le pro lit son espace + ses données rattachées.
create policy biz_pro_self on zabelie_biz_professionals for select
  using (auth.uid() = user_id);
create policy biz_clients_owner on zabelie_biz_clients for select using (
  exists (select 1 from zabelie_biz_professionals p
          where p.id = professional_id and p.user_id = auth.uid()));
create policy biz_invoices_owner on zabelie_biz_invoices for select using (
  exists (select 1 from zabelie_biz_professionals p
          where p.id = professional_id and p.user_id = auth.uid()));
create policy biz_items_owner on zabelie_biz_invoice_items for select using (
  exists (select 1 from zabelie_biz_invoices i
          join zabelie_biz_professionals p on p.id = i.professional_id
          where i.id = invoice_id and p.user_id = auth.uid()));
create policy biz_payments_owner on zabelie_biz_payments for select using (
  exists (select 1 from zabelie_biz_invoices i
          join zabelie_biz_professionals p on p.id = i.professional_id
          where i.id = invoice_id and p.user_id = auth.uid()));

-- Aucune écriture directe côté client : tout passe par les fonctions ci-dessous.
revoke insert, update, delete on
  zabelie_biz_config, zabelie_biz_categories, zabelie_biz_professionals,
  zabelie_biz_clients, zabelie_biz_invoices, zabelie_biz_invoice_items,
  zabelie_biz_payments
  from anon, authenticated;

-- ───────────────────────── Helpers internes ────────────────────────────────
-- Recalcule subtotal/total d'une facture depuis ses lignes (source de vérité).
create or replace function zabelie_biz_recompute_invoice(p_invoice uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_sum bigint;
begin
  select coalesce(sum(line_total_htg), 0) into v_sum
    from zabelie_biz_invoice_items where invoice_id = p_invoice;
  update zabelie_biz_invoices
     set subtotal_htg = v_sum, total_htg = v_sum, updated_at = now()
   where id = p_invoice;
end;
$$;
revoke all on function zabelie_biz_recompute_invoice(uuid) from public, anon, authenticated;

-- ───────────────────────── RPC — ajout/maj d'une ligne (DRAFT only) ─────────
create or replace function zabelie_biz_upsert_item(
  p_invoice     uuid,
  p_label       text,
  p_qty         integer,
  p_unit_price  bigint,
  p_item        uuid default null    -- null = insert ; sinon update
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status zabelie_biz_invoice_status;
  v_line   bigint;
  v_id     uuid;
begin
  select status into v_status from zabelie_biz_invoices where id = p_invoice;
  if v_status is null then
    raise exception 'zabelie_biz_upsert_item: facture introuvable';
  end if;
  if v_status <> 'draft' then
    raise exception 'zabelie_biz_upsert_item: facture non modifiable (statut %)', v_status;
  end if;
  if p_qty <= 0 or p_unit_price < 0 then
    raise exception 'zabelie_biz_upsert_item: qty > 0 et prix >= 0 requis';
  end if;

  v_line := p_qty::bigint * p_unit_price;   -- total ligne RECALCULÉ (jamais du client)

  if p_item is null then
    insert into zabelie_biz_invoice_items (invoice_id, label, qty, unit_price_htg, line_total_htg)
    values (p_invoice, p_label, p_qty, p_unit_price, v_line)
    returning id into v_id;
  else
    update zabelie_biz_invoice_items
       set label = p_label, qty = p_qty, unit_price_htg = p_unit_price, line_total_htg = v_line
     where id = p_item and invoice_id = p_invoice
     returning id into v_id;
  end if;

  perform zabelie_biz_recompute_invoice(p_invoice);
  return v_id;
end;
$$;
revoke all on function zabelie_biz_upsert_item(uuid, text, integer, bigint, uuid)
  from public, anon, authenticated;

-- ───────────────────────── RPC — envoyer (DRAFT → SENT) ─────────────────────
create or replace function zabelie_biz_send_invoice(p_invoice uuid)
returns zabelie_biz_invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv zabelie_biz_invoices;
  v_seq integer;
  v_pro uuid;
begin
  select * into v_inv from zabelie_biz_invoices where id = p_invoice for update;
  if not found then raise exception 'send_invoice: facture introuvable'; end if;
  if v_inv.status <> 'draft' then
    raise exception 'send_invoice: déjà envoyée (statut %)', v_inv.status;
  end if;
  if v_inv.total_htg <= 0 then
    raise exception 'send_invoice: total nul — ajoutez au moins une ligne';
  end if;

  -- Numéro lisible, séquence atomique par pro.
  update zabelie_biz_professionals
     set next_invoice_seq = next_invoice_seq + 1
   where id = v_inv.professional_id
   returning next_invoice_seq - 1 into v_seq;

  update zabelie_biz_invoices
     set status = 'sent',
         invoice_number = 'FCT-' || lpad(v_seq::text, 6, '0'),
         updated_at = now()
   where id = p_invoice
   returning * into v_inv;
  return v_inv;
end;
$$;
revoke all on function zabelie_biz_send_invoice(uuid) from public, anon, authenticated;

-- ───────────────────────── RPC — confirmer un paiement (cœur money-path) ────
-- Idempotent, montant vérifié, crédit IMMÉDIAT du net au solde disponible du
-- pro (SANS escrow). Commission figée depuis la config au moment du paiement.
create or replace function zabelie_biz_confirm_invoice_payment(
  p_invoice      uuid,
  p_provider     payment_rail,
  p_provider_ref text,
  p_amount       bigint,
  p_idempotency  text          -- ex: 'biz_pay:<order_ref>' — anti-rejeu
) returns zabelie_biz_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv        zabelie_biz_invoices;
  v_bps        integer;
  v_commission bigint;
  v_net        bigint;
  v_owner      uuid;
  v_wallet     uuid;
  v_pay        zabelie_biz_payments;
begin
  -- Rejeu : même clé déjà encaissée → on renvoie le paiement existant.
  select * into v_pay from zabelie_biz_payments where idempotency_key = p_idempotency;
  if found then return v_pay; end if;

  select * into v_inv from zabelie_biz_invoices where id = p_invoice for update;
  if not found then raise exception 'confirm: facture introuvable'; end if;
  if v_inv.status not in ('sent', 'partially_paid', 'overdue') then
    raise exception 'confirm: facture non payable (statut %)', v_inv.status;
  end if;
  if p_amount <= 0 then raise exception 'confirm: montant invalide'; end if;
  if v_inv.paid_htg + p_amount > v_inv.total_htg then
    raise exception 'confirm: sur-paiement refusé (reste dû %)',
      v_inv.total_htg - v_inv.paid_htg;
  end if;

  -- Commission depuis la config (figée sur le paiement).
  select value into v_bps from zabelie_biz_config where key = 'commission_bps';
  v_bps := coalesce(v_bps, 1000);
  v_commission := round(p_amount::numeric * v_bps / 10000);
  v_net := p_amount - v_commission;

  -- Wallet du pro (créé à la volée). owner_id = user du pro = profiles.id.
  select user_id into v_owner from zabelie_biz_professionals
   where id = v_inv.professional_id;
  insert into wallets (owner_id) values (v_owner) on conflict (owner_id) do nothing;
  select id into v_wallet from wallets where owner_id = v_owner;

  -- Enregistre le paiement (idempotent par clé unique).
  insert into zabelie_biz_payments
    (invoice_id, provider, provider_ref, amount_htg, commission_htg, net_htg,
     rate_bps, status, idempotency_key)
  values
    (p_invoice, p_provider, p_provider_ref, p_amount, v_commission, v_net,
     v_bps, 'confirmed', p_idempotency)
  returning * into v_pay;

  -- Crédit IMMÉDIAT du net au solde DISPONIBLE (sans escrow) + ligne au ledger.
  insert into wallet_transactions
    (wallet_id, type, amount_htg, idempotency_key, reference)
  values
    (v_wallet, 'credit', v_net, 'biz_invoice_credit:' || v_pay.id,
     'Facture ' || coalesce(v_inv.invoice_number, left(v_inv.id::text, 8)));
  update wallets set balance_htg = balance_htg + v_net where id = v_wallet;

  -- Avance l'état de la facture.
  update zabelie_biz_invoices
     set paid_htg = paid_htg + p_amount,
         status = (case when paid_htg + p_amount >= total_htg then 'paid'
                        else 'partially_paid' end)::zabelie_biz_invoice_status,
         updated_at = now()
   where id = p_invoice;

  return v_pay;
end;
$$;
revoke all on function zabelie_biz_confirm_invoice_payment(uuid, payment_rail, text, bigint, text)
  from public, anon, authenticated;

-- ───────────────────────── RPC — annuler (VOID si non payée) ────────────────
create or replace function zabelie_biz_void_invoice(p_invoice uuid)
returns zabelie_biz_invoices
language plpgsql
security definer
set search_path = public
as $$
declare v_inv zabelie_biz_invoices;
begin
  select * into v_inv from zabelie_biz_invoices where id = p_invoice for update;
  if not found then raise exception 'void: facture introuvable'; end if;
  if v_inv.paid_htg > 0 then
    raise exception 'void: facture déjà encaissée — impossible d''annuler';
  end if;
  update zabelie_biz_invoices set status = 'void', updated_at = now()
   where id = p_invoice returning * into v_inv;
  return v_inv;
end;
$$;
revoke all on function zabelie_biz_void_invoice(uuid) from public, anon, authenticated;

-- ───────────────────────── RPC — portail client (par token, SANS login) ────
-- Seule fonction Business exposée à anon. Ne renvoie QUE des colonnes sûres,
-- pour la facture du token — jamais d'ID interne, jamais une autre facture.
create or replace function zabelie_biz_get_invoice_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_inv zabelie_biz_invoices; v_result jsonb;
begin
  select * into v_inv from zabelie_biz_invoices
   where public_token = p_token and status <> 'draft';
  if not found then return null; end if;

  select jsonb_build_object(
    'invoice_number', v_inv.invoice_number,
    'status',         v_inv.status,
    'total_htg',      v_inv.total_htg,
    'paid_htg',       v_inv.paid_htg,
    'currency',       v_inv.currency,
    'due_date',       v_inv.due_date,
    'professional',   (select display_name from zabelie_biz_professionals
                        where id = v_inv.professional_id),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'label', label, 'qty', qty,
               'unit_price_htg', unit_price_htg, 'line_total_htg', line_total_htg)
             order by sort_order)
      from zabelie_biz_invoice_items where invoice_id = v_inv.id), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
-- Exposée au portail public (lecture d'une facture par token opaque uniquement).
revoke all on function zabelie_biz_get_invoice_by_token(text) from public;
grant execute on function zabelie_biz_get_invoice_by_token(text) to anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0023_harden_points_trigger.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 0023 — Durcissement : révocation d'EXECUTE sur la fonction-trigger fidélité
-- ============================================================================
-- L'advisor sécurité Supabase (lint 0028/0029) signale que
-- `fn_points_ledger_update_balance()` (trigger de maj du solde de points, 0021)
-- est SECURITY DEFINER et exposée à anon/authenticated via /rest/v1/rpc.
--
-- Non exploitable en pratique (Postgres refuse d'appeler une fonction
-- « returns trigger » hors contexte trigger), mais on aligne cette fonction sur
-- la règle du projet : AUCUNE fonction SECURITY DEFINER n'est exécutable par le
-- client. Le trigger continue de s'exécuter normalement — le déclenchement d'un
-- trigger ne dépend pas du privilège EXECUTE (il tourne au nom du propriétaire).
-- ============================================================================

revoke all on function fn_points_ledger_update_balance()
  from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0024_p0_hardening.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 0024 — Durcissements P0 (revue Team Agents 2026-07-15, BL-101 + BL-102)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- BL-102 / C-5 — Intégrité de la preuve sociale.
-- La policy « products_seller_write_own » (0002) autorisait le vendeur à écrire
-- TOUTES les colonnes de sa ligne via PostgREST — y compris sales_count,
-- rating_sum, rating_count (censés n'être écrits que par confirm_payment et le
-- trigger reviews). Or AUCUNE écriture produit ne passe par le client : la
-- création (app/api/products) et la modération (product-status) utilisent le
-- service role. On retire donc toute écriture directe client (policy + grants,
-- ceinture et bretelles). La lecture (policies select de 0002) est inchangée.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "products_seller_write_own" on products;
revoke insert, update, delete on products from anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- BL-101 / C-1 — État terminal pour les paiements abandonnés.
-- Un checkout abandonné (l'acheteur ferme l'onglet avant de payer) laissait le
-- paiement 'pending' pour toujours : la fenêtre du réconciliateur (ASC limit 50)
-- finissait saturée de cadavres et un paiement réellement encaissé au-delà de
-- la fenêtre n'était plus jamais réconcilié (invariant n°3 violé à terme).
-- Pattern : expiration des sessions façon Stripe (checkout.session.expired).
--
-- Le réconciliateur appelle cette fonction quand MonCash ne connaît pas (404)
-- ou ne confirme pas le paiement ET que celui-ci a plus de 48 h. Garde-fous EN
-- BASE (pas seulement dans l'appelant) :
--   • no-op si le paiement n'est plus 'pending' (jamais toucher un confirmé) ;
--   • no-op si le paiement a moins de 48 h (une confirmation tardive reste
--     possible — confirm_payment demeure la seule vérité) ;
--   • la commande n'est annulée que si elle est encore 'pending'.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function zabelie_expire_stale_payment(
  p_idempotency_key text,
  p_reason          text default 'abandoned'
) returns payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment payments;
begin
  select * into v_payment
    from payments
   where idempotency_key = p_idempotency_key
   for update;

  if not found then
    raise exception 'zabelie_expire_stale_payment: aucun paiement pour %',
      p_idempotency_key;
  end if;

  -- Jamais toucher un paiement déjà terminal (confirmé/échoué) : no-op rejouable.
  if v_payment.status <> 'pending' then
    return v_payment;
  end if;

  -- Trop récent : une confirmation tardive reste possible → no-op.
  if v_payment.created_at > now() - interval '48 hours' then
    return v_payment;
  end if;

  update payments
     set status = 'failed',
         raw = coalesce(raw, '{}'::jsonb)
               || jsonb_build_object('expired_reason', p_reason,
                                     'expired_at', now())
   where id = v_payment.id
   returning * into v_payment;

  -- La commande est libérée uniquement si rien ne l'a fait avancer entre-temps.
  update orders
     set status = 'cancelled'
   where id = v_payment.order_id
     and status = 'pending';

  return v_payment;
end;
$$;
revoke all on function zabelie_expire_stale_payment(text, text)
  from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0025_wallet_ledger_guard.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 0025 — BL-123 (C-14) : wallet_transactions devient APPEND-ONLY par trigger
-- ============================================================================
-- Le ledger topup est protégé contre UPDATE/DELETE depuis 0010, mais le livre
-- unique wallet_transactions (crédits vendeurs marketplace + factures Business)
-- ne l'était pas : le service role pouvait techniquement réécrire l'historique.
-- Même standard partout : l'historique d'argent ne se corrige que par une
-- écriture compensatoire, jamais par modification.

create or replace function zabelie_wallet_ledger_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'wallet_transactions est APPEND-ONLY : % interdit (corriger par écriture compensatoire)', tg_op;
end;
$$;

create trigger zabelie_wallet_ledger_immutable
  before update or delete on wallet_transactions
  for each row execute function zabelie_wallet_ledger_guard();

-- Cohérence 0023 : une fonction-trigger n'est pas appelable hors trigger, mais
-- on la révoque quand même (règle projet : rien d'exécutable côté client).
revoke all on function zabelie_wallet_ledger_guard()
  from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0026_fix_wallet_guard_searchpath.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 0026 — Correctif : search_path figé sur zabelie_wallet_ledger_guard (0025)
-- ============================================================================
-- L'advisor sécurité Supabase (lint 0011, function_search_path_mutable) a
-- signalé que zabelie_wallet_ledger_guard (trigger BL-123, 0025) n'avait pas
-- `set search_path = public` — écart par rapport à la règle du projet
-- (cohérence avec 0018 fix_search_path et 0023 pour le trigger équivalent
-- fn_points_ledger_update_balance). Comportement inchangé : create or replace
-- ne recrée pas le trigger, juste la fonction.

create or replace function zabelie_wallet_ledger_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'wallet_transactions est APPEND-ONLY : % interdit (corriger par écriture compensatoire)', tg_op;
end;
$$;

revoke all on function zabelie_wallet_ledger_guard()
  from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0027_coupon_consume_on_confirm.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 0027 — BL-133 (C-2) : coupon consommé au paiement CONFIRMÉ, pas au checkout
-- ============================================================================
-- Avant : /api/checkout appelait zabelie_coupon_consume() immédiatement, donc
-- tout échec après coup (session MonCash abandonnée, 3G coupée, retour
-- réseau perdu) brûlait un usage pour une vente qui n'a jamais eu lieu — un
-- code « 20 usages » pouvait s'épuiser à ~30 % de ventes réelles.
-- Après : le checkout ne fait qu'une vérification de plafond en LECTURE
-- (couponApplies, déjà en place côté serveur) et fige le prix remisé ; la
-- consommation atomique (zabelie_coupon_consume, inchangée depuis 0012) est
-- désormais déclenchée par confirm_payment, une fois le paiement CONFIRMÉ.
-- Un paiement déjà collecté n'est jamais rejeté pour une histoire de quota
-- coupon : si la course est perdue entre checkout et confirmation (deux
-- acheteurs sur le tout dernier usage), la consommation échoue en silence
-- (best-effort) mais le paiement, lui, reste confirmé — le montant a déjà
-- été facturé au prix remisé, impossible de le corriger après coup.

alter table orders
  add column coupon_id uuid references zabelie_coupons (id) on delete set null;

drop function if exists confirm_payment(text, text, jsonb, integer, integer);

create or replace function confirm_payment(
  p_idempotency_key text,
  p_provider_ref    text default null,
  p_raw             jsonb default null,
  p_amount          integer default null,
  p_usd_cents       integer default null
)
returns payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment    payments;
  v_order      orders;
  v_seller_id  uuid;
  v_wallet_id  uuid;
  v_credited   integer;
  v_tier       creator_tier;
  v_rate_bps   integer;
  v_commission bigint;
  v_net        bigint;
begin
  select * into v_payment
    from payments
   where idempotency_key = p_idempotency_key
   for update;

  if not found then
    raise exception 'confirm_payment: aucun paiement pour idempotency_key %',
      p_idempotency_key;
  end if;

  if v_payment.status = 'confirmed' then
    return v_payment; -- rejeu : no-op
  end if;

  select * into v_order from orders where id = v_payment.order_id;

  -- Garde-fou HTG (MonCash) : opérateur ≠ commande → REJET.
  if p_amount is not null and p_amount <> v_order.amount_htg then
    update payments
       set status = 'failed',
           provider_ref = coalesce(p_provider_ref, provider_ref),
           raw = coalesce(p_raw, raw)
     where id = v_payment.id
     returning * into v_payment;
    update orders set status = 'disputed' where id = v_payment.order_id;
    return v_payment;
  end if;

  -- Garde-fou USD (Stripe/Zelle) : montant reçu ≠ montant figé → REJET.
  if p_usd_cents is not null
     and (v_payment.expected_usd_cents is null
          or p_usd_cents <> v_payment.expected_usd_cents) then
    update payments
       set status = 'failed',
           provider_ref = coalesce(p_provider_ref, provider_ref),
           raw = coalesce(p_raw, raw)
     where id = v_payment.id
     returning * into v_payment;
    update orders set status = 'disputed' where id = v_payment.order_id;
    return v_payment;
  end if;

  update payments
     set status = 'confirmed',
         provider_ref = coalesce(p_provider_ref, provider_ref),
         raw = coalesce(p_raw, raw),
         confirmed_at = now()
   where id = v_payment.id
   returning * into v_payment;

  update orders set status = 'paid'
   where id = v_payment.order_id
   returning * into v_order;

  -- BL-133 : consommation du coupon ICI, au paiement confirmé — jamais au
  -- checkout. Best-effort : si le quota a basculé entre-temps (course sur le
  -- tout dernier usage), la fonction renvoie FALSE sans lever d'exception —
  -- le paiement, déjà facturé au prix remisé, reste confirmé quoi qu'il arrive.
  if v_order.coupon_id is not null then
    perform zabelie_coupon_consume(v_order.coupon_id);
  end if;

  -- Vendeur + tier → commission/net (LEDGER HTG, identique pour tous les rails).
  select p.seller_id into v_seller_id
    from products p join orders o on o.product_id = p.id
   where o.id = v_order.id;

  select tier into v_tier from profiles where id = v_seller_id;
  v_rate_bps   := commission_rate_bps(v_tier);
  v_commission := round(v_order.amount_htg::numeric * v_rate_bps / 10000);
  v_net        := v_order.amount_htg - v_commission;

  insert into wallets (owner_id) values (v_seller_id)
  on conflict (owner_id) do nothing;
  select id into v_wallet_id from wallets where owner_id = v_seller_id;

  with ins as (
    insert into escrow_entries (order_id, wallet_id, amount_htg, matures_at, status)
    values (v_order.id, v_wallet_id, v_net, now() + interval '7 days', 'maturing')
    on conflict (order_id) do nothing
    returning amount_htg
  )
  update wallets w
     set pending_htg = w.pending_htg + (select amount_htg from ins)
   where w.id = v_wallet_id
     and exists (select 1 from ins);

  get diagnostics v_credited = row_count;

  if v_credited > 0 then
    insert into wallet_transactions
      (wallet_id, type, amount_htg, order_id, idempotency_key, reference)
    values
      (v_wallet_id, 'credit', v_net, v_order.id, 'order_credit:' || v_order.id,
       'Vente nette en attente #' || left(v_order.id::text, 8))
    on conflict (idempotency_key) do nothing;

    insert into platform_earnings (order_id, gross_htg, commission_htg, rate_bps)
    values (v_order.id, v_order.amount_htg, v_commission, v_rate_bps)
    on conflict (order_id) do nothing;

    update products p set sales_count = p.sales_count + 1
     where p.id = v_order.product_id;
  end if;

  return v_payment;
end;
$$;
revoke all on function confirm_payment(text, text, jsonb, integer, integer)
  from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0028_catalogue_search_indexes.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 0028 — BL-134 (C-7b) : index recherche/perf catalogue
-- ============================================================================
-- Le catalogue et la recherche (lib/products.ts) filtrent toujours sur
-- status='published' triés par created_at desc, et cherchent en `ilike` sur
-- title/description (+ désormais le nom du créateur, BL-134). L'index simple
-- sur `status` sert le filtre mais pas le tri ; `ilike '%...%'` fait un seq
-- scan sans trigram. Aucun changement de comportement — perf uniquement.

create extension if not exists pg_trgm;

-- Remplace products_status_idx (0001) : la colonne composite sert aussi bien
-- les requêtes filtrant sur status seul que celles triées par created_at.
drop index if exists products_status_idx;
create index products_status_created_idx on products (status, created_at desc);

create index products_title_trgm_idx
  on products using gin (title gin_trgm_ops);
create index products_description_trgm_idx
  on products using gin (description gin_trgm_ops);

-- BL-134 : la recherche couvre maintenant le nom du créateur (lib/products.ts).
create index profiles_display_name_trgm_idx
  on profiles using gin (display_name gin_trgm_ops);

-- ═══════════════════════════════════════════════════════════════════════════
-- 0029_topup_daily_cap_atomic.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 0029 — BL-137 (C-9, ALERTE BRH) : plafond journalier topup — fuseau Haïti
-- + contrôle atomique
-- ============================================================================
-- Deux écarts signalés par la revue Team Agents (arbitrage porteur : corriger
-- les deux) :
--   (a) le plafond journalier (25 000 HTG/j, engagement Circ. 121) était
--       calculé sur le jour UTC — la journée basculait à 19-20 h heure
--       d'Haïti, pas à minuit local ;
--   (b) le contrôle était lecture-puis-écriture en 2 requêtes séparées
--       (app/api/zabelie/topup/orders/route.ts) : deux requêtes concurrentes
--       du même compte pouvaient toutes les deux lire un cumul sous le
--       plafond avant que l'une des deux n'insère — fenêtre de course bornée
--       seulement par le rate-limit (5 tentatives/min), pas par la base.
--
-- Fonction unique qui vérifie TOUS les plafonds (montant/tx, jour Haïti,
-- vélocité bénéficiaires/heure) et insère la commande dans le MÊME appel,
-- sous un verrou par acheteur (pg_advisory_xact_lock) : zéro fenêtre de
-- course, quel que soit le nombre de requêtes simultanées.

create or replace function zabelie_topup_reserve_order(
  p_buyer_id           uuid,
  p_product_id         uuid,
  p_beneficiary_phone  text,
  p_operator           topup_operator,
  p_face_value_htg     integer,
  p_amount_htg         integer,
  p_cost_htg           integer,
  p_rail               payment_rail,
  p_expected_usd_cents integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_per_tx_htg  integer;
  v_per_day_htg integer;
  v_velocity    integer;
  v_spent_today bigint;
  v_hour_phones integer;
  v_phone_seen  boolean;
  v_day_start   timestamptz;
  v_order       zabelie_topup_orders;
begin
  -- Sérialise PAR ACHETEUR : ferme la fenêtre de course entre la lecture du
  -- cumul et l'insertion — deux requêtes concurrentes du même compte
  -- s'exécutent désormais l'une après l'autre, jamais en parallèle.
  perform pg_advisory_xact_lock(hashtext(p_buyer_id::text));

  select coalesce(max(value) filter (where key = 'per_tx_htg'), 5000),
         coalesce(max(value) filter (where key = 'per_day_htg'), 25000),
         coalesce(max(value) filter (where key = 'distinct_beneficiaries_per_hour'), 5)
    into v_per_tx_htg, v_per_day_htg, v_velocity
    from zabelie_topup_limits;

  if p_amount_htg > v_per_tx_htg then
    return jsonb_build_object('ok', false, 'reason', 'per_tx', 'cap_htg', v_per_tx_htg);
  end if;

  -- (a) Jour HAÏTIEN, pas UTC — minuit heure de Port-au-Prince.
  v_day_start := date_trunc('day', now() at time zone 'America/Port-au-Prince')
                   at time zone 'America/Port-au-Prince';

  select coalesce(sum(amount_htg), 0) into v_spent_today
    from zabelie_topup_orders
   where buyer_id = p_buyer_id
     and created_at >= v_day_start
     -- Mêmes exclusions que l'ancien calcul JS : une commande 'created'
     -- (session paiement jamais établie) ou définitivement 'failed'/
     -- 'refunded' ne compte pas contre le plafond.
     and status not in ('failed', 'refunded', 'created');

  if v_spent_today + p_amount_htg > v_per_day_htg then
    return jsonb_build_object('ok', false, 'reason', 'per_day', 'cap_htg', v_per_day_htg);
  end if;

  select exists(
    select 1 from zabelie_topup_orders
     where buyer_id = p_buyer_id
       and beneficiary_phone = p_beneficiary_phone
       and created_at >= now() - interval '1 hour'
  ) into v_phone_seen;

  select count(distinct beneficiary_phone) into v_hour_phones
    from zabelie_topup_orders
   where buyer_id = p_buyer_id
     and created_at >= now() - interval '1 hour';

  if not v_phone_seen and v_hour_phones + 1 > v_velocity then
    return jsonb_build_object('ok', false, 'reason', 'velocity');
  end if;

  insert into zabelie_topup_orders (
    buyer_id, product_id, operator, beneficiary_phone, face_value_htg,
    amount_htg, cost_htg, rail, expected_usd_cents, status
  ) values (
    p_buyer_id, p_product_id, p_operator, p_beneficiary_phone, p_face_value_htg,
    p_amount_htg, p_cost_htg, p_rail, p_expected_usd_cents, 'created'
  )
  returning * into v_order;

  return jsonb_build_object('ok', true, 'order_id', v_order.id, 'amount_htg', v_order.amount_htg);
end;
$$;
revoke all on function zabelie_topup_reserve_order(
  uuid, uuid, text, topup_operator, integer, integer, integer, payment_rail, integer
) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0030_reserve_order_single_scan.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 0030 — Audit post-revue : zabelie_topup_reserve_order, un seul scan 1 h
-- ============================================================================
-- Deux constats de l'audit du travail 0024→0029 :
--   • v_phone_seen (exists) et v_hour_phones (count distinct) scannaient DEUX
--     fois la même fenêtre (buyer_id + 1 h) en deux requêtes, toutes deux
--     tenues SOUS le verrou par acheteur → fusionnées en une seule requête ;
--     le verrou est tenu moins longtemps (moins de sérialisation par compte).
--   • Note d'architecture (pourquoi un verrou consultatif ici et pas l'UPDATE
--     conditionnel de 0012/zabelie_coupon_consume) : le quota coupon est un
--     COMPTEUR MONO-LIGNE — l'UPDATE conditionnel verrouille naturellement
--     cette ligne. Le plafond journalier est un AGRÉGAT sur plusieurs lignes
--     de zabelie_topup_orders : il n'existe aucune ligne unique à verrouiller,
--     d'où pg_advisory_xact_lock par acheteur. Règle pour la suite :
--     compteur mono-ligne → UPDATE conditionnel ; agrégat multi-lignes →
--     advisory lock (clé = acheteur).
-- Comportement STRICTEMENT inchangé — les tests T6a-d passent tels quels.

create or replace function zabelie_topup_reserve_order(
  p_buyer_id           uuid,
  p_product_id         uuid,
  p_beneficiary_phone  text,
  p_operator           topup_operator,
  p_face_value_htg     integer,
  p_amount_htg         integer,
  p_cost_htg           integer,
  p_rail               payment_rail,
  p_expected_usd_cents integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_per_tx_htg  integer;
  v_per_day_htg integer;
  v_velocity    integer;
  v_spent_today bigint;
  v_hour_phones integer;
  v_phone_seen  boolean;
  v_day_start   timestamptz;
  v_order       zabelie_topup_orders;
begin
  -- Sérialise PAR ACHETEUR (agrégat multi-lignes : pas de ligne unique à
  -- verrouiller, cf. en-tête) : ferme la fenêtre de course entre la lecture
  -- du cumul et l'insertion.
  perform pg_advisory_xact_lock(hashtext(p_buyer_id::text));

  select coalesce(max(value) filter (where key = 'per_tx_htg'), 5000),
         coalesce(max(value) filter (where key = 'per_day_htg'), 25000),
         coalesce(max(value) filter (where key = 'distinct_beneficiaries_per_hour'), 5)
    into v_per_tx_htg, v_per_day_htg, v_velocity
    from zabelie_topup_limits;

  if p_amount_htg > v_per_tx_htg then
    return jsonb_build_object('ok', false, 'reason', 'per_tx', 'cap_htg', v_per_tx_htg);
  end if;

  -- Jour HAÏTIEN, pas UTC — minuit heure de Port-au-Prince (BL-137).
  v_day_start := date_trunc('day', now() at time zone 'America/Port-au-Prince')
                   at time zone 'America/Port-au-Prince';

  select coalesce(sum(amount_htg), 0) into v_spent_today
    from zabelie_topup_orders
   where buyer_id = p_buyer_id
     and created_at >= v_day_start
     -- 'created' (session paiement jamais établie) et les états définitifs
     -- 'failed'/'refunded' ne comptent pas contre le plafond.
     and status not in ('failed', 'refunded', 'created');

  if v_spent_today + p_amount_htg > v_per_day_htg then
    return jsonb_build_object('ok', false, 'reason', 'per_day', 'cap_htg', v_per_day_htg);
  end if;

  -- Vélocité : UN seul scan de la fenêtre 1 h (bool_or sur zéro ligne = NULL
  -- → coalesce false).
  select count(distinct beneficiary_phone),
         coalesce(bool_or(beneficiary_phone = p_beneficiary_phone), false)
    into v_hour_phones, v_phone_seen
    from zabelie_topup_orders
   where buyer_id = p_buyer_id
     and created_at >= now() - interval '1 hour';

  if not v_phone_seen and v_hour_phones + 1 > v_velocity then
    return jsonb_build_object('ok', false, 'reason', 'velocity');
  end if;

  insert into zabelie_topup_orders (
    buyer_id, product_id, operator, beneficiary_phone, face_value_htg,
    amount_htg, cost_htg, rail, expected_usd_cents, status
  ) values (
    p_buyer_id, p_product_id, p_operator, p_beneficiary_phone, p_face_value_htg,
    p_amount_htg, p_cost_htg, p_rail, p_expected_usd_cents, 'created'
  )
  returning * into v_order;

  return jsonb_build_object('ok', true, 'order_id', v_order.id, 'amount_htg', v_order.amount_htg);
end;
$$;
revoke all on function zabelie_topup_reserve_order(
  uuid, uuid, text, topup_operator, integer, integer, integer, payment_rail, integer
) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0031_points_caps_expiry.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 0031 — Points : plafond de solde + borne d'expiration (garde-fous R3/R4)
-- ============================================================================
-- Applique les Règles 3 et 4 de docs/CASHBACK-GARDE-FOUS.md (référence
-- normative, audit 2026-07-23) :
--   • R3 — un compte ne peut pas accumuler au-delà d'un plafond configurable.
--     Le crédit est ÉCRÊTÉ (jamais refusé) et le surplus est tracé dans
--     metadata : c'est la preuve, pour le dossier BRH, que l'accumulation
--     s'arrête — les points ne peuvent pas devenir une réserve de valeur.
--   • R4 — aucun lot ne peut expirer à plus de `max_expiry_days` (défaut
--     180 j). Le défaut d'appel reste 90 j ; la borne empêche un appelant
--     futur de créer des points quasi-permanents.
-- Aucun point n'a encore circulé (système débranché) : pas de backfill.

-- ───────────────── Table de configuration (modèle zabelie_topup_limits) ─────

create table points_limits (
  key        text primary key,
  value      integer not null,
  comment    text,
  updated_at timestamptz not null default now()
);
insert into points_limits (key, value, comment) values
  ('max_balance_points', 2000,
   'Plafond de solde par compte (R3). ~2 coupons majeurs ≈ 3 000 HTG de remise max au catalogue actuel. Ajustable par le porteur.'),
  ('max_expiry_days', 180,
   'Durée de vie maximale d''un lot de points (R4). Le défaut d''attribution reste 90 j.');

alter table points_limits enable row level security;
-- Pas de policy : lecture/écriture réservées au service_role (bypass RLS).
revoke all on points_limits from anon, authenticated;

-- ───────────────── award_points : écrêtage au plafond + borne d'expiration ──

create or replace function award_points(
  p_user_id uuid,
  p_points integer,
  p_reason points_reason,
  p_order_id uuid default null,
  p_expires_in_days integer default 90,
  p_metadata jsonb default '{}'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_balance integer;
  v_cap integer;
  v_max_days integer;
  v_award integer;
  v_metadata jsonb := p_metadata;
begin
  if p_points <= 0 then
    raise exception 'award_points: points must be positive';
  end if;

  select coalesce(max(value) filter (where key = 'max_balance_points'), 2000),
         coalesce(max(value) filter (where key = 'max_expiry_days'), 180)
    into v_cap, v_max_days
    from points_limits;

  -- R4 : borne dure — on REFUSE (erreur de programmation, pas un cas métier).
  if p_expires_in_days > v_max_days then
    raise exception
      'award_points: expiration % j > plafond % j (R4, docs/CASHBACK-GARDE-FOUS.md)',
      p_expires_in_days, v_max_days;
  end if;

  -- Verrou du solde AVANT lecture : balance_after cohérent même sous
  -- attributions concurrentes (crée la ligne à 0 si absente).
  insert into points_balances (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  select balance into v_balance
  from points_balances
  where user_id = p_user_id
  for update;

  -- R3 : écrêtage au plafond. Solde plein → aucun lot, aucun mouvement
  -- (renvoie null) ; l'appelant n'a rien à gérer, l'accumulation s'arrête.
  v_award := least(p_points, greatest(v_cap - v_balance, 0));
  if v_award = 0 then
    return null;
  end if;
  if v_award < p_points then
    v_metadata := v_metadata || jsonb_build_object(
      'clipped_points', p_points - v_award,
      'max_balance_points', v_cap
    );
  end if;

  insert into points_batches
    (user_id, points_earned, points_remaining, reason, order_id, expires_at)
  values
    (p_user_id, v_award, v_award, p_reason, p_order_id,
     now() + make_interval(days => p_expires_in_days))
  returning id into v_batch_id;

  insert into points_ledger
    (user_id, batch_id, delta, balance_after, reason, order_id, metadata)
  values
    (p_user_id, v_batch_id, v_award, v_balance + v_award, p_reason, p_order_id,
     v_metadata);

  return v_batch_id;
end;
$$;
revoke all on function award_points(uuid, integer, points_reason, uuid, integer, jsonb)
  from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0032_manual_payouts.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 0032 — Chantier 0, lot 0.a : enregistrement des RÈGLEMENTS MANUELS vendeurs
-- ============================================================================
-- Contexte (docs/19-CHANTIER-0-RETRAIT-VENDEUR.md) : aucune route de
-- décaissement n'existe ; les vendeurs sont réglés À LA MAIN (virement MonCash
-- direct contre reçu). Sans enregistrement, le registre continuerait d'afficher
-- une dette DÉJÀ PAYÉE : solde créditeur fantôme, double réclamation possible,
-- et toute réconciliation ultérieure partirait d'une base fausse.
--
-- Ce lot ne crée PAS de retrait self-service (lot 0.b) : il inscrit un
-- paiement qui a déjà eu lieu hors plateforme.
--
-- Opposabilité (question Q7 du dossier BRH) : la table `payouts` d'origine ne
-- portait ni référence de reçu, ni date de règlement, ni trace de l'auteur de
-- l'enregistrement. Sans ces éléments, un règlement n'est pas démontrable.
-- ============================================================================

-- ───────────────────────── 1. Enrichissement de payouts ─────────────────────

create type payout_method as enum ('moncash', 'especes', 'virement', 'autre');

alter table payouts
  add column method      payout_method,
  add column reference   text,        -- n° de reçu MonCash / preuve du virement
  add column paid_at     timestamptz, -- date du règlement RÉEL (≠ enregistrement)
  add column recorded_by uuid references profiles (id),
  add column note        text;

-- La référence du reçu est la clé naturelle d'un règlement : deux
-- enregistrements ne peuvent pas se réclamer du même justificatif.
create unique index payouts_reference_uniq
  on payouts (reference) where reference is not null;

create index payouts_paid_at_idx on payouts (paid_at desc) where status = 'paid';

-- ───────────────────── 2. RPC — zabelie_record_manual_payout ────────────────
-- Débit ATOMIQUE sous verrou du portefeuille + trace opposable + écriture au
-- grand livre (append-only depuis 0025). Idempotent sur la référence du reçu :
-- ressaisir le même justificatif ne débite pas deux fois.

create function zabelie_record_manual_payout(
  p_wallet_id   uuid,
  p_amount_htg  bigint,
  p_method      payout_method,
  p_reference   text,
  p_recorded_by uuid,
  p_note        text        default null,
  p_paid_at     timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref       text;
  v_key       text;
  v_balance   bigint;
  v_payout_id uuid;
begin
  if p_amount_htg is null or p_amount_htg <= 0 then
    raise exception 'record_manual_payout: montant strictement positif requis';
  end if;

  -- Référence OBLIGATOIRE : c'est ce qui rend le règlement démontrable.
  v_ref := nullif(btrim(coalesce(p_reference, '')), '');
  if v_ref is null then
    raise exception
      'record_manual_payout: référence du reçu obligatoire (opposabilité du règlement)';
  end if;
  v_key := 'payout:' || v_ref;

  -- Idempotence AVANT le verrou : rejeu du même reçu = no-op, jamais d'erreur
  -- (l'admin qui resoumet un formulaire ne doit pas payer deux fois).
  if exists (select 1 from wallet_transactions where idempotency_key = v_key) then
    select id into v_payout_id from payouts where reference = v_ref;
    select balance_htg into v_balance from wallets where id = p_wallet_id;
    return jsonb_build_object(
      'ok', true, 'duplicate', true,
      'payout_id', v_payout_id, 'balance_htg', v_balance
    );
  end if;

  -- Verrou du portefeuille : sérialise les enregistrements concurrents.
  select balance_htg into v_balance
    from wallets where id = p_wallet_id for update;
  if v_balance is null then
    raise exception 'record_manual_payout: portefeuille introuvable';
  end if;

  -- On ne décaisse que le solde DISPONIBLE. Le solde en attente (escrow non
  -- maturé) n'est pas encore acquis au vendeur : le régler serait une avance.
  if v_balance < p_amount_htg then
    raise exception
      'record_manual_payout: solde disponible insuffisant (% demandés, % disponibles) — le solde en attente n''est pas décaissable',
      p_amount_htg, v_balance;
  end if;

  insert into payouts
    (wallet_id, amount_htg, status, method, reference, paid_at, recorded_by, note)
  values
    (p_wallet_id, p_amount_htg, 'paid', p_method, v_ref,
     coalesce(p_paid_at, now()), p_recorded_by, p_note)
  returning id into v_payout_id;

  update wallets set balance_htg = balance_htg - p_amount_htg
   where id = p_wallet_id;

  -- Grand livre : débit NÉGATIF (convention 0006), immuable (trigger 0025).
  insert into wallet_transactions
    (wallet_id, type, amount_htg, idempotency_key, reference)
  values
    (p_wallet_id, 'payout', -p_amount_htg, v_key, 'Règlement manuel ' || v_ref);

  return jsonb_build_object(
    'ok', true, 'duplicate', false,
    'payout_id', v_payout_id, 'balance_htg', v_balance - p_amount_htg
  );
end;
$$;
revoke all on function zabelie_record_manual_payout(
  uuid, bigint, payout_method, text, uuid, text, timestamptz
) from public, anon, authenticated;

-- ─────────────── 3. Vue de contrôle — encours dû aux vendeurs ───────────────
-- Lecture seule, service_role uniquement (aucune policy → invisible au client).
-- Sert l'écran d'apurement ET le contrôle de solvabilité (docs/19 §3.2) :
-- le total `du_total_htg` doit être COUVERT par le solde réel du compte
-- marchand MonCash. Ce rapprochement reste manuel tant que Digicel n'expose
-- pas d'endpoint de solde.

create view zabelie_seller_balances as
select w.id                as wallet_id,
       w.owner_id,
       p.display_name,
       w.balance_htg       as disponible_htg,
       w.pending_htg       as en_attente_htg,
       w.balance_htg + w.pending_htg as du_total_htg,
       (select coalesce(sum(po.amount_htg), 0)
          from payouts po
         where po.wallet_id = w.id and po.status = 'paid') as deja_regle_htg
  from wallets w
  join profiles p on p.id = w.owner_id
 where w.balance_htg + w.pending_htg > 0;

revoke all on zabelie_seller_balances from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0033_wallet_coherence.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 0033 — Chantier 0, lot 0.c.1 : contrôle de cohérence du registre
-- ============================================================================
-- On ne peut pas apurer une dette contre un registre dont on ignore s'il dit
-- vrai. Ce lot vérifie une identité comptable EXACTE, vraie après chaque
-- opération d'argent du système :
--
--     Σ(wallet_transactions.amount_htg)  =  balance_htg + pending_htg
--
-- Démonstration (tous les flux existants) :
--   • vente confirmée      (0005/0006) : ledger +net   · pending +net
--   • maturation J+7       (0006)      : pending −x    · balance +x  (pas de
--                                        ledger — la somme des deux est stable)
--   • remboursement avant  (0006)      : ledger −x     · pending −x
--   • remboursement après  (0006)      : ledger −x     · balance −x
--   • facture Business     (0022)      : ledger +net   · balance +net
--   • règlement manuel     (0032)      : ledger −x     · balance −x
--
-- Un écart signifie qu'un solde a bougé hors du grand livre : soit un bug,
-- soit une écriture directe en base. Il faut le savoir AVANT de payer, pas
-- après. Ce contrôle est purement interne — il ne dit rien du solde réel du
-- compte marchand MonCash (contrôle de solvabilité, docs/19 §3.2, manuel).
-- ============================================================================

-- ─────────────────── 1. Vue de cohérence, portefeuille par portefeuille ─────

create view zabelie_wallet_coherence as
select w.id                                   as wallet_id,
       w.owner_id,
       p.display_name,
       w.balance_htg,
       w.pending_htg,
       w.balance_htg + w.pending_htg          as solde_registre_htg,
       coalesce(l.somme, 0)                   as somme_ledger_htg,
       (w.balance_htg + w.pending_htg) - coalesce(l.somme, 0) as ecart_htg
  from wallets w
  join profiles p on p.id = w.owner_id
  left join (
    select wallet_id, sum(amount_htg) as somme
      from wallet_transactions
     group by wallet_id
  ) l on l.wallet_id = w.id;

revoke all on zabelie_wallet_coherence from anon, authenticated;

-- ─────────────────── 2. Rapport global (cron + écran admin) ─────────────────
-- Renvoie l'état du registre en un objet. `ok` = false dès qu'un écart existe.

create function zabelie_solvency_report()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'genere_a',            now(),
    -- Ce que la plateforme doit, au total : le nombre à couvrir par le solde
    -- réel du compte marchand MonCash.
    'du_total_htg',        coalesce(sum(solde_registre_htg), 0),
    'disponible_htg',      coalesce(sum(balance_htg), 0),
    'en_attente_htg',      coalesce(sum(pending_htg), 0),
    'vendeurs_crediteurs', count(*) filter (where solde_registre_htg > 0),
    -- Cohérence interne : tout écart est anormal.
    'ecarts',              count(*) filter (where ecart_htg <> 0),
    'ecart_total_htg',     coalesce(sum(ecart_htg), 0),
    'ok',                  count(*) filter (where ecart_htg <> 0) = 0
  )
  from zabelie_wallet_coherence;
$$;
revoke all on function zabelie_solvency_report() from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0034_payout_requests.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 0034 — Chantier 0, lot 0.b : RETRAIT SELF-SERVICE (la voie de sortie)
-- ============================================================================
-- Le lot 0.a inscrit un règlement déjà versé. Celui-ci donne au vendeur le
-- moyen de DEMANDER son argent — c'est la voie de sortie dont l'absence est au
-- cœur du dossier BRH (docs/17 §2.5).
--
-- Flux :  requested → paid        (l'admin a viré, il inscrit le reçu)
--                  ↘ rejected     (le solde est restitué)
--
-- INVARIANT PRÉSERVÉ (0033) : Σ(wallet_transactions) = balance_htg + pending_htg
--   • demande  : balance −x · ledger 'payout' −x        → identité tenue
--   • paiement : aucun mouvement (déjà débité)          → identité tenue
--   • rejet    : balance +x · ledger 'credit' +x        → identité tenue
-- Le rejet passe par une ÉCRITURE COMPENSATOIRE, jamais par une correction du
-- grand livre (règle 0025 : l'historique d'argent ne se réécrit pas).
--
-- Le débit a lieu DÈS LA DEMANDE : les fonds sont immobilisés, ce qui empêche
-- de demander deux fois le même argent.
-- ============================================================================

-- ─────────────────── 1. Paramètres (table de config, jamais en dur) ─────────

create table zabelie_payout_limits (
  key        text primary key,
  value      integer not null,
  comment    text,
  updated_at timestamptz not null default now()
);
insert into zabelie_payout_limits (key, value, comment) values
  ('min_payout_htg', 500,
   'Montant minimum d''une demande de retrait (HTG). Évite les micro-virements dont les frais dépassent l''intérêt.'),
  ('max_per_request_htg', 100000,
   'Plafond par demande (HTG). Garde-fou anti-erreur de saisie, pas une limite de droit.'),
  ('cooldown_hours', 24,
   'Délai minimum entre deux demandes d''un même vendeur.');

alter table zabelie_payout_limits enable row level security;
revoke all on zabelie_payout_limits from anon, authenticated;

-- Motif de rejet, tracé sur la demande.
alter table payouts add column rejected_reason text;

create index payouts_pending_idx on payouts (status, created_at)
  where status in ('requested', 'processing');

-- ─────────────────── 2. RPC — zabelie_request_payout (vendeur) ──────────────
-- Prend l'UTILISATEUR, jamais un wallet_id fourni par le client.

create function zabelie_request_payout(
  p_user_id    uuid,
  p_amount_htg bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet    uuid;
  v_balance   bigint;
  v_min       integer;
  v_max       integer;
  v_cooldown  integer;
  v_last      timestamptz;
  v_suspended timestamptz;
  v_payout_id uuid;
begin
  select coalesce(max(value) filter (where key = 'min_payout_htg'), 500),
         coalesce(max(value) filter (where key = 'max_per_request_htg'), 100000),
         coalesce(max(value) filter (where key = 'cooldown_hours'), 24)
    into v_min, v_max, v_cooldown
    from zabelie_payout_limits;

  if p_amount_htg is null or p_amount_htg <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'montant_invalide');
  end if;
  if p_amount_htg < v_min then
    return jsonb_build_object('ok', false, 'reason', 'sous_minimum', 'min_htg', v_min);
  end if;
  if p_amount_htg > v_max then
    return jsonb_build_object('ok', false, 'reason', 'au_dessus_plafond', 'max_htg', v_max);
  end if;

  -- Compte suspendu (modération) : décaissement bloqué — prévu dès 0017.
  select suspended_at into v_suspended from profiles where id = p_user_id;
  if v_suspended is not null then
    return jsonb_build_object('ok', false, 'reason', 'compte_suspendu');
  end if;

  select id into v_wallet from wallets where owner_id = p_user_id;
  if v_wallet is null then
    return jsonb_build_object('ok', false, 'reason', 'portefeuille_absent');
  end if;

  -- Sérialise les demandes concurrentes du même vendeur.
  select balance_htg into v_balance from wallets where id = v_wallet for update;

  -- Une seule demande ouverte à la fois : sinon l'admin traite des montants
  -- qui se chevauchent.
  if exists (select 1 from payouts
              where wallet_id = v_wallet and status in ('requested', 'processing')) then
    return jsonb_build_object('ok', false, 'reason', 'demande_en_cours');
  end if;

  select max(created_at) into v_last from payouts where wallet_id = v_wallet;
  if v_last is not null and v_last > now() - make_interval(hours => v_cooldown) then
    return jsonb_build_object('ok', false, 'reason', 'delai_non_ecoule',
                              'cooldown_hours', v_cooldown);
  end if;

  -- Seul le solde DISPONIBLE est retirable (l'escrow non maturé ne l'est pas).
  if v_balance < p_amount_htg then
    return jsonb_build_object('ok', false, 'reason', 'solde_insuffisant',
                              'disponible_htg', v_balance);
  end if;

  insert into payouts (wallet_id, amount_htg, status)
  values (v_wallet, p_amount_htg, 'requested')
  returning id into v_payout_id;

  -- Immobilisation immédiate + écriture au grand livre (identité 0033).
  update wallets set balance_htg = balance_htg - p_amount_htg where id = v_wallet;
  insert into wallet_transactions
    (wallet_id, type, amount_htg, idempotency_key, reference)
  values
    (v_wallet, 'payout', -p_amount_htg, 'payout_req:' || v_payout_id,
     'Demande de retrait ' || left(v_payout_id::text, 8));

  return jsonb_build_object('ok', true, 'payout_id', v_payout_id,
                            'balance_htg', v_balance - p_amount_htg);
end;
$$;
revoke all on function zabelie_request_payout(uuid, bigint)
  from public, anon, authenticated;

-- ─────────────── 3. RPC — zabelie_settle_payout (admin, après virement) ─────
-- Aucun mouvement d'argent ici : le débit a eu lieu à la demande. On inscrit
-- la PREUVE (reçu, moyen, date, auteur) — opposabilité, cf. Q7 du dossier.

create function zabelie_settle_payout(
  p_payout_id   uuid,
  p_method      payout_method,
  p_reference   text,
  p_recorded_by uuid,
  p_note        text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payout payouts;
  v_ref    text;
begin
  v_ref := nullif(btrim(coalesce(p_reference, '')), '');
  if v_ref is null then
    raise exception 'settle_payout: référence du reçu obligatoire (opposabilité)';
  end if;

  select * into v_payout from payouts where id = p_payout_id for update;
  if not found then
    raise exception 'settle_payout: demande introuvable';
  end if;
  if v_payout.status = 'paid' then
    -- Rejeu : no-op (l'admin qui resoumet ne doit pas déclencher d'erreur).
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  if v_payout.status <> 'requested' and v_payout.status <> 'processing' then
    raise exception 'settle_payout: demande déjà close (%)', v_payout.status;
  end if;

  update payouts
     set status = 'paid', method = p_method, reference = v_ref,
         paid_at = now(), recorded_by = p_recorded_by, note = p_note
   where id = p_payout_id;

  return jsonb_build_object('ok', true, 'duplicate', false);
end;
$$;
revoke all on function zabelie_settle_payout(uuid, payout_method, text, uuid, text)
  from public, anon, authenticated;

-- ─────────────── 4. RPC — zabelie_reject_payout (admin) ─────────────────────
-- Restitue le solde par ÉCRITURE COMPENSATOIRE (le grand livre ne se corrige
-- jamais par modification — règle 0025).

create function zabelie_reject_payout(
  p_payout_id   uuid,
  p_reason      text,
  p_recorded_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payout payouts;
begin
  select * into v_payout from payouts where id = p_payout_id for update;
  if not found then
    raise exception 'reject_payout: demande introuvable';
  end if;
  if v_payout.status = 'rejected' then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  if v_payout.status = 'paid' then
    raise exception 'reject_payout: demande déjà réglée — corriger par un nouveau mouvement';
  end if;

  update payouts
     set status = 'rejected',
         rejected_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         recorded_by = p_recorded_by
   where id = p_payout_id;

  update wallets set balance_htg = balance_htg + v_payout.amount_htg
   where id = v_payout.wallet_id;

  insert into wallet_transactions
    (wallet_id, type, amount_htg, idempotency_key, reference)
  values
    (v_payout.wallet_id, 'credit', v_payout.amount_htg,
     'payout_rej:' || p_payout_id,
     'Annulation demande ' || left(p_payout_id::text, 8));

  return jsonb_build_object('ok', true, 'duplicate', false);
end;
$$;
revoke all on function zabelie_reject_payout(uuid, text, uuid)
  from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0035_categories.sql
-- ═══════════════════════════════════════════════════════════════════════════

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
  ('dijital-sevis',   1, 'Dijital & Sèvis',    'Digital & services',     'Digital & services',    true,  160);

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
join zabelie_categories p on p.slug = v.parent_slug and p.level = 1;

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
join zabelie_categories p on p.slug = v.parent_slug and p.level = 2;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0036_physical_products.sql
-- ═══════════════════════════════════════════════════════════════════════════

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
begin
  if p_quantity is null or p_quantity <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'quantite_invalide');
  end if;

  select coalesce(max(value), 30) into v_ttl
    from zabelie_stock_limits where key = 'reservation_ttl_minutes';

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

-- ═══════════════════════════════════════════════════════════════════════════
-- 0037_stock_money_path.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 0037 — Chantier B : branchement du STOCK sur le money-path
-- ============================================================================
-- Sans ce branchement, le modèle de stock de 0036 est du code mort : il ne
-- protège de rien tant qu'aucune commande ne le sollicite.
--
-- Règle : le mouvement de stock est ATOMIQUE avec le mouvement d'argent.
--   • paiement confirmé  → les unités réservées quittent le stock (vendues)
--   • remboursement      → les unités reviennent en vente
--   • paiement abandonné → idem (via l'expiration à 48 h)
--   • réservation échue  → relibérée par le cron (0036), TTL 30 min
--
-- Pourquoi en base et non dans l'application : si la consommation était faite
-- après coup côté serveur Next, un crash entre les deux laisserait la
-- réservation « held » — puis le cron la relibérerait, remettant en vente une
-- unité DÉJÀ VENDUE ET PAYÉE. Le seul endroit sûr est la transaction qui
-- confirme le paiement.
--
-- Les trois fonctions ci-dessous sont reprises À L'IDENTIQUE de leur dernière
-- version (0027, 0006, 0024) ; seul l'appel de stock est ajouté, signalé par
-- un commentaire « 0037 ».
-- ============================================================================

-- ─────────── 1. confirm_payment : consommation du stock à la vente ──────────

create or replace function confirm_payment(
  p_idempotency_key text,
  p_provider_ref    text default null,
  p_raw             jsonb default null,
  p_amount          integer default null,
  p_usd_cents       integer default null
)
returns payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment    payments;
  v_order      orders;
  v_seller_id  uuid;
  v_wallet_id  uuid;
  v_credited   integer;
  v_tier       creator_tier;
  v_rate_bps   integer;
  v_commission bigint;
  v_net        bigint;
begin
  select * into v_payment
    from payments
   where idempotency_key = p_idempotency_key
   for update;

  if not found then
    raise exception 'confirm_payment: aucun paiement pour idempotency_key %',
      p_idempotency_key;
  end if;

  if v_payment.status = 'confirmed' then
    return v_payment; -- rejeu : no-op
  end if;

  select * into v_order from orders where id = v_payment.order_id;

  -- Garde-fou HTG (MonCash) : opérateur ≠ commande → REJET.
  if p_amount is not null and p_amount <> v_order.amount_htg then
    update payments
       set status = 'failed',
           provider_ref = coalesce(p_provider_ref, provider_ref),
           raw = coalesce(p_raw, raw)
     where id = v_payment.id
     returning * into v_payment;
    update orders set status = 'disputed' where id = v_payment.order_id;
    -- 0037 : montant incohérent = pas de vente → le stock retourne en rayon.
    perform zabelie_release_stock(v_order.id);
    return v_payment;
  end if;

  -- Garde-fou USD (Stripe/Zelle) : montant reçu ≠ montant figé → REJET.
  if p_usd_cents is not null
     and (v_payment.expected_usd_cents is null
          or p_usd_cents <> v_payment.expected_usd_cents) then
    update payments
       set status = 'failed',
           provider_ref = coalesce(p_provider_ref, provider_ref),
           raw = coalesce(p_raw, raw)
     where id = v_payment.id
     returning * into v_payment;
    update orders set status = 'disputed' where id = v_payment.order_id;
    -- 0037 : idem côté rails USD.
    perform zabelie_release_stock(v_order.id);
    return v_payment;
  end if;

  update payments
     set status = 'confirmed',
         provider_ref = coalesce(p_provider_ref, provider_ref),
         raw = coalesce(p_raw, raw),
         confirmed_at = now()
   where id = v_payment.id
   returning * into v_payment;

  update orders set status = 'paid'
   where id = v_payment.order_id
   returning * into v_order;

  -- 0037 : la vente est faite — les unités réservées quittent définitivement
  -- le stock, dans LA MÊME transaction que le paiement. Idempotent (0 si déjà
  -- consommé) ; sans effet pour un produit digital, qui n'a pas de réservation.
  perform zabelie_consume_stock(v_order.id);

  -- BL-133 : consommation du coupon ICI, au paiement confirmé — jamais au
  -- checkout. Best-effort : si le quota a basculé entre-temps (course sur le
  -- tout dernier usage), la fonction renvoie FALSE sans lever d'exception —
  -- le paiement, déjà facturé au prix remisé, reste confirmé quoi qu'il arrive.
  if v_order.coupon_id is not null then
    perform zabelie_coupon_consume(v_order.coupon_id);
  end if;

  -- Vendeur + tier → commission/net (LEDGER HTG, identique pour tous les rails).
  select p.seller_id into v_seller_id
    from products p join orders o on o.product_id = p.id
   where o.id = v_order.id;

  select tier into v_tier from profiles where id = v_seller_id;
  v_rate_bps   := commission_rate_bps(v_tier);
  v_commission := round(v_order.amount_htg::numeric * v_rate_bps / 10000);
  v_net        := v_order.amount_htg - v_commission;

  insert into wallets (owner_id) values (v_seller_id)
  on conflict (owner_id) do nothing;
  select id into v_wallet_id from wallets where owner_id = v_seller_id;

  with ins as (
    insert into escrow_entries (order_id, wallet_id, amount_htg, matures_at, status)
    values (v_order.id, v_wallet_id, v_net, now() + interval '7 days', 'maturing')
    on conflict (order_id) do nothing
    returning amount_htg
  )
  update wallets w
     set pending_htg = w.pending_htg + (select amount_htg from ins)
   where w.id = v_wallet_id
     and exists (select 1 from ins);

  get diagnostics v_credited = row_count;

  if v_credited > 0 then
    insert into wallet_transactions
      (wallet_id, type, amount_htg, order_id, idempotency_key, reference)
    values
      (v_wallet_id, 'credit', v_net, v_order.id, 'order_credit:' || v_order.id,
       'Vente nette en attente #' || left(v_order.id::text, 8))
    on conflict (idempotency_key) do nothing;

    insert into platform_earnings (order_id, gross_htg, commission_htg, rate_bps)
    values (v_order.id, v_order.amount_htg, v_commission, v_rate_bps)
    on conflict (order_id) do nothing;

    update products p set sales_count = p.sales_count + 1
     where p.id = v_order.product_id;
  end if;

  return v_payment;
end;
$$;
revoke all on function confirm_payment(text, text, jsonb, integer, integer)
  from public, anon, authenticated;

-- ─────────── 2. refund_order : le stock revient en vente ────────────────────

create or replace function refund_order(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_esc escrow_entries;
begin
  select * into v_esc from escrow_entries where order_id = p_order_id for update;
  if not found then
    raise exception 'refund_order: aucun escrow pour order %', p_order_id;
  end if;

  if v_esc.status = 'reversed' then
    return 'already_reversed'; -- idempotent
  end if;

  if v_esc.status = 'maturing' then
    update wallets set pending_htg = pending_htg - v_esc.amount_htg
     where id = v_esc.wallet_id;
  else -- 'matured' : fonds déjà disponibles
    update wallets set balance_htg = balance_htg - v_esc.amount_htg
     where id = v_esc.wallet_id;
  end if;

  update escrow_entries set status = 'reversed' where id = v_esc.id;
  update orders set status = 'refunded' where id = p_order_id;

  insert into wallet_transactions
    (wallet_id, type, amount_htg, order_id, idempotency_key, reference)
  values
    (v_esc.wallet_id, 'debit', -v_esc.amount_htg, p_order_id,
     'order_refund:' || p_order_id, 'Remboursement #' || left(p_order_id::text, 8))
  on conflict (idempotency_key) do nothing;

  -- 0037 : la vente est annulée — les unités reviennent en vente. Sans effet
  -- si elles ont déjà été consommées puis restituées (statut non 'held').
  perform zabelie_release_stock(p_order_id);

  return 'reversed';
end;
$$;
revoke all on function refund_order(uuid) from public, anon, authenticated;

-- ─────────── 3. Expiration d'un paiement abandonné (48 h) ───────────────────

create or replace function zabelie_expire_stale_payment(
  p_idempotency_key text,
  p_reason          text default 'abandoned'
) returns payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment payments;
begin
  select * into v_payment
    from payments
   where idempotency_key = p_idempotency_key
   for update;

  if not found then
    raise exception 'zabelie_expire_stale_payment: aucun paiement pour %',
      p_idempotency_key;
  end if;

  -- Jamais toucher un paiement déjà terminal (confirmé/échoué) : no-op rejouable.
  if v_payment.status <> 'pending' then
    return v_payment;
  end if;

  -- Trop récent : une confirmation tardive reste possible → no-op.
  if v_payment.created_at > now() - interval '48 hours' then
    return v_payment;
  end if;

  update payments
     set status = 'failed',
         raw = coalesce(raw, '{}'::jsonb)
               || jsonb_build_object('expired_reason', p_reason,
                                     'expired_at', now())
   where id = v_payment.id
   returning * into v_payment;

  -- La commande est libérée uniquement si rien ne l'a fait avancer entre-temps.
  update orders
     set status = 'cancelled'
   where id = v_payment.order_id
     and status = 'pending';

  -- 0037 : filet de sécurité. Le TTL de réservation (30 min) aura normalement
  -- déjà relibéré le stock bien avant ces 48 h — cet appel garantit qu'aucune
  -- unité ne reste immobilisée si le cron d'expiration a été interrompu.
  perform zabelie_release_stock(v_payment.order_id);

  return v_payment;
end;
$$;
revoke all on function zabelie_expire_stale_payment(text, text)
  from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0038_stock_rupture_guard.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 0038 — CORRECTIF : survente quand la réservation expire pendant le paiement
-- ============================================================================
-- BUG REPRODUIT sur 0037 : TTL de réservation dépassé pendant que l'acheteur
-- est encore sur la page de l'opérateur (réseau instable). Le cron libère,
-- un autre acheteur prend l'unité, puis le premier paiement confirme.
-- `zabelie_consume_stock` ne trouvait plus de réservation « held », renvoyait
-- 0 sans rien dire, et confirm_payment poursuivait : commande `paid`, vendeur
-- crédité, acheteur débité — pour une unité qui n'existe plus.
-- → SURVENTE SILENCIEUSE. Sur un catalogue où le vendeur a une ou deux unités,
--   c'est un incident du premier jour de mauvais réseau, pas un cas d'école.
--
-- Trois issues possibles ; on retient la seule correcte :
--   ✗ survente silencieuse   (l'ancienne)
--   ✗ stock négatif          (visible mais faux)
--   ✓ RÉ-ACQUISITION si le stock est encore là, sinon RUPTURE explicite :
--     paiement encaissé mais NON honoré → commande `disputed`, vendeur NON
--     crédité, aucune livraison, motif inscrit pour remboursement.
--
-- On tente d'abord de reprendre l'unité : si personne ne l'a prise entre-temps,
-- la vente doit aboutir normalement. La rupture est le dernier recours.
-- ============================================================================

-- ─────────── 1. TTL : doit couvrir la durée de vie d'une session opérateur ──
-- 30 min était en dessous d'un paiement MonCash sur connexion instable — le
-- TTL doit être SUPÉRIEUR à la fenêtre de session de l'opérateur, jamais
-- l'inverse.
-- ⚠️ À VÉRIFIER contre le timeout réel de MonCash (non documenté publiquement,
--    à confirmer auprès de Digicel). 120 min est une borne prudente en
--    attendant, pas une valeur mesurée.
update zabelie_stock_limits
   set value = 120,
       comment = 'Durée de vie d''une réservation non payée (minutes). DOIT rester supérieure à la fenêtre de session de l''opérateur. ⚠️ Valeur prudente — à confirmer contre le timeout réel MonCash.',
       updated_at = now()
 where key = 'reservation_ttl_minutes';

-- ─────────── 2. Consommation STRICTE : ne ment jamais sur le stock ──────────

create function zabelie_consume_stock_strict(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r     record;
  v_avail integer;
  v_any   boolean := false;
begin
  -- PASSE 1 — vérifier que TOUTES les lignes peuvent être honorées avant d'en
  -- consommer une seule. Sans cela, une commande à plusieurs articles pourrait
  -- être partiellement consommée puis déclarée en rupture.
  for v_r in
    select * from zabelie_stock_reservations
     where order_id = p_order_id
     order by variant_id
     for update
  loop
    v_any := true;
    if v_r.status = 'released' then
      -- Le TTL a expiré pendant le paiement : l'unité est-elle encore là ?
      select quantity_available into v_avail
        from zabelie_stock where variant_id = v_r.variant_id for update;
      if coalesce(v_avail, 0) < v_r.quantity then
        return 'rupture';
      end if;
    end if;
  end loop;

  if not v_any then
    return 'aucune'; -- produit digital / sans stock : rien à faire
  end if;

  -- PASSE 2 — application.
  for v_r in
    select * from zabelie_stock_reservations
     where order_id = p_order_id
     order by variant_id
     for update
  loop
    if v_r.status = 'consumed' then
      continue; -- rejeu de confirm_payment
    elsif v_r.status = 'held' then
      update zabelie_stock
         set quantity_reserved = quantity_reserved - v_r.quantity,
             updated_at = now()
       where variant_id = v_r.variant_id;
    else -- 'released' : ré-acquisition, vérifiée en passe 1
      update zabelie_stock
         set quantity_available = quantity_available - v_r.quantity,
             updated_at = now()
       where variant_id = v_r.variant_id;
    end if;
    update zabelie_stock_reservations set status = 'consumed' where id = v_r.id;
  end loop;

  return 'ok';
end;
$$;
revoke all on function zabelie_consume_stock_strict(uuid)
  from public, anon, authenticated;

-- ─────────── 3. confirm_payment : la rupture bloque la vente ────────────────

create or replace function confirm_payment(
  p_idempotency_key text,
  p_provider_ref    text default null,
  p_raw             jsonb default null,
  p_amount          integer default null,
  p_usd_cents       integer default null
)
returns payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment    payments;
  v_order      orders;
  v_seller_id  uuid;
  v_wallet_id  uuid;
  v_credited   integer;
  v_tier       creator_tier;
  v_rate_bps   integer;
  v_commission bigint;
  v_net        bigint;
  v_stock      text;
begin
  select * into v_payment
    from payments where idempotency_key = p_idempotency_key for update;
  if not found then
    raise exception 'confirm_payment: aucun paiement pour idempotency_key %',
      p_idempotency_key;
  end if;
  if v_payment.status = 'confirmed' then
    return v_payment; -- rejeu : no-op
  end if;

  select * into v_order from orders where id = v_payment.order_id;

  -- Garde-fou HTG (MonCash) : opérateur ≠ commande → REJET.
  if p_amount is not null and p_amount <> v_order.amount_htg then
    update payments
       set status = 'failed',
           provider_ref = coalesce(p_provider_ref, provider_ref),
           raw = coalesce(p_raw, raw)
     where id = v_payment.id returning * into v_payment;
    update orders set status = 'disputed' where id = v_payment.order_id;
    perform zabelie_release_stock(v_order.id);
    return v_payment;
  end if;

  -- Garde-fou USD (Stripe/Zelle).
  if p_usd_cents is not null
     and (v_payment.expected_usd_cents is null
          or p_usd_cents <> v_payment.expected_usd_cents) then
    update payments
       set status = 'failed',
           provider_ref = coalesce(p_provider_ref, provider_ref),
           raw = coalesce(p_raw, raw)
     where id = v_payment.id returning * into v_payment;
    update orders set status = 'disputed' where id = v_payment.order_id;
    perform zabelie_release_stock(v_order.id);
    return v_payment;
  end if;

  -- 0038 : STOCK AVANT ARGENT. On ne crédite personne si la marchandise ne
  -- peut pas être livrée.
  v_stock := zabelie_consume_stock_strict(v_order.id);

  if v_stock = 'rupture' then
    -- Le paiement est RÉEL (montant correct, encaissé chez l'opérateur) : on
    -- ne peut pas le faire disparaître. Mais la vente ne peut pas aboutir.
    -- → paiement confirmé, commande en litige, AUCUN crédit vendeur, AUCUNE
    --   livraison. Le motif est inscrit pour que l'admin rembourse.
    update payments
       set status = 'confirmed',
           provider_ref = coalesce(p_provider_ref, provider_ref),
           raw = coalesce(p_raw, raw, '{}'::jsonb)
                 || jsonb_build_object('stock_rupture', true,
                                       'refund_required', true,
                                       'detected_at', now()),
           confirmed_at = now()
     where id = v_payment.id returning * into v_payment;
    update orders set status = 'disputed' where id = v_payment.order_id;
    return v_payment;
  end if;

  update payments
     set status = 'confirmed',
         provider_ref = coalesce(p_provider_ref, provider_ref),
         raw = coalesce(p_raw, raw),
         confirmed_at = now()
   where id = v_payment.id returning * into v_payment;

  update orders set status = 'paid'
   where id = v_payment.order_id returning * into v_order;

  if v_order.coupon_id is not null then
    perform zabelie_coupon_consume(v_order.coupon_id);
  end if;

  select p.seller_id into v_seller_id
    from products p join orders o on o.product_id = p.id where o.id = v_order.id;
  select tier into v_tier from profiles where id = v_seller_id;
  v_rate_bps   := commission_rate_bps(v_tier);
  v_commission := round(v_order.amount_htg::numeric * v_rate_bps / 10000);
  v_net        := v_order.amount_htg - v_commission;

  insert into wallets (owner_id) values (v_seller_id) on conflict (owner_id) do nothing;
  select id into v_wallet_id from wallets where owner_id = v_seller_id;

  with ins as (
    insert into escrow_entries (order_id, wallet_id, amount_htg, matures_at, status)
    values (v_order.id, v_wallet_id, v_net, now() + interval '7 days', 'maturing')
    on conflict (order_id) do nothing
    returning amount_htg
  )
  update wallets w
     set pending_htg = w.pending_htg + (select amount_htg from ins)
   where w.id = v_wallet_id and exists (select 1 from ins);

  get diagnostics v_credited = row_count;

  if v_credited > 0 then
    insert into wallet_transactions
      (wallet_id, type, amount_htg, order_id, idempotency_key, reference)
    values
      (v_wallet_id, 'credit', v_net, v_order.id, 'order_credit:' || v_order.id,
       'Vente nette en attente #' || left(v_order.id::text, 8))
    on conflict (idempotency_key) do nothing;

    insert into platform_earnings (order_id, gross_htg, commission_htg, rate_bps)
    values (v_order.id, v_order.amount_htg, v_commission, v_rate_bps)
    on conflict (order_id) do nothing;

    update products p set sales_count = p.sales_count + 1 where p.id = v_order.product_id;
  end if;

  return v_payment;
end;
$$;
revoke all on function confirm_payment(text, text, jsonb, integer, integer)
  from public, anon, authenticated;

-- ─────────── 4. Remboursement : JAMAIS de restock après expédition ──────────
-- Garantie explicite : `zabelie_release_stock` ne touche que les réservations
-- encore « held ». Après une vente, elles sont « consumed » — la marchandise
-- est partie. Un remboursement post-livraison ne remet donc RIEN en vente :
-- l'article est chez l'acheteur, peut-être abîmé, peut-être jamais rendu.
-- Le ré-approvisionnement après retour est une DÉCISION VENDEUR, saisie à la
-- main, jamais un effet de bord du remboursement.
comment on function zabelie_release_stock(uuid) is
  'Libère les réservations ENCORE HELD d''une commande. Sans effet sur les unités déjà vendues (consumed) : pas de restock automatique après livraison — c''est une décision vendeur.';

-- Vue de suivi : commandes payées mais non honorables (à rembourser).
create view zabelie_stock_ruptures as
select o.id            as order_id,
       o.buyer_id,
       o.amount_htg,
       p.confirmed_at,
       p.provider_ref,
       p.raw->>'detected_at' as detected_at
  from orders o
  join payments p on p.order_id = o.id
 where o.status = 'disputed'
   and p.status = 'confirmed'
   and coalesce((p.raw->>'stock_rupture')::boolean, false);
revoke all on zabelie_stock_ruptures from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0039_product_covers_bucket.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 0039 — Bucket PUBLIC pour les photos produits (chantier B, UI vendeur)
-- ============================================================================
-- « Photo, prix, quantité, publier » : la photo est le premier champ du chemin
-- nominal vendeur. cover_url existait depuis 0001 mais AUCUNE route ne
-- l'écrivait — les produits n'ont jamais eu d'image uploadée.
--
-- Contrairement à product-files (privé, livrables payants), les photos de
-- produits sont PUBLIQUES par nature : elles s'affichent sur le catalogue, les
-- boutiques et les cartes WhatsApp. Upload via service role uniquement
-- (app/api/products/cover), avec liste blanche d'images et taille bornée —
-- aucune policy storage.objects côté client.

insert into storage.buckets (id, name, public)
values ('product-covers', 'product-covers', true)
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0040_product_in_stock_flag.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 0040 — Exclusion des produits en rupture du catalogue (spec §9)
-- ============================================================================
-- « Les produits hors stock sont exclus par défaut des résultats — un catalogue
-- fantôme détruit la confiance. » Jusqu'ici la fiche produit affichait bien la
-- rupture et bloquait l'achat, mais le produit restait LISTÉ.
--
-- Pourquoi un booléen dénormalisé plutôt qu'un filtre dans la requête :
-- le catalogue est paginé et filtré côté PostgREST, qui ne sait pas exprimer
-- « existe une variante active avec du stock » sans sous-requête. Un flag
-- indexé garde le catalogue rapide sur 3G, ce qui est le vrai contrainte ici.
--
-- Cohérence garantie par TRIGGER, jamais par l'application : un stock modifié
-- par n'importe quel chemin (vente, réservation, expiration, correction admin)
-- met le flag à jour dans la même transaction.
--
-- Produits DIGITAUX : jamais touchés par ces triggers (ils n'ont pas de
-- variantes), donc in_stock reste `true` à vie. Aucun impact sur l'existant.
-- ============================================================================

alter table products
  add column in_stock boolean not null default true;

-- Le catalogue filtre systématiquement sur (status, in_stock).
create index products_catalogue_stock_idx
  on products (status, in_stock, created_at desc)
  where status = 'published';

-- ─────────────────── Recalcul du flag pour UN produit ───────────────────────

create function zabelie_refresh_in_stock(p_product_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_has_stock boolean;
begin
  -- STOCK PHYSIQUE (disponible + réservé), PAS le seul disponible.
  -- Sinon un panier abandonné sur un vendeur qui n'a qu'UNE unité retirerait
  -- le produit du catalogue pendant toute la durée du TTL (120 min) — pour
  -- tout le monde. Sur des pièces détachées où l'unité isolée est la norme,
  -- ça se produirait quotidiennement.
  -- Un produit invisible ne se vend jamais ; un produit visible et
  -- temporairement pris se vend deux heures plus tard. C'est la tentative
  -- d'achat qui échoue proprement si l'unité part entre-temps (0038).
  select exists (
      select 1
        from zabelie_product_variants v
        join zabelie_stock s on s.variant_id = v.id
       where v.product_id = p_product_id
         and v.active
         and s.quantity_available + s.quantity_reserved > 0
    ) into v_has_stock;

  -- Écriture SEULEMENT si le booléen change. Sans ce garde, chaque mouvement
  -- de stock verrouillerait la ligne `products` et en créerait une nouvelle
  -- version — sur le produit le plus vendu, à chaque réservation. Invisible à
  -- 300 SKU, mordant à 5 000.
  update products p
     set in_stock = v_has_stock
   where p.id = p_product_id
     and p.in_stock is distinct from v_has_stock;
end;
$$;
revoke all on function zabelie_refresh_in_stock(uuid) from public, anon, authenticated;

-- ─────────────────── Déclencheurs ───────────────────────────────────────────

create function zabelie_stock_flag_trigger()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_product uuid;
begin
  -- La table `zabelie_stock` porte variant_id ; `zabelie_product_variants`
  -- porte product_id. On remonte au produit dans les deux cas.
  if tg_table_name = 'zabelie_stock' then
    select product_id into v_product from zabelie_product_variants
     where id = coalesce(new.variant_id, old.variant_id);
  else
    v_product := coalesce(new.product_id, old.product_id);
  end if;

  if v_product is not null then
    perform zabelie_refresh_in_stock(v_product);
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function zabelie_stock_flag_trigger() from public, anon, authenticated;

create trigger zabelie_stock_flag
  after insert or update of quantity_available, quantity_reserved or delete on zabelie_stock
  for each row execute function zabelie_stock_flag_trigger();

-- Une variante désactivée ou supprimée retire aussi son stock du décompte.
create trigger zabelie_variant_flag
  after insert or update of active or delete on zabelie_product_variants
  for each row execute function zabelie_stock_flag_trigger();

-- ─────────────────── Backfill des produits existants ────────────────────────
-- Seuls les produits qui ONT des variantes sont concernés ; les digitaux
-- gardent `true` (valeur par défaut de la colonne).

update products p
   set in_stock = exists (
         select 1
           from zabelie_product_variants v
           join zabelie_stock s on s.variant_id = v.id
          where v.product_id = p.id and v.active
            and s.quantity_available + s.quantity_reserved > 0
       )
 where exists (select 1 from zabelie_product_variants v where v.product_id = p.id);

