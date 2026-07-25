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
