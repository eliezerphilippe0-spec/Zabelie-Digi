-- ============================================================================
-- 0063 — LE REGISTRE COMPLET, ET LA PREUVE À CÔTÉ DE CHAQUE LIGNE
-- ============================================================================
-- `0062` a donné au registre un `statut`. Il restait le trou que `statut` ne
-- pouvait pas boucher : **62 fichiers de migration, 27 lignes**. Trente-cinq
-- fichiers n'avaient AUCUNE ligne — et un fichier sans ligne ressemble à un
-- fichier `redigee` alors qu'il dit l'inverse. Un registre incomplet ne se
-- lit pas : il s'interprète.
--
-- ─── LA QUESTION QUI DEVAIT ÊTRE TRANCHÉE AVANT D'ÉCRIRE ────────────────────
-- Avec quelle empreinte inscrire `0001`→`0030` ? Y mettre le hash du fichier
-- d'aujourd'hui reviendrait à AFFIRMER que ce fichier est ce qui a tourné il
-- y a des mois. Personne n'en sait rien, et une affirmation invérifiable dans
-- une colonne prévue pour la vérification est pire qu'une case vide : elle a
-- l'autorité d'une donnée.
--
-- Il existe une source, et elle a été interrogée : `supabase_migrations.
-- schema_migrations`, le registre interne de Supabase, conserve le SQL
-- INTÉGRAL de chaque migration passée par `apply_migration`. Croisement fait
-- le 2026-08-12, fichier par fichier, commentaires retirés et espaces
-- réduits des DEUX côtés : **49 fichiers sur 62 sont identiques au SQL que la
-- base a réellement reçu.** Ceux-là peuvent porter leur empreinte.
--
-- ⚠️ L'instrument de ce croisement a d'abord menti, et il faut le dire. Sa
-- première version ne retirait que les commentaires `--`, pas les blocs
-- `/* */`. `0058_panier` est donc ressorti « divergent » alors que seul un
-- en-tête JSDoc, absent du SQL reçu, faisait la différence. Le trou ne
-- pouvait produire que de FAUSSES divergences — deux chaînes identiques
-- restent identiques quelle que soit la normalisation — donc les 48 accords
-- tenaient ; il en manquait un. Réglé : blocs retirés des deux côtés, 49
-- accords, zéro divergence.
--
-- ─── LES TREIZE SANS TRACE, ET CE QU'ON PEUT HONNÊTEMENT EN DIRE ────────────
-- Treize fichiers n'ont aucune ligne au journal Supabase : `0025`→`0031`,
-- `0044`, `0051`→`0054`, `0056`. Le motif est net — ce sont exactement celles
-- passées par l'ÉDITEUR SQL plutôt que par `apply_migration`, plus celles
-- jamais appliquées. Pour les appliquées de ce groupe, l'empreinte de ce qui
-- a tourné est définitivement perdue : `sha256 = '-'`, et la ligne le dit.
--
-- Mais « appliquée » reste vérifiable autrement — par sonde contre le schéma,
-- comme `0062`. Sauf une, et elle mérite d'être nommée : **`0029` est
-- structurellement insondable.** C'est un `create or replace` sur
-- `zabelie_topup_reserve_order`, et `0030` remplace la même fonction en
-- conservant le `pg_advisory_xact_lock` qu'elle introduit. La marque de
-- `0029` a été écrasée par celle de `0030`. Aucune sonde ne peut les
-- distinguer — c'est une propriété du `create or replace`, pas un manque de
-- soin.
--
-- ─── D'OÙ LA COLONNE QUI MANQUAIT : `preuve` ────────────────────────────────
-- Le dépôt a une règle — toute assertion d'état se donne avec ce qui l'a
-- établie. Le registre l'énonçait sans la respecter : `statut` disait QUOI,
-- rien ne disait COMMENT ON LE SAIT. Quatre valeurs, et elles ne se valent
-- pas :
--
--   journal_supabase — le fichier est identique au SQL reçu. Le plus fort.
--   sonde_schema     — les objets sont là ; le SQL exact est perdu.
--   succession       — aucune preuve directe ; une migration postérieure sur
--                      le MÊME objet est attestée. Le plus faible, et c'est
--                      pour ça qu'il porte un nom au lieu de se fondre.
--   non_appliquee    — rien à prouver.
--
-- Un registre où tout serait `journal_supabase` n'apprendrait rien. Celui-ci
-- se lit : `select preuve, count(*) …` dit en une ligne ce qui est attesté et
-- ce qui est cru.
--
-- ─── CETTE MIGRATION DOIT TOURNER DANS DEUX MONDES ──────────────────────────
-- La production, où le registre porte déjà 27 lignes classées par `0062` ; et
-- la CI, qui applique TOUS les fichiers dans l'ordre des noms contre une base
-- vide, où le registre est donc vide et où les cinq dormantes sont, elles,
-- bel et bien appliquées.
--
-- Une version antérieure de ce fichier inscrivait 35 lignes et vérifiait
-- « 62 lignes au total, dont 56 appliquées ». Elle aurait été VERTE en
-- production et aurait cassé `sql-tests` au premier passage — un contrôle
-- écrit contre un seul environnement, qui est la forme la plus banale de
-- l'instrument non éprouvé.
--
-- D'où deux principes ici :
--   • les 62 lignes sont proposées, `on conflict do nothing` : ce qui existe
--     déjà n'est jamais écrasé ;
--   • ce qui dépend de l'environnement est SONDÉ, pas déclaré — le statut des
--     cinq dormantes est lu dans le schéma, comme `0062` le fait.
--
-- ─── DEUX CORRECTIONS DE DONNÉES, ANNONCÉES ─────────────────────────────────
-- 1. `applied_at` et `applied_by` deviennent NULLABLES. Une migration jamais
--    appliquée n'a ni date ni auteur d'application ; l'obligation forçait à
--    inventer l'un ou l'autre, ce qu'aucune contrainte ne devrait exiger.
-- 2. `0031` portait `applied_at = 2026-07-26` alors qu'elle est
--    `abandonnee` — jamais appliquée. Cette date est retirée. C'est un fait
--    faux qu'on efface, pas une trace qu'on perd.
--
-- Note de lecture : depuis `0062`, `sha256` ne dit plus RIEN sur le fait
-- d'avoir été appliqué — c'est le travail de `statut`. Un hash sur une ligne
-- `redigee` est l'empreinte du FICHIER, rien de plus.
-- ============================================================================

