-- 0127 — un profil qui a des pièces d'identité ne peut pas être supprimé
-- (les fichiers du bucket deviendraient orphelins). Transaction annulée.
--
--   R1. Connu-NÉGATIF : supprimer un profil avec pièces → foreign_key_violation.
--   R2. Connu-POSITIF : sans pièces, la suppression passe ; après la purge des
--       lignes (ce que fait le cron, fichiers d'abord), elle passe aussi.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000e0001', 'kyc-r1@test.local'),
  ('00000000-0000-0000-0000-0000000e0002', 'kyc-r2@test.local');
insert into profiles (id, display_name) select id, 'KYC' from auth.users
  where id::text like '00000000-0000-0000-0000-0000000e000%' on conflict (id) do nothing;
insert into zabelie_kyc_documents (user_id, kind, storage_path) values
  ('00000000-0000-0000-0000-0000000e0001', 'cin', 'test/kyc-r1-cin.jpg');

do $$
begin
  begin
    delete from profiles where id = '00000000-0000-0000-0000-0000000e0001';
    raise exception 'R1 KO : un profil avec pièces d''identité a été supprimé';
  exception when foreign_key_violation then null;
  end;
  if not exists (select 1 from zabelie_kyc_documents where user_id = '00000000-0000-0000-0000-0000000e0001') then
    raise exception 'R1 KO : les lignes de pièces ont disparu';
  end if;
  raise notice 'R1 OK — profil avec pièces : suppression refusée, rien d''orphelin';

  delete from profiles where id = '00000000-0000-0000-0000-0000000e0002';
  if exists (select 1 from profiles where id = '00000000-0000-0000-0000-0000000e0002') then
    raise exception 'R2 KO : profil sans pièces non supprimé';
  end if;
  delete from zabelie_kyc_documents where user_id = '00000000-0000-0000-0000-0000000e0001';
  delete from profiles where id = '00000000-0000-0000-0000-0000000e0001';
  raise notice 'R2 OK — sans pièces (ou après purge), la suppression passe';
end $$;

-- R3. Fermeture d'un compte avec un dossier EN ATTENTE : la clôture faite
--     par `DELETE /api/account` respecte la contrainte du dossier, et la
--     purge voit les pièces une fois le délai écoulé — jamais avant.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000e0003', 'kyc-r3@test.local');
insert into profiles (id, display_name) values ('00000000-0000-0000-0000-0000000e0003', 'KYC') on conflict (id) do nothing;
insert into zabelie_kyc_submissions (user_id) values ('00000000-0000-0000-0000-0000000e0003');
insert into zabelie_kyc_documents (user_id, kind, storage_path) values
  ('00000000-0000-0000-0000-0000000e0003', 'cin', 'test/kyc-r3-cin.jpg');

do $$
declare u uuid := '00000000-0000-0000-0000-0000000e0003';
begin
  if exists (select 1 from zabelie_kyc_docs_expires() where storage_path = 'test/kyc-r3-cin.jpg') then
    raise exception 'R3 KO : un dossier en attente est déjà purgeable';
  end if;
  -- Fixture d'une relation déjà close depuis le délai, mais dont le dossier
  -- administratif est seulement décidé à présent.
  update profiles set suspended_reason = 'account_closed', suspended_at = now() - make_interval(years =>
    (select retention_annees from zabelie_kyc_config) + 1) where id = u;
  update zabelie_kyc_submissions
     set status = 'rejected', decided_at = now(), decided_by = null, note_admin = 'Compte fermé avant décision'
   where user_id = u and status = 'pending';
  -- Le dossier vient d'être décidé, mais la relation est close depuis le
  -- délai retenu ; c'est la clôture, pas la décision, qui détermine la purge.
  if not exists (select 1 from zabelie_kyc_docs_expires() where storage_path = 'test/kyc-r3-cin.jpg') then
    raise exception 'R3 KO : le délai écoulé, la purge ne voit pas les pièces';
  end if;
  raise notice 'R3 OK — dossier en attente clos à la fermeture : purgé au terme, pas avant';
end $$;

rollback;
