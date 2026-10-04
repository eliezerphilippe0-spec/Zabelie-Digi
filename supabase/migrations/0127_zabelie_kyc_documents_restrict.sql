select zabelie_migration_garde('0127_zabelie_kyc_documents_restrict.sql');

-- 0127 — Plus aucun fichier d'identité orphelin.
--
-- Demande porteur du 2026-10-04 (« corrige les fichiers orphelins »).
--
-- `0079` liait `zabelie_kyc_documents.user_id` au profil avec ON DELETE
-- CASCADE. Supprimer un profil effaçait donc les LIGNES, mais jamais les
-- FICHIERS du bucket privé `kyc-documents` : la purge (cron 14:45) part des
-- lignes, un fichier sans ligne n'est plus jamais retiré. Une pièce
-- d'identité conservée sans trace, sans durée, sans responsable.
--
-- Deux corrections complémentaires :
--   • `DELETE /api/account` anonymise (au lieu de supprimer) tout compte qui
--     a des pièces : la purge planifiée les retire au terme annoncé (5 ans,
--     0126) ;
--   • ICI, en base : RESTRICT. Toute autre suppression d'un tel profil —
--     tableau de bord Supabase, script, futur code — échoue BRUYAMMENT au
--     lieu d'orpheliner des fichiers. La purge, elle, supprime d'abord les
--     fichiers puis les lignes : elle n'est pas concernée.
--
-- Mesuré le 2026-10-04 avant rédaction : 0 pièce stockée en production.

alter table zabelie_kyc_documents
  drop constraint zabelie_kyc_documents_user_id_fkey,
  add constraint zabelie_kyc_documents_user_id_fkey
    foreign key (user_id) references profiles (id) on delete restrict;

do $$
begin
  if (select confdeltype from pg_constraint
       where conname = 'zabelie_kyc_documents_user_id_fkey'
         and conrelid = 'zabelie_kyc_documents'::regclass) is distinct from 'r' then
    raise exception '0127 : la clé des pièces d''identité n''est pas en RESTRICT';
  end if;
end $$;
