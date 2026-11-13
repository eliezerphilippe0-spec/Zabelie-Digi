-- Zabelie Digi — Codes promo vendeur (V-13, adaptés à Haïti)
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
