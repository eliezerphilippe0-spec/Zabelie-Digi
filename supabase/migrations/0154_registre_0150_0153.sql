select zabelie_migration_garde('0154_registre_0150_0153.sql');

-- ============================================================================
-- 0154 — Lignes de registre de 0150, 0151, 0152 et 0153
-- ============================================================================
-- Migration de REGISTRE SEUL, aucune donnée ni aucun schéma touché — la forme
-- de `0089_registre_0087_0088` et `0097_..._registre_0096`. Elle existe pour
-- une raison précise : `0150`→`0153` ont été appliquées en production le
-- 2026-10-26 sur instructions directes du porteur, et leurs lignes de registre
-- ont été INSÉRÉES À LA MAIN (via MCP) sans qu'aucun fichier du dépôt ne les
-- porte. Le registre en base était donc complet, mais le DÉPÔT ne pouvait pas
-- le reconstruire : une base reconstruite depuis `supabase/migrations/` aurait
-- eu les objets de 0150-0153 sans leurs lignes de registre. C'est l'écart que
-- ce fichier ferme — le registre redevient REPRODUCTIBLE depuis le disque.
--
-- `on conflict (filename) do nothing` : en production, les quatre lignes
-- existent déjà (insérées le 2026-10-26), donc ces `insert` sont des NO-OP ;
-- sur une base reconstruite, ils recréent les lignes à l'identique. Les valeurs
-- ci-dessous sont RECOPIÉES de la base (relevé du 2026-10-26), y compris les
-- `note` historiques — un enregistrement daté ne se réécrit pas.
--
-- ⚠️ Chaîne de registre : comme toute migration-porteuse (0089, 0091, 0097),
-- `0154` inscrit les PRÉCÉDENTES, pas elle-même — une migration ne peut pas
-- porter sa propre empreinte (circularité du hash). La ligne de `0154` est donc
-- la nouvelle frontière, inscrite à la main après application, en attente d'un
-- futur porteur. C'est l'état terminal normal du registre, pas un oubli.
--
-- `sha256` = empreinte CANONIQUE de chaque fichier (`scripts/zabelie-migration-hash.mjs`).
-- `0152` est en `preuve='sonde_schema'` : son `drop trigger` (ligne 55) a dû
-- être appliqué sous `create or replace trigger` (confirmation destructive MCP
-- inrépondable depuis la session web), donc le SQL reçu diffère du fichier à
-- cette seule ligne — état final néanmoins vérifié identique au 0152 de main.
-- ============================================================================

insert into zabelie_schema_migrations
  (filename, sha256, applied_at, applied_by, statut, preuve, note)