alter table zabelie_schema_migrations
  alter column applied_at drop not null,
  alter column applied_by drop not null;

alter table zabelie_schema_migrations
  add column preuve text;

-- Pas de `on commit drop` : `psql` est en autocommit et la table mourrait à
-- la fin de l'instruction qui la crée. La leçon vient de `0062`, où elle a
-- coûté un rouge de CI. Suppression explicite en fin de migration.
create temporary table _registre (
  filename   text primary key,
  sha256     text not null,
  statut     text not null,
  preuve     text not null,
  applied_by text,
  note       text
);

insert into _registre (filename, sha256, statut, preuve, applied_by, note) values
  ('0001_schema.sql', '706c57638ffbed7a7ac4dd5ed38b837bc22e9a23323a714ed2b20107d7cdd498', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0002_rls.sql', '01c816adaba13a46078860d96d6c6e5159a9fc4827ac386a808c1b64067dc918', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0003_payment_functions.sql', '933f3628b6bee051356087d0397f48b85fd553e6b1badc551b317f827a03ceba', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0004_storage.sql', 'e4b2433674af106619935a96c138049cf2a525c952eaab468b87a82eb3ed20e1', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0005_commission.sql', 'a5f7a449e60b0eefe22b23014e44c48dfe4b4cc58b0dc2020543feaf5b440d54', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0006_escrow_maturation.sql', '74f64aa4b528325f1e42407bfd0187f9fda3d5d94dcc83713e2fdf5957cad928', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0007_standalone.sql', 'a24b4467fb4e13c1a97147eaae6cb026253d55de41c1af84a6a21947c62960fd', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0008_reviews.sql', '3f5991150593a4ccfda0aa5d0c8331709d15abd6900db40d52dbfb0de6879ed1', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0009_rails_diaspora.sql', 'eb4ef45cd749fd72e567cf22c7d717e2752e80fc2644c1d311c141f910734583', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0010_topup.sql', 'c9ec214c140eb7a566ad3263f919792bb844dfe202e244f9f199e6a61381af63', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0011_security_hardening.sql', 'c9292dce0a82274e8a6010f75c54d0437c67f0290a3799280d10efc9246da4e1', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0012_coupons.sql', '53b15fafac29b4f3e27816884002520f8c088ec496d529f3454f78d29d5071bb', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0013_geo_analytics.sql', '79c0faaf5baafcab9451f95b16404ab9230dd2ec8df5ba10742128382918c252', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0014_haiti_departments.sql', 'bd88ea45dc083853dd6f44c0a2823c3754e4e8cd9cadfdb201ae2606e919c535', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0015_profiles_hardening.sql', '07424b982dd3f6ac93a03c4c2d0ed00f407c46a2d38a73cf1a858d80021750e7', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0016_gdpr_retention.sql', '66b8837c61b2d76cb8748091200a1c4909bd016556b41fef31849b02c9e116f6', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0017_seller_suspension.sql', '36f20d36d1d54cf5456ebc836b04684be9dc8b45454fb2536f9283d55ce36b3a', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0018_fix_search_path.sql', 'f302917bd5b15e97f5291accb6fd42ba07e4554b17875c2ae2168605e0dad3bb', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0019_rate_limits.sql', 'c0022d87cc7fbcd184f96607987c6d2f6d8ab74acdae43283cb07051311003ab', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0020_service_fields.sql', '5adb2d02a3112963fc046391fe84ec476cd2a3a7403d2711607f5abb495091d1', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0021_points_rewards.sql', '9ff30e0fee587a4837a9b1e569e222f1859fdc66d299cae8c63f5a607a1d8178', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0022_business_v1.sql', '6696d4cd508ae4fc488374359e6832efa13d95208a601b4dec4f847bf1b42924', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0023_harden_points_trigger.sql', '3d2ceca6ec3be0bb4fb0baa9355b92633b7a3962bd3795fefc0d8de81968da8a', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0024_p0_hardening.sql', '6297591eec0ba00e06351e48b377aff46a1e181a9b70d0eaac8975a4ff5b1c4e', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0025_wallet_ledger_guard.sql', '-', 'appliquee', 'sonde_schema', 'inconnu (anterieur au registre 0041)', 'Aucune ligne au journal Supabase (passee par l''editeur SQL) : empreinte de ce qui a tourne non attestable. Presence attestee par sonde — trigger zabelie_wallet_ledger_immutable present.'),
  ('0026_fix_wallet_guard_searchpath.sql', '-', 'appliquee', 'sonde_schema', 'inconnu (anterieur au registre 0041)', 'Aucune ligne au journal Supabase (passee par l''editeur SQL) : empreinte de ce qui a tourne non attestable. Presence attestee par sonde — search_path epingle dans zabelie_wallet_ledger_guard.'),
  ('0027_coupon_consume_on_confirm.sql', '-', 'appliquee', 'sonde_schema', 'inconnu (anterieur au registre 0041)', 'Aucune ligne au journal Supabase (passee par l''editeur SQL) : empreinte de ce qui a tourne non attestable. Presence attestee par sonde — colonne orders.coupon_id presente.'),
  ('0028_catalogue_search_indexes.sql', '-', 'appliquee', 'sonde_schema', 'inconnu (anterieur au registre 0041)', 'Aucune ligne au journal Supabase (passee par l''editeur SQL) : empreinte de ce qui a tourne non attestable. Presence attestee par sonde — index products_title_trgm_idx present.'),
  ('0029_topup_daily_cap_atomic.sql', '-', 'appliquee', 'succession', 'inconnu (anterieur au registre 0041)', 'Insondable par construction : 0030 remplace la MEME fonction et conserve le pg_advisory_xact_lock introduit ici. La marque de 0029 a ete ecrasee par celle de 0030, qui est attestee. Applique par succession, jamais verifie directement.'),
  ('0030_reserve_order_single_scan.sql', '-', 'appliquee', 'sonde_schema', 'inconnu (anterieur au registre 0041)', 'Aucune ligne au journal Supabase (passee par l''editeur SQL) : empreinte de ce qui a tourne non attestable. Presence attestee par sonde — bool_or dans zabelie_topup_reserve_order.'),
  ('0031_points_caps_expiry.sql', '-', 'abandonnee', 'non_appliquee', null, 'Volontairement sautee (fidelite, D-6). Ne sera jamais appliquee : ni date ni auteur.'),
  ('0032_manual_payouts.sql', '857bc20f8b0687ea48ff999a4d325a778a3d3c75a958bd6d0ed3a6cf94cbc26a', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0033_wallet_coherence.sql', 'f4d0790809afca6a6a3e44ed8104032666c38f4e7b4802557eb9480b706a981e', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0034_payout_requests.sql', '6cca60f86296dbc884ee6242f214bb0151b7f4b1a4fff1c1eb909c184dd2e59c', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0035_categories.sql', 'b08828123a6263d2740d6ca4f6cdf5ee532c7f07727fc94e977ffe1dba124445', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0036_physical_products.sql', '3736978cd9940aa9d58157620924bb26744cb669ce2485a97712829dcf41fc12', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0037_stock_money_path.sql', 'a122079ce988e0c09d493fb99b7107a4f84c58e26f5a25f16cae5a69a602cccd', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0038_stock_rupture_guard.sql', 'd877c1dc98170b8215795a82277f4808a6360d6e6a16fa084344ca190be22960', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0039_product_covers_bucket.sql', 'dccd693ca88b00f150a3d39e4cd2cdfcde148340a3cc8e888b328d4f3a90f70c', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0040_product_in_stock_flag.sql', '6fa48169a650f5644aaadbf10c689a7841005da937f70456cd94f9b5d21164fc', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0041_migration_ledger.sql', 'd90d186bcb174c3f9a9702e08d53e78670c95f95b5defb3a39aa3cb0ab365f83', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0042_order_ref.sql', '5137fe1698cf8ff432410386769029059fc0827837792d2d35eff17d543ee3fd', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0043_fulfillment.sql', 'd2af3699d1aebb5d312f67e2b1c12562059e7b2a710f435dbc3502022de74f49', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0044_commission_floor.sql', '3f2d031532cd243b455de850908d1315d88533376bd6d0e33ec240bed5c5df01', 'appliquee', 'sonde_schema', 'inconnu (anterieur au registre 0041)', 'Aucune ligne au journal Supabase (passee par l''editeur SQL) : empreinte de ce qui a tourne non attestable. Presence attestee par sonde — floor( dans zabelie_commission_htg (D-4).'),
  ('0045_profile_on_signup.sql', 'e8409d69c035935bcc162b7885ba9a697fd708e3002c1e9d941b9b727ef411a2', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0046_policy_acceptance.sql', 'd7edae5b46e2d677b8d4def5579b909de1e725bd846171e588b6c83f0546fb95', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0047_search_demand.sql', 'cdfdda7ff9fbee3f266f4960a1f0a2897b8fe677ba5ca62f98de67830c0e0453', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0048_objets_requis.sql', '3b6d0369f37c40eb966f907ffff8c5743f0922016249cd6f7dcf648ddc124ad8', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0049_revoke_trigger_functions.sql', '2c0f9624a1b345bf4df2b81663044fd0154ccb91d3fedfd4c5f0ec6c40543c56', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0050_revoke_search_fuzzy.sql', 'bdcde2455451496efb8314349fc331239deb02edbde62b78d50c4e96b26228f2', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0051_rayon_klerin.sql', 'b1662e07a7802c1042da5bbdec0921847ff36c46361cbf754b53dff9cd4dfa16', 'redigee', 'non_appliquee', null, 'Redigee, non appliquee en production. Statut SONDE a l''application de 0063 : applique ailleurs, la ligne bascule en appliquee/sonde_schema.'),
  ('0052_categories_label_es.sql', '7e634af5948626b044d28bc04e6acbec94efae3dfd6e2b540c142466486457fe', 'redigee', 'non_appliquee', null, 'Redigee, non appliquee en production. Statut SONDE a l''application de 0063 : applique ailleurs, la ligne bascule en appliquee/sonde_schema.'),
  ('0053_search_retention_90j.sql', '5d13a074932273d7b33f85ce54077d6cdb7ec2325b41ce799084d69c6d6f78a5', 'redigee', 'non_appliquee', null, 'Redigee, non appliquee en production. Statut SONDE a l''application de 0063 : applique ailleurs, la ligne bascule en appliquee/sonde_schema.'),
  ('0054_commission_config.sql', '1f628d235821a3251cd0734a38223adf9d67a15c801763b5dd12660f6bd1317c', 'redigee', 'non_appliquee', null, 'Redigee, non appliquee en production. Statut SONDE a l''application de 0063 : applique ailleurs, la ligne bascule en appliquee/sonde_schema.'),
  ('0055_admin_audit.sql', '274f4a2b013a05ec37b0b1f125aa7a8e83bdbf93a3865ca32d77fc129ae5df99', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0056_purge_sent_notices.sql', '1916c2dd365889f61fcd656b54dd4d0210c2059848306f48d2aa3a41d343d166', 'redigee', 'non_appliquee', null, 'Redigee, non appliquee en production. Statut SONDE a l''application de 0063 : applique ailleurs, la ligne bascule en appliquee/sonde_schema.'),
  ('0057_categories_services.sql', 'd29bdb0cd9c606f0abaa5e1c597d0b0a323b5e891e0ee0d7178b7ada601294e2', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0058_panier.sql', 'd159d7e5fbc73da64c9df7a8dd7b078e6ebb8de926df2d4afc085c51c756c8e5', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0059_fichier_sans_livrable.sql', '8385574ab8c7623a2becbb2e751f51853584675f326f25603816b0c7514a051f', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0060_cron_leases.sql', 'fd72322aa965806b6fe6290043c119eb540f1b033dfd668d6591be67fc57ca58', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0061_outbox_notifications.sql', '05bd4f4f81c02b15f7f2cdca9afc78a66a7fed050b4adc00a9287aaa930b14a8', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null),
  ('0062_registre_statut.sql', 'b8a0ff69218d9fe51f0449a6cace409877c7b2c1948773da598352d9b08fc1a4', 'appliquee', 'journal_supabase', 'inconnu (anterieur au registre 0041)', null)
;

-- ─────────── (1) CE QUI DÉPEND DE L'ENVIRONNEMENT EST SONDÉ ─────────────────
-- Les cinq dormantes sont non appliquées en production et appliquées en CI.
-- Les déclarer serait juste ici et faux là-bas. Même liste de sondes que
-- `0062`, écrite à la main, migration par migration.
do $$
declare
  r         record;
  v_present boolean;
begin
  for r in
    select * from (values
      ('0051_rayon_klerin.sql',
       $q$exists (select 1 from zabelie_categories where slug like '%klerin%')$q$),
      ('0052_categories_label_es.sql',
       $q$exists (select 1 from information_schema.columns where table_name = 'zabelie_categories' and column_name = 'label_es')$q$),
      -- ⚠️ `0062` porte ici `where key = 'retention_days' and value = 90`.
      -- C'est FAUX : `zabelie_search_config` est une table à LIGNE UNIQUE
      -- (`id boolean primary key`), pas un couple clé/valeur — il n'existe ni
      -- colonne `key` ni colonne `value`. Cette sonde n'a jamais tourné :
      -- `0053` n'a pas de ligne au registre, donc la boucle de `0062` ne l'a
      -- jamais atteinte, et rien n'a signalé qu'elle était morte. Le jour où
      -- une ligne `0053` serait entrée, la migration aurait levé
      -- `column "key" does not exist` au lieu de classer.
      --
      -- C'est le motif du dépôt à l'état pur : un instrument écrit une fois,
      -- jamais éprouvé, dont le défaut est invisible tant que le chemin n'est
      -- pas emprunté. Il a été trouvé par la répétition CI de `0063`, pas par
      -- relecture — la relecture avait recopié la sonde telle quelle.
      ('0053_search_retention_90j.sql',
       $q$exists (select 1 from zabelie_search_config where retention_days = 90)$q$),
      ('0054_commission_config.sql',
       $q$to_regclass('public.zabelie_commission_config') is not null$q$),
      ('0056_purge_sent_notices.sql',
       $q$to_regproc('public.zabelie_purge_sent_notices') is not null$q$)
    ) as s(fichier, expr)
  loop
    execute 'select ' || r.expr into v_present;
    if coalesce(v_present, false) then
      update _registre
         set statut = 'appliquee',
             preuve = 'sonde_schema',
             note   = 'Objets presents dans ce schema (sonde a l''application de 0063). Aucune ligne au journal Supabase : empreinte de ce qui a tourne non attestable.'
       where filename = r.fichier;
    end if;
  end loop;
end $$;

-- ─────────── (2) CROISEMENT AVEC LA CLASSIFICATION DE `0062` ────────────────
-- `0062` a classé par sonde ; `_registre` porte une classification écrite à
-- la main. Deux chemins indépendants vers le même fait : ils doivent
-- concorder, et une divergence est un signal, pas un détail à écraser.
do $$
declare v_divergences text;
begin
  select string_agg(z.filename || ' (registre=' || z.statut || ', 0063=' || r.statut || ')', ', ')
    into v_divergences
    from zabelie_schema_migrations z
    join _registre r on r.filename = z.filename
   where z.statut is distinct from r.statut;
  if v_divergences is not null then
    raise exception 'ZB063 : classification divergente entre 0062 et 0063 — %', v_divergences;
  end if;
end $$;

-- ─────────── (3) LES LIGNES MANQUANTES ──────────────────────────────────────
-- `do nothing` : ce qui est déjà inscrit fait foi. Cette migration complète,
-- elle ne réécrit pas l'histoire.
-- ⚠️ `applied_at` est passé EXPLICITEMENT à NULL, et c'est le point délicat.
-- La colonne porte `default now()` depuis `0041` : l'omettre donnerait à
-- chaque ligne du socle la date d'exécution de CETTE migration — une date
-- inventée, en 2026-08, pour des migrations de juillet. Le défaut a été
-- trouvé par la répétition, pas à la relecture : la ligne était correcte à
-- lire, et fausse à exécuter. Les vraies dates sont dérivées plus bas, du
-- journal ; celles qui n'y sont pas restent NULL, ce qui est exact.
insert into zabelie_schema_migrations
  (filename, sha256, statut, preuve, applied_at, applied_by, note)
select filename, sha256, statut, preuve, null, applied_by, note from _registre
on conflict (filename) do nothing;

-- La `preuve` des lignes qui existaient déjà.
update zabelie_schema_migrations z
   set preuve = r.preuve
  from _registre r
 where z.filename = r.filename
   and z.preuve is null;

-- Ni date ni auteur d'application pour ce qui n'a pas été appliqué.
update zabelie_schema_migrations
   set applied_at = null, applied_by = null
 where statut <> 'appliquee';

-- ─────────── (4) LES DATES, DÉRIVÉES — JAMAIS SAISIES ───────────────────────
-- `supabase_migrations.schema_migrations.version` est un horodatage
-- `YYYYMMDDHH24MISS`. C'est la seule date d'application réelle qui existe pour
-- le socle ; la recopier à la main serait en inventer une. Les six sans
-- journal (`0025`→`0030`) restent à NULL, et cette absence est exacte.
do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise notice '0063 : registre interne Supabase absent — dates du socle laissees a NULL';
    return;
  end if;
  update zabelie_schema_migrations z
     set applied_at = to_timestamp(s.version, 'YYYYMMDDHH24MISS')
    from supabase_migrations.schema_migrations s
   where s.name = replace(z.filename, '.sql', '')
     and z.applied_at is null
     and z.statut = 'appliquee';
end $$;

-- ─────────── (5) LA MIGRATION PROUVE CE QU'ELLE AFFIRME ─────────────────────
-- Sans ce bloc, `0063` inscrirait une conclusion mesurée à la main quelques
-- minutes plus tôt, dans une autre session, contre un état qui a pu bouger —
-- exactement ce que `0062` refusait de faire en sondant à l'application.
--
-- ⚠️ Le motif du contrôle est l'inverse du naturel : on n'exige pas qu'une
-- sonde passe, on exige qu'elle passe POUR SA LIGNE. Une boucle qui
-- vérifierait « au moins une sonde vraie » resterait verte avec cinq fausses.
do $$
declare
  r         record;
  v_present boolean;
begin
  for r in
    select * from (values
      ('0025_wallet_ledger_guard.sql',
       $q$(select count(*) from pg_trigger where tgname = 'zabelie_wallet_ledger_immutable') > 0$q$),
      ('0026_fix_wallet_guard_searchpath.sql',
       $q$(select pg_get_functiondef(p.oid) like '%search_path%' from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'zabelie_wallet_ledger_guard')$q$),
      ('0027_coupon_consume_on_confirm.sql',
       $q$exists (select 1 from information_schema.columns where table_name = 'orders' and column_name = 'coupon_id')$q$),
      ('0028_catalogue_search_indexes.sql',
       $q$to_regclass('public.products_title_trgm_idx') is not null$q$),
      ('0030_reserve_order_single_scan.sql',
       $q$(select pg_get_functiondef(p.oid) like '%bool_or%' from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'zabelie_topup_reserve_order')$q$),
      ('0044_commission_floor.sql',
       $q$(select pg_get_functiondef(p.oid) like '%floor(%' from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'zabelie_commission_htg')$q$)
    ) as s(fichier, expr)
  loop
    execute 'select ' || r.expr into v_present;
    if not coalesce(v_present, false) then
      raise exception 'ZB063 : % classee sonde_schema, mais sa sonde rend FAUX — %',
        r.fichier, r.expr;
    end if;
  end loop;
end $$;

-- Le pendant pour les lignes `journal_supabase` : chacune doit avoir une
-- entrée au registre interne de Supabase. Ce n'est PAS la preuve d'identité
-- du SQL — celle-là s'est faite par croisement hors base et ne peut pas être
-- rejouée ici, faute d'accès aux fichiers — mais c'est la moitié vérifiable,
-- et une ligne classée `journal_supabase` sans entrée au journal serait un
-- mensonge pur.
do $$
declare v_manquantes text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise notice '0063 : registre interne Supabase absent — controle journal saute';
    return;
  end if;
  select string_agg(z.filename, ', ' order by z.filename) into v_manquantes
    from zabelie_schema_migrations z
   where z.preuve = 'journal_supabase'
     and not exists (
       select 1 from supabase_migrations.schema_migrations s
        where s.name = replace(z.filename, '.sql', ''));
  if v_manquantes is not null then
    raise exception 'ZB063 : classees journal_supabase sans entree au journal : %', v_manquantes;
  end if;
end $$;

-- ─────────── (6) POST-CONDITIONS ────────────────────────────────────────────
do $$
declare
  v_total   integer;
  v_nulles  integer;
  v_hors    text;
  v_absents text;
  v_a integer; v_r integer; v_ab integer;
  v_pj integer; v_ps integer; v_psu integer; v_pn integer;
begin
  select count(*) into v_total from zabelie_schema_migrations;
  select count(*) into v_nulles from zabelie_schema_migrations where preuve is null;

  -- Structurel, donc vrai dans les deux mondes : le registre couvre
  -- exactement `_registre`, ni plus ni moins.
  select string_agg(z.filename, ', ') into v_hors
    from zabelie_schema_migrations z
   where not exists (select 1 from _registre r where r.filename = z.filename);
  select string_agg(r.filename, ', ') into v_absents
    from _registre r
   where not exists (select 1 from zabelie_schema_migrations z where z.filename = r.filename);

  -- Ordre voulu : la cause la plus SPÉCIFIQUE d'abord. Une ligne inconnue de
  -- `0063` est forcément aussi une ligne sans preuve ; annoncer « 1 ligne sans
  -- preuve » enverrait chercher au mauvais endroit. Mesuré : le cas négatif
  -- N4 tombait sur le message générique avant ce réordonnancement.
  if v_hors is not null then
    raise exception 'ZB063 : ligne(s) au registre hors de la liste de 0063 : %', v_hors;
  end if;
  if v_nulles > 0 then
    raise exception 'ZB063 : % ligne(s) sans preuve', v_nulles;
  end if;
  if v_absents is not null then
    raise exception 'ZB063 : ligne(s) de 0063 absentes du registre : %', v_absents;
  end if;
  if v_total <> 62 then
    raise exception 'ZB063 : % lignes au registre, 62 attendues', v_total;
  end if;

  -- `0025`→`0030` n'ont aucune entrée au journal : leur date d'application
  -- est INCONNUE et doit le rester. Une date ici signifierait que le
  -- `default now()` de `0041` a repris la main — c'est-à-dire qu'on a daté
  -- des migrations de juillet du jour où on a rempli le registre.
  if exists (
    select 1 from zabelie_schema_migrations
     where filename ~ '^00(2[5-9]|30)_' and applied_at is not null
  ) then
    raise exception 'ZB063 : 0025→0030 portent une date d''application alors qu''aucune n''est connue';
  end if;

  -- Les comptes exacts ne valent QUE pour la production. En CI les cinq
  -- dormantes sont appliquées, et exiger 56/5/1 y serait faux. Le
  -- discriminant est le registre interne de Supabase, qui n'existe pas en CI.
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise notice '0063 : environnement sans journal interne — comptes exacts non exiges';
    return;
  end if;

  select count(*) filter (where statut = 'appliquee'),
         count(*) filter (where statut = 'redigee'),
         count(*) filter (where statut = 'abandonnee'),
         count(*) filter (where preuve = 'journal_supabase'),
         count(*) filter (where preuve = 'sonde_schema'),
         count(*) filter (where preuve = 'succession'),
         count(*) filter (where preuve = 'non_appliquee')
    into v_a, v_r, v_ab, v_pj, v_ps, v_psu, v_pn
    from zabelie_schema_migrations;

  if (v_a, v_r, v_ab) is distinct from (56, 5, 1) then
    raise exception 'ZB063 : statuts (%, %, %) au lieu de (56, 5, 1)', v_a, v_r, v_ab;
  end if;
  -- 49 = exactement le nombre d'accords du croisement fichier × SQL reçu.
  if (v_pj, v_ps, v_psu, v_pn) is distinct from (49, 6, 1, 6) then
    raise exception 'ZB063 : preuves (%, %, %, %) au lieu de (49, 6, 1, 6)', v_pj, v_ps, v_psu, v_pn;
  end if;
end $$;

drop table _registre;

-- ─────────── (7) LES CONTRAINTES, POSÉES APRÈS COUP ─────────────────────────
alter table zabelie_schema_migrations
  alter column preuve set not null,
  add constraint zabelie_schema_migrations_preuve
    check (preuve in ('journal_supabase', 'sonde_schema', 'succession', 'non_appliquee')),
  -- Le lien entre les deux colonnes, pour qu'elles ne puissent pas diverger :
  -- une ligne non appliquée n'a pas de preuve, et une ligne appliquée en a
  -- forcément une — fût-elle faible.
  add constraint zabelie_schema_migrations_preuve_coherente
    check ((statut = 'appliquee') = (preuve <> 'non_appliquee'));

comment on column zabelie_schema_migrations.preuve is
  'COMMENT le statut a été établi : journal_supabase (fichier identique au SQL reçu) > sonde_schema (objets présents, SQL perdu) > succession (aucune preuve directe, une migration postérieure sur le même objet est attestée) > non_appliquee. Le dépôt exige que toute assertion d''état se donne avec ce qui l''a établie ; le registre l''énonçait sans le faire.';
