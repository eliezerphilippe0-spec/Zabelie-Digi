select zabelie_migration_garde('0134_zabelie_product_covers_types.sql');

-- 0134 — Le bucket des photos produit n'accepte plus que des images
-- (revue du 2026-10-08, SEC-02 ; docs/REVUE-2026-10-08-vendre.md).
--
-- ─── POURQUOI ──────────────────────────────────────────────────────────────
-- `product-covers` est PUBLIC : la photo principale et la galerie y vivent,
-- servies au catalogue et aux cartes WhatsApp. Il acceptait n'importe quel
-- type (`allowed_mime_types` nul, lu en production le 2026-10-08), et la
-- route de la galerie stockait le type ANNONCÉ par le client : un fichier
-- nommé `.png` pouvait contenir autre chose et être servi depuis le domaine
-- de stockage du projet.
--
-- Les routes lisent désormais le format dans l'en-tête et stockent le type
-- DÉTECTÉ (`lib/image-limits.ts`, `formatDepuisEntete`). Le bucket le redit,
-- pour tout envoi qui ne passerait pas par elles.
--
-- ─── CE QUE LE BUCKET REDIT ────────────────────────────────────────────────
-- * trois types — jpeg, png, webp —, ceux que `formatDepuisEntete` reconnaît ;
-- * 1 536 000 octets, soit `COVER_MAX_OCTETS` (1 500 × 1024). Ce plafond
--   existait déjà en production, posé à la main et absent des migrations
--   (0120 l'avait noté) : il entre ici dans le dépôt, au même octet que la
--   borne applicative, et `tests/galerie-photos.test.ts` croise les deux.
--
-- Mesuré avant écriture (2026-10-08) : un seul objet dans le bucket, de type
-- `image/png`. Un réglage de bucket ne vaut que pour les envois futurs : rien
-- n'est supprimé ni réécrit.

update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'],
       file_size_limit = 1536000
 where id = 'product-covers';

do $$
begin
  if not exists (
    select 1 from storage.buckets
     where id = 'product-covers'
       and file_size_limit = 1536000
       and allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp']
       and allowed_mime_types <@ array['image/jpeg', 'image/png', 'image/webp']
  ) then
    raise exception '0134: bucket product-covers absent ou mal réglé';
  end if;
end $$;
