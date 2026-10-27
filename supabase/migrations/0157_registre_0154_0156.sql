select zabelie_migration_garde('0157_registre_0154_0156.sql');

-- ============================================================================
-- 0157 — Lignes de registre de 0154, 0155 et 0156
-- ============================================================================
-- Migration de REGISTRE SEUL, aucune donnée ni aucun schéma touché — la forme
-- de `0154` (et avant elle `0089`, `0097`). `0155` et `0156` ont été appliquées
-- en production le 2026-10-27 sur instruction directe du porteur (« applique
-- 0155 puis 0156 »), et leurs lignes de registre ont été INSÉRÉES À LA MAIN
-- (via MCP) aussitôt après. `0154`, elle, attendait un porteur depuis le
-- 2026-10-26 : une migration ne peut pas inscrire sa propre empreinte. Le
-- registre en base était complet, mais le DÉPÔT ne pouvait pas reconstruire ces
-- trois lignes. Ce fichier ferme l'écart, sur instruction directe du porteur
-- (« fais la migration registre », 2026-10-27).
--
-- `on conflict (filename) do nothing` : en production, les trois lignes
-- existent déjà, donc ces `insert` sont des NO-OP ; sur une base reconstruite,
-- ils recréent les lignes à l'identique. Les valeurs ci-dessous sont RECOPIÉES
-- de la base (relevé du 2026-10-27), `note` comprise : un enregistrement daté
-- ne se réécrit pas.
--
-- ⚠️ Chaîne de registre : comme `0154`, `0157` inscrit les PRÉCÉDENTES, pas
-- elle-même (circularité du hash). Sa propre ligne est la nouvelle frontière,
-- inscrite à la main après application, en attente d'un futur porteur.
--
-- `sha256` = empreinte CANONIQUE de chaque fichier (`scripts/zabelie-migration-hash.mjs`).
-- Les trois sont en `preuve='journal_supabase'` : le SQL stocké par Supabase a
-- été comparé au fichier du dépôt (md5 et longueur dans chaque `note`).
--
-- La post-condition compare chaque ligne EN BASE aux valeurs de ce fichier :
-- en production, où les `insert` ne font rien, c'est elle qui prouve que le
-- dépôt et la base disent la même chose.

insert into zabelie_schema_migrations
  (filename, sha256, applied_at, applied_by, statut, preuve, note)
