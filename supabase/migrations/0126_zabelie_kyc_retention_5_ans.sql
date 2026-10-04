select zabelie_migration_garde('0126_zabelie_kyc_retention_5_ans.sql');

-- 0126 — Conservation des pièces d'identité : 90 jours → 5 ans.
--
-- Décision porteur du 2026-10-04 (« 5 ans »), après lecture de la loi
-- haïtienne du 11 novembre 2013 sanctionnant le blanchiment de capitaux et le
-- financement du terrorisme : les établissements financiers conservent les
-- documents d'identité AU MOINS 5 ANS après la fin de la relation. Que
-- Zabelie y soit soumise relève du dossier BRH (`docs/17`), toujours ouvert ;
-- le porteur choisit la durée prudente en attendant.
--
-- `0079` portait un « défaut prudent 90, À CONFIRMER par le porteur ». C'est
-- confirmé autrement : 1 825 jours. La purge (`zabelie_kyc_docs_expires`,
-- cron 14:45) lit cette valeur ; elle compte depuis la DÉCISION, pas depuis la
-- fin de la relation — écart connu, consigné dans `docs/67`.
--
-- La politique de confidentialité annonce « 5 ans » dans les quatre langues ;
-- `tests/politique-confidentialite.test.ts` relie les deux.

update zabelie_kyc_config set retention_jours = 1825, updated_at = now() where id;

do $$
begin
  if (select retention_jours from zabelie_kyc_config where id) is distinct from 1825 then
    raise exception '0126 : la durée de conservation KYC n''est pas 1825 jours';
  end if;
end $$;

comment on column zabelie_kyc_config.retention_jours is
  'Jours de conservation des pièces d''identité après la décision. 1825 (5 ans) depuis 0126, décision porteur du 2026-10-04 alignée sur la loi haïtienne du 11/11/2013 (blanchiment). Annoncé dans la politique de confidentialité §9.';
