-- ============================================================================
-- CORRECTIF DU REGISTRE — empreintes canoniques
-- ============================================================================
-- Les 8 lignes enregistrées le 2026-07-26 portent l'empreinte du FICHIER,
-- alors que la chaîne transmise à la base avait des en-têtes de commentaires
-- abrégés. Un registre qui signale un écart dès le premier jour est un
-- registre qu'on apprend à ignorer.
--
-- Ces empreintes-ci sont CANONIQUES : commentaires retirés, espaces réduits
-- (scripts/zabelie-migration-hash.mjs, éprouvé par tests/migration-hash.test.ts).
-- Deux chaînes qui exécutent le même SQL donnent la même empreinte ; un seul
-- caractère exécutable qui change la fait diverger.
--
-- À exécuter une fois sur la production, puis vérifier avec la requête finale.
-- ============================================================================
update zabelie_schema_migrations set sha256 = '857bc20f8b0687ea48ff999a4d325a778a3d3c75a958bd6d0ed3a6cf94cbc26a' where filename = '0032_manual_payouts.sql' and sha256 <> '-';
update zabelie_schema_migrations set sha256 = 'f4d0790809afca6a6a3e44ed8104032666c38f4e7b4802557eb9480b706a981e' where filename = '0033_wallet_coherence.sql' and sha256 <> '-';
update zabelie_schema_migrations set sha256 = '6cca60f86296dbc884ee6242f214bb0151b7f4b1a4fff1c1eb909c184dd2e59c' where filename = '0034_payout_requests.sql' and sha256 <> '-';
update zabelie_schema_migrations set sha256 = 'b08828123a6263d2740d6ca4f6cdf5ee532c7f07727fc94e977ffe1dba124445' where filename = '0035_categories.sql' and sha256 <> '-';
update zabelie_schema_migrations set sha256 = '3736978cd9940aa9d58157620924bb26744cb669ce2485a97712829dcf41fc12' where filename = '0036_physical_products.sql' and sha256 <> '-';
update zabelie_schema_migrations set sha256 = 'dccd693ca88b00f150a3d39e4cd2cdfcde148340a3cc8e888b328d4f3a90f70c' where filename = '0039_product_covers_bucket.sql' and sha256 <> '-';
update zabelie_schema_migrations set sha256 = 'd90d186bcb174c3f9a9702e08d53e78670c95f95b5defb3a39aa3cb0ab365f83' where filename = '0041_migration_ledger.sql' and sha256 <> '-';
update zabelie_schema_migrations set sha256 = '5137fe1698cf8ff432410386769029059fc0827837792d2d35eff17d543ee3fd' where filename = '0042_order_ref.sql' and sha256 <> '-';

-- Vérification après exécution : chaque empreinte doit correspondre à la
-- sortie de `node scripts/zabelie-migration-hash.mjs`.
select filename, left(sha256, 12) as empreinte, note
  from zabelie_schema_migrations order by filename;
