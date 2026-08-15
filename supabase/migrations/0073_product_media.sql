select zabelie_migration_garde('0073_product_media.sql');

-- ============================================================================
-- 0073 — GALERIE PRODUIT : plusieurs médias par fiche (V-1A, docs/35)
-- ============================================================================
-- Jusqu'ici un produit porte UNE image (`products.cover_url`). Cette table
-- ajoute la galerie — photos d'abord ; le kind `video` est dans l'énumération
-- dès maintenant pour que la tranche B (téléversement signé) n'ait pas à
-- migrer le schéma, mais AUCUNE route n'accepte de vidéo tant qu'elle n'est
-- pas construite.
--
-- La couverture reste `cover_url` — la carte catalogue, les aperçus WhatsApp
-- et l'existant ne bougent pas. La galerie s'AJOUTE sur la fiche.
--
-- Plafond par trigger (ZB073) : 6 images + 1 vidéo par produit — un plafond
-- app-side seul se contourne par appels concurrents.
-- ============================================================================

create table zabelie_product_media (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references products(id) on delete cascade,
  kind         text not null check (kind in ('image', 'video')),
  -- Chemin STOCKAGE (bucket product-covers) — nommé par le serveur, jamais
  -- par le client. L'URL publique se dérive, elle ne se stocke pas.
  storage_path text not null,
  position     integer not null default 0 check (position between 0 and 20),
  created_at   timestamptz not null default now()
);

create index zabelie_product_media_produit_idx
  on zabelie_product_media (product_id, position, created_at);

comment on table zabelie_product_media is
  'Galerie d''un produit (V-1A, docs/35) : photos (et vidéos en tranche B). Plafond ZB073 : 6 images + 1 vidéo. Écriture service-role uniquement (routes /api/products/media) ; lecture publique pour un produit publié, vendeur pour ses brouillons.';

-- ── Plafond ZB073 ───────────────────────────────────────────────────────────
create function zabelie_product_media_guard()
returns trigger
language plpgsql
as $$
declare v_count integer;
begin
  select count(*) into v_count
    from zabelie_product_media
   where product_id = new.product_id and kind = new.kind;
  if new.kind = 'image' and v_count >= 6 then
    raise exception 'ZB073: plafond de 6 images par produit atteint';
  end if;
  if new.kind = 'video' and v_count >= 1 then
    raise exception 'ZB073: une seule vidéo par produit';
  end if;
  return new;
end;
$$;

create trigger zabelie_product_media_guard_trg
  before insert on zabelie_product_media
  for each row execute function zabelie_product_media_guard();

-- ── RLS : lecture publiée-ou-vendeur, écriture service-role ─────────────────
alter table zabelie_product_media enable row level security;

create policy zabelie_product_media_read on zabelie_product_media
  for select using (
    exists (
      select 1 from products p
       where p.id = product_id
         and (p.status = 'published' or p.seller_id = auth.uid())
    )
  );

-- ── Post-conditions ─────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'zabelie_product_media_guard_trg'
       and tgrelid = 'zabelie_product_media'::regclass
  ) then
    raise exception '0073: trigger ZB073 absent';
  end if;
  if not exists (
    select 1 from pg_policies
     where tablename = 'zabelie_product_media'
       and policyname = 'zabelie_product_media_read'
  ) then
    raise exception '0073: policy de lecture absente';
  end if;
end $$;