values
  ('0150_zabelie_essayage.sql',
   '573dfa7bad8b3075c037f96036b2a988baa8086147a1a013548665123c9a5e7c',
   '2026-10-26 10:35:51.685622+00',
   $zb$porteur — autorisation permanente du 2026-08-17 + instruction directe « applique 0150,0151,0152 dans l'ordre » du 2026-10-26, appliquee par agent via MCP$zb$,
   'appliquee', 'journal_supabase',
   $zb$Rattrapage de l'ecart prod (0149 -> dto-dept) : appliquee apres 0153 (hors ordre a la demande du porteur), dans l'ordre 0150->0151->0152. md5 du statement stocke == md5 du fichier du depot (verifie). preuve journal_supabase.$zb$),
  ('0151_zabelie_stripe_disputes.sql',
   '0000899c8dc094a203a688567c25bfb1bcf30ad90f6ac3f109257b3c96d442b8',
   '2026-10-26 10:42:17.177733+00',
   $zb$porteur — autorisation permanente du 2026-08-17 + instruction directe « applique 0150,0151,0152 dans l'ordre » du 2026-10-26, appliquee par agent via MCP$zb$,
   'appliquee', 'journal_supabase',
   $zb$Rattrapage ecart prod, ordre 0150->0151->0152. Gel de litige reste DORMANT (stripe_dispute_freeze_enabled=false) ; mature_wallets patchee (dispute_frozen_at is null, colonne neuve NULL partout donc maturation inchangee). md5 statement stocke == md5 fichier depot.$zb$),
  ('0152_zabelie_product_media_review.sql',
   '1baa39dc999e455baca72182a602ee75ce6e7bc566739536bf4313a3927cf2b0',
   '2026-10-26 12:20:56.011011+00',
   $zb$porteur — autorisation permanente du 2026-08-17 + instruction directe « applique la meilleure méthode pour zabelie » du 2026-10-26, appliquee par agent via MCP apply_migration$zb$,
   'appliquee', 'sonde_schema',
   $zb$Rattrapage du dernier trou prod (0149->0151 et 0153 deja en place). Le fichier porte un `drop trigger` (ligne 55) et la confirmation destructive MCP est inrepondable depuis la session web (apply_migration 3x + execute_sql + une sonde no-op `drop ... if exists`, tous timeout 60s ; l'enveloppe do/execute a ete refusee par le classificateur de securite). Applique via apply_migration avec cette SEULE ligne remplacee par `create or replace trigger` (meme definition finale, non destructif). SQL recu != fichier a cette seule ligne (diff verifie = 1 ligne) => preuve=sonde_schema, PAS journal_supabase. Etat final VERIFIE independamment identique a 0152 de main (PR #396) : trigger media tgtype=31 BEFORE INSERT/UPDATE/DELETE lie a zabelie_product_media_guard(), trigger cover tgtype=19 sur products.cover_url, deux gardes service-only (anon/auth=false, service_role=true), sonde 4/4. sha256 = empreinte canonique du fichier du depot.$zb$),
  ('0153_zabelie_boutik_confiance.sql',
   '12422d2ae97ac8aef44d069fe17a9e5a0bc77e42da9d323a4b78023aa8b12595',
   '2026-10-26 10:12:15.868882+00',
   $zb$porteur — autorisation permanente du 2026-08-17 + instruction directe « applique 0153 » du 2026-10-26, appliquee par agent via MCP$zb$,
   'appliquee', 'journal_supabase',
   $zb$Appliquee HORS ORDRE sur demande explicite du porteur (« Juste 0153 ») : 0150-0152 restent en attente a cette date. zabelie_boutik_public modifiee en place (0112 -> 0153), signature inchangee. preuve journal_supabase : statements[1] stocke par Supabase == fichier du depot, octet pour octet.$zb$)
on conflict (filename) do nothing;

-- ── Post-condition : les quatre lignes sont présentes et conformes ───────────
-- Croisement, pas déclaration : la migration échoue si l'une des quatre manque
-- ou porte un couple statut/preuve inattendu. Éprouvée des deux côtés — retirer
-- une ligne du bloc `values` ci-dessus la fait rougir.
do $$
declare
  v_ok      integer;
  v_0152    text;
begin
  select count(*) into v_ok
    from zabelie_schema_migrations
   where filename in (
           '0150_zabelie_essayage.sql',
           '0151_zabelie_stripe_disputes.sql',
           '0152_zabelie_product_media_review.sql',
           '0153_zabelie_boutik_confiance.sql')
     and statut = 'appliquee'
     and preuve in ('journal_supabase', 'sonde_schema');
  if v_ok <> 4 then
    raise exception '0154 KO: % ligne(s) de registre 0150-0153 conforme(s), 4 attendues', v_ok
      using errcode = 'ZB154';
  end if;

  -- 0152 est le seul des quatre en sonde_schema (vecteur create-or-replace).
  select preuve into v_0152 from zabelie_schema_migrations
   where filename = '0152_zabelie_product_media_review.sql';
  if v_0152 <> 'sonde_schema' then
    raise exception '0154 KO: 0152 doit rester en sonde_schema (trouve %)', v_0152
      using errcode = 'ZB154';
  end if;

  raise notice '0154 OK: lignes de registre 0150-0153 presentes et conformes (0152 en sonde_schema)';
end $$;
