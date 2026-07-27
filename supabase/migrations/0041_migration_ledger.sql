-- ============================================================================
-- 0041 — Registre des migrations appliquées
-- ============================================================================
-- ⚠️ À APPLIQUER APRÈS B1/B2, JAMAIS DANS LE MÊME LOT. C'est un instrument de
-- contrôle : on ne l'ajoute pas au lot qu'il est censé contrôler.
--
-- Pourquoi il existe. Les migrations sont appliquées à la main dans l'éditeur
-- SQL, et il n'existait aucune trace de CE QUI a été appliqué ni de QUELLE
-- VERSION. Le cas s'est produit pendant le chantier B : `0035` a été corrigée
-- (seed rendu convergent) APRÈS avoir potentiellement été appliquée ailleurs.
-- La sonde d'objets voit qu'une table existe ; elle ne voit pas quelle version
-- du fichier l'a créée. Une empreinte qui ne correspond plus le dit,
-- définitivement et sans y penser.
--
-- ⚠️ CE REGISTRE EST DÉCLARATIF, PAS UNE PREUVE. Les migrations passent à la
-- main dans l'éditeur SQL ; rien n'oblige l'opérateur à insérer la ligne
-- après. Il enregistre donc ce que l'opérateur DÉCLARE avoir appliqué, pas ce
-- qui l'a été. Une empreinte présente et concordante dit « le fichier du dépôt
-- est celui que l'opérateur dit avoir appliqué » — elle ne prouve ni que
-- l'application a réellement eu lieu, ni qu'elle a été complète. Ce que la
-- base CONTIENT se vérifie avec la sonde d'objets et de lignes (`docs/20`
-- §B1, étape 0) ; ce registre dit seulement quelle VERSION était censée y
-- entrer. Les deux se complètent, aucun ne remplace l'autre.
--
-- Ce registre est un OUTIL D'EXPLOITATION, pas une table applicative : aucune
-- route ne le lit, aucune RLS côté client n'est nécessaire — il est
-- simplement invisible et inaccessible à `anon`/`authenticated`.

create table zabelie_schema_migrations (
  filename    text primary key,           -- ex. « 0035_categories.sql »
  -- Empreinte CANONIQUE (commentaires retirés, espaces réduits) produite par
  -- `node scripts/zabelie-migration-hash.mjs` — jamais un sha256 brut du
  -- fichier : la mise en forme ne doit pas déclencher de faux signal.
  sha256      text not null,
  applied_at  timestamptz not null default now(),
  applied_by  text not null default current_user,
  note        text                        -- libre : « Preview », « prod, heures creuses »…
);

alter table zabelie_schema_migrations enable row level security;
revoke all on zabelie_schema_migrations from public, anon, authenticated;

comment on table zabelie_schema_migrations is
  'Journal d''application des migrations manuelles. Une ligne par fichier '
  'appliqué, avec l''empreinte SHA-256 du contenu exact. Si l''empreinte du '
  'fichier dans le dépôt ne correspond plus à celle enregistrée ici, le '
  'fichier a été modifié APRÈS application — c''est une information, pas '
  'forcément une erreur, mais elle doit être connue avant tout rejeu.';

-- ── Mode d'emploi (côté opérateur, pas côté base) ───────────────────────────
--
-- 1. Calculer l'empreinte AVANT d'appliquer :
--      sha256sum supabase/migrations/0042_xxx.sql
--
-- 2. Appliquer le fichier, puis enregistrer :
--      insert into zabelie_schema_migrations (filename, sha256, note)
--      values ('0042_xxx.sql', '<empreinte>', 'prod, heures creuses');
--
-- 3. Contrôle de dérive (à tout moment, notamment avant un rejeu) : comparer
--    les empreintes du dépôt à celles du registre :
--      for f in supabase/migrations/*.sql; do sha256sum "$f"; done
--    vs
--      select filename, sha256 from zabelie_schema_migrations order by 1;
--
-- BACKFILL. Pour les migrations déjà en production (0001 → ...), enregistrer
-- l'empreinte du fichier ACTUEL du dépôt avec la note « backfill — version du
-- dépôt au 2026-07-26, application antérieure non tracée ». C'est honnête :
-- on ne certifie pas ce qu'on n'a pas vu. Les écarts déjà connus (0035
-- corrigée après coup) se documentent dans la note.
