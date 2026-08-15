select zabelie_migration_garde('0076_delivery_info.sql');

-- ============================================================================
-- 0076 — COORDONNÉES DE LIVRAISON : nom, téléphone, adresse (V-5, docs/35)
-- ============================================================================
-- ⚠️ PAS sur `profiles` : profiles est en LECTURE PUBLIQUE (0002,
-- profiles_public_read) — une adresse y serait lisible par n'importe qui.
-- Table dédiée, et la règle porteur (« adresse visible quand sera le moment
-- d'envoyer ») est encodée DANS la RLS, pas dans une bonne intention :
--
--   • le titulaire lit et écrit SA ligne ;
--   • un vendeur ne lit la ligne d'un acheteur QUE s'il a une commande
--     PAYÉE de cet acheteur sur un de SES produits — c'est-à-dire
--     exactement au moment d'expédier, et jamais avant ni après coup
--     pour les curieux (une commande pending/cancelled n'ouvre rien).
--
-- La zone (komin/katye, 0069) et le point de repère restent sur profiles —
-- granularité ville, assumée publique. Ici : le nom complet, le téléphone
-- (le vrai canal de coordination des livraisons sur ce terrain), la rue.
-- ============================================================================

create table zabelie_delivery_info (
  user_id    uuid primary key references profiles(id) on delete cascade,
  full_name  text check (full_name is null or char_length(btrim(full_name)) between 2 and 120),
  phone      text check (phone is null or char_length(btrim(phone)) between 6 and 30),
  adres_liv  text check (adres_liv is null or char_length(btrim(adres_liv)) between 3 and 240),
  updated_at timestamptz not null default now()
);

comment on table zabelie_delivery_info is
  'Coordonnées de livraison (V-5, docs/35) — table SÉPARÉE de profiles (public-read). RLS : titulaire en lecture/écriture ; vendeur en lecture UNIQUEMENT s''il a une commande payée de cet acheteur (le « moment d''envoyer », encodé en policy).';

alter table zabelie_delivery_info enable row level security;

create policy zabelie_delivery_own_select on zabelie_delivery_info
  for select using (auth.uid() = user_id);
create policy zabelie_delivery_own_insert on zabelie_delivery_info
  for insert with check (auth.uid() = user_id);
create policy zabelie_delivery_own_update on zabelie_delivery_info
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Le « moment d'envoyer » : une commande PAYÉE de cet acheteur, sur un
-- produit du vendeur connecté. `paid` seulement — pending n'ouvre rien,
-- delivered/cancelled/refunded non plus : la fenêtre se referme.
create policy zabelie_delivery_seller_read on zabelie_delivery_info
  for select using (
    exists (
      select 1
        from orders o
        join products p on p.id = o.product_id
       where o.buyer_id = zabelie_delivery_info.user_id
         and p.seller_id = auth.uid()
         and o.status = 'paid'
    )
  );

-- ── Post-conditions ─────────────────────────────────────────────────────────
do $$
begin
  if (select count(*) from pg_policies
       where tablename = 'zabelie_delivery_info') <> 4 then
    raise exception '0076: quatre policies attendues';
  end if;
end $$;
