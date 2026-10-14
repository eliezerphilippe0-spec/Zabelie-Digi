select zabelie_migration_garde('0140_zabelie_kyc_types.sql');

-- 0140 — Pièces KYC : le stockage n'accepte que des images et des PDF.
--
-- `kyc-documents` (0079) n'imposait aucun type de fichier : le type enregistré
-- était celui que le navigateur déclarait, et c'est lui qui décide comment la
-- pièce s'ouvre quand l'administrateur la consulte. La route impose désormais
-- le type d'après l'extension et vérifie les premiers octets
-- (`lib/kyc.ts`, `signatureKycValide`) ; le bucket refuse le reste, même pour
-- un dépôt qui ne passerait pas par elle. Même forme que 0134 pour les
-- couvertures. La limite de 5 Mo (KYC_MAX_BYTES) est déjà posée.

update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
 where id = 'kyc-documents';

do $$
begin
  if not exists (
    select 1 from storage.buckets
     where id = 'kyc-documents'
       and not public
       and allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
       and allowed_mime_types <@ array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  ) then
    raise exception '0140: bucket kyc-documents absent, public, ou mal réglé';
  end if;
end $$;
