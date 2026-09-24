select zabelie_migration_garde('0120_bucket_videos_produit.sql');

-- 0120 — Un bucket à part pour les vidéos produit (V-1B, docs/35 ; docs/66 §6.2).
--
-- ─── POURQUOI ──────────────────────────────────────────────────────────────
-- La vidéo produit est livrée depuis V-1B (0073, route
-- `/api/products/media/video`, écran `GalerieManager`) avec les arbitrages
-- porteur du 2026-08-15 : 60 s, 50 Mo. Elle téléversait dans
-- `product-covers`. Or ce bucket est plafonné à **1,5 Mo** en production — un
-- réglage posé à la main pour les couvertures, absent des migrations. Toute
-- vidéo réelle était donc REFUSÉE par le stockage, avant même la route de
-- confirmation. Mesuré le 2026-09-24 : 0 vidéo en base, 0 objet vidéo.
--
-- Élever le plafond de `product-covers` aurait ouvert 50 Mo aux couvertures ;
-- un bucket séparé garde chaque plafond à sa taille.
--
-- ─── CE QUE LE BUCKET REDIT ────────────────────────────────────────────────
-- * 50 Mo, la même borne que `MAX_VIDEO_BYTES` (lib/product-media.ts) — le
--   test `tests/bucket-videos.test.ts` croise les deux chiffres ;
-- * types vidéo seulement : mp4, webm, quicktime (iPhone), 3gpp (Android
--   d'entrée de gamme).
-- La route de confirmation revérifie taille et type sur l'objet réel.
--
-- ─── ACCÈS ─────────────────────────────────────────────────────────────────
-- Public en LECTURE par URL, comme les couvertures : la vidéo se montre sur
-- la fiche produit. Aucune policy sur `storage.objects` : l'écriture ne passe
-- que par un lien signé émis par le serveur pour UN chemin précis.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-videos', 'product-videos', true, 52428800,
        array['video/mp4', 'video/webm', 'video/quicktime', 'video/3gpp'])
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from storage.buckets
                  where id = 'product-videos' and public and file_size_limit = 52428800) then
    raise exception '0120: bucket product-videos absent ou mal réglé';
  end if;
end $$;