values
  ('0154_registre_0150_0153.sql',
   'd2adf84327dc7fe798e7f619ca526383e0f09fe2992efd8115db53938d1a4c85',
   '2026-10-26 12:44:22.544726+00',
   $zb$porteur — autorisation permanente du 2026-08-17 + instruction directe « réconcilie les lignes de registre 0150-0153 » du 2026-10-26, appliquee par agent via MCP apply_migration$zb$,
   'appliquee', 'journal_supabase',
   $zb$Migration de REGISTRE SEUL, porteuse des lignes 0150-0153 (forme 0089/0097), pour rendre ces lignes REPRODUCTIBLES depuis le disque (elles avaient ete inserees a la main sans fichier). Appliquee verbatim via apply_migration (aucun drop) : statement stocke par Supabase == fichier du depot a l'octet pres sauf le saut de ligne final (md5 sans newline final = 00d5dd23b31057ae8c843929b63c0250 des deux cotes ; empreinte canonique d2adf843... identique) => journal_supabase. Les 4 inserts ont fait NO-OP en prod (on conflict do nothing, lignes 0150-0153 deja presentes depuis le 2026-10-26) ; la post-condition do-block a verifie 4/4 conformes. 0154 est la FRONTIERE du registre, en attente d'un futur porteur — une migration ne peut pas inscrire sa propre empreinte (circularite du hash).$zb$),
  ('0155_zabelie_boutik_visites.sql',
   '80d4786805b49ebf460a5e788cd5915e7c6deadb0adf16c9f70d0e89c9b5940c',
   '2026-10-27 16:11:27.541048+00',
   $zb$porteur — autorisation permanente du 2026-08-17 + instruction directe « applique 0155 puis 0156 » du 2026-10-27, appliquee par agent via MCP apply_migration$zb$,
   'appliquee', 'journal_supabase',
   $zb$PR-Z2 (#430, fusionnee le 2026-10-27, 93926d8). Eprouvee par la CI (sql-tests vert sur #430) avant application. Appliquee verbatim via apply_migration (aucun drop) : statement stocke par Supabase == fichier du depot a l'octet pres (md5 13bf0b276ff24365129adb616efff203, sha256 fichier 168cfd18ba40c79018d9ac8c9f9e70048d78d789ed3fd740065d9e88cb8858b9, 35764 octets). sha256 = empreinte canonique (scripts/zabelie-migration-hash.mjs). Verifie apres coup : table + RLS, 0 ligne, fonction executable par service_role seul, sonde voit la fonction ; seule absence de la sonde = zabelie_purge_sent_notices (0056, gelee volontairement).$zb$),
  ('0156_zabelie_vendeur_signaux.sql',
   'e427508bad3e706b850717d316fa0efda0d6b923738f42cf5cd87ebf199f2073',
   '2026-10-27 16:21:15.555584+00',
   $zb$porteur — autorisation permanente du 2026-08-17 + instruction directe « applique 0155 puis 0156 » du 2026-10-27, appliquee par agent via MCP apply_migration$zb$,
   'appliquee', 'journal_supabase',
   $zb$PR-Z4 (#431). Premiere version ARRETEE par le garde definer_exposition (fonction exposee a authenticated sans revue) : revue, alignee sur les regles de recherche de 0143, compte actif exige, comptes d'essai exclus, inscrite a la liste revue (commit cb9cbe4). Eprouvee par la CI (sql-tests vert sur cb9cbe4) avant application, apres 0155. Appliquee verbatim via apply_migration (aucun drop) : statement stocke == fichier du depot a l'octet pres (md5 d41b4418e65992f50e23c09ffcce55e4, sha256 fichier 38f883c6b1f97cec382328dba357de2780145fbf22d505e3a487e8abb52ba037, 37440 octets). sha256 = empreinte canonique. Verifie apres coup : security definer, anon refuse, authenticated autorise, sonde voit la fonction ; seule absence de la sonde = zabelie_purge_sent_notices (0056, gelee volontairement).$zb$)
on conflict (filename) do nothing;

do $$
declare
  v_ok integer;
begin
  select count(*) into v_ok
    from zabelie_schema_migrations r
    join (values
      ('0154_registre_0150_0153.sql', 'd2adf84327dc7fe798e7f619ca526383e0f09fe2992efd8115db53938d1a4c85', '2026-10-26 12:44:22.544726+00'::timestamptz),
      ('0155_zabelie_boutik_visites.sql', '80d4786805b49ebf460a5e788cd5915e7c6deadb0adf16c9f70d0e89c9b5940c', '2026-10-27 16:11:27.541048+00'::timestamptz),
      ('0156_zabelie_vendeur_signaux.sql', 'e427508bad3e706b850717d316fa0efda0d6b923738f42cf5cd87ebf199f2073', '2026-10-27 16:21:15.555584+00'::timestamptz)
    ) as attendu(filename, sha256, applied_at)
      on attendu.filename = r.filename
     and attendu.sha256 = r.sha256
     and attendu.applied_at = r.applied_at
   where r.statut = 'appliquee'
     and r.preuve = 'journal_supabase';
  if v_ok <> 3 then
    raise exception '0157 KO: % ligne(s) de registre 0154-0156 conforme(s) au fichier, 3 attendues', v_ok
      using errcode = 'ZB157';
  end if;

  raise notice '0157 OK: lignes de registre 0154-0156 presentes et conformes au depot (empreinte, date, statut, preuve)';
end $$;
