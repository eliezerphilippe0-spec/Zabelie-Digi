select zabelie_migration_garde('0123_zabelie_seller_pixels.sql');

-- 0123 — Pixels publicitaires du vendeur (Meta, Google, TikTok).
--
-- Instruction porteur du 2026-10-03 (« Vas-y, commence par les pixels »),
-- après la comparaison avec Maketou, qui les propose.
--
-- ─── CE QUE LA TABLE GARDE ─────────────────────────────────────────────────
-- Un identifiant par régie, au FORMAT STRICT. C'est la ligne de défense qui
-- compte : ces identifiants finissent dans du JavaScript chargé sur la fiche
-- produit. Une contrainte qui n'admet que des chiffres (Meta), `G-`/`AW-` +
-- alphanumérique (Google) ou un alphanumérique majuscule (TikTok) rend toute
-- injection impossible EN BASE, avant même la validation applicative.
--
-- ─── ACCÈS ─────────────────────────────────────────────────────────────────
-- RLS dès la création : le vendeur lit et écrit SA ligne. Le visiteur n'y
-- lit rien : la page publique lit par le service, côté serveur, et n'envoie
-- au navigateur que les identifiants — qui sont publics par nature (ils
-- apparaissent dans le code de toute page qui charge un pixel).
--
-- ─── CE QUE ÇA N'EST PAS ───────────────────────────────────────────────────
-- Aucun pixel ne se charge sans le CONSENTEMENT du visiteur (bandeau, cookie
-- `zab_pub`). Zabelie n'ajoute aucun pixel à son propre compte.

create table zabelie_seller_pixels (
  seller_id      uuid primary key references profiles(id) on delete cascade,
  meta_pixel_id  text check (meta_pixel_id ~ '^[0-9]{8,20}$'),
  google_tag_id  text check (google_tag_id ~ '^(G|AW)-[A-Z0-9]{6,16}$'),
  tiktok_pixel_id text check (tiktok_pixel_id ~ '^[A-Z0-9]{15,25}$'),
  updated_at     timestamptz not null default now()
);

alter table zabelie_seller_pixels enable row level security;

create policy zabelie_seller_pixels_owner_select on zabelie_seller_pixels
  for select to authenticated using (seller_id = auth.uid());
create policy zabelie_seller_pixels_owner_insert on zabelie_seller_pixels
  for insert to authenticated with check (seller_id = auth.uid());
create policy zabelie_seller_pixels_owner_update on zabelie_seller_pixels
  for update to authenticated using (seller_id = auth.uid()) with check (seller_id = auth.uid());

revoke all on zabelie_seller_pixels from anon;
revoke delete on zabelie_seller_pixels from authenticated;
