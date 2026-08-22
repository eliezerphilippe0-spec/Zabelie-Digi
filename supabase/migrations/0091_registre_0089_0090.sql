select zabelie_migration_garde('0091_registre_0089_0090.sql');

-- ============================================================================
-- 0091 — Inscription au registre de 0089 et 0090
-- ============================================================================
-- Deux lignes, deux raisons différentes, et il faut les distinguer :
--
--   • `0090` vient d'être appliquée (2026-08-22 19:33:46 UTC) et doit être
--     inscrite — c'est le geste normal.
--   • `0089` attend sa ligne depuis le 2026-08-22 02:43:27, PAR CONVENTION :
--     une migration de registre n'inscrit pas sa propre ligne. Le paradoxe est
--     réel — une ligne qui contiendrait l'empreinte du fichier qui la contient
--     changerait cette empreinte en s'écrivant.
--
-- ⚠️ ET CETTE CONVENTION A UN COÛT QU'IL FAUT NOMMER : entre l'application
-- d'une migration de registre et la passe suivante, le registre est
-- INCOMPLET — 89 fichiers pour 88 lignes pendant dix-sept heures. Un
-- croisement `count(*)` contre `ls | wc -l` mené dans cet intervalle aurait
-- signalé un écart bien réel, mais dont la cause est la convention et non un
-- oubli. Écrit ici pour qu'une session future ne le prenne pas pour un défaut.
--
-- `0091` inscrit donc `0089` et `0090`, et pas elle-même. La sienne suivra.
-- ============================================================================

insert into zabelie_schema_migrations
  (filename, sha256, applied_at, applied_by, statut, preuve, note)
values
  ('0089_registre_0087_0088.sql',
   '7740c1af74b38ce9e6581148cf8c2f050e68746c769967a774202cfe43c06a64',
   '2026-08-22 02:43:27+00',
   'porteur — autorisation permanente du 2026-08-17 + signal direct « reessaie » du 2026-08-22, appliquee par agent via MCP',
   'appliquee', 'journal_supabase',
   'Migration de registre : elle a inscrit 0087 et 0088. Empreinte croisee '
   '(methode 0086) = f69980ba453a1f4f0e0b0eaee52ba6e7fed47eab3be8281aa86a19a9e5ae7b0f '
   'des deux cotes. Sa propre ligne arrive ici, par convention.'),
  ('0090_messagerie.sql',
   '717726bdb34f11deaeb4fbd5bb8e362ae02c76677e235ea6046e09398069f773',
   '2026-08-22 19:33:46+00',
   'porteur — autorisation permanente du 2026-08-17 + signal direct « applique 0090 » du 2026-08-22, appliquee par agent via MCP',
   'appliquee', 'journal_supabase',
   'Messagerie acheteur-vendeur. Empreinte croisee (methode 0086) = '
   '35e9f21d36d79ac2089053efec85514c7158b75437e44bcab5148807b92e536f des deux '
   'cotes. Effet mesure : 4 tables, 6 policies, 2 triggers, limites en place. '
   'Sonde P1-P6 executee sur 3 profils et 2 produits publies REELS ; 0 fil et '
   '0 message residuels apres nettoyage. CI sql-tests verte sur base neuve '
   '(11 cas sous vrais roles, 7 connus-negatifs).')
on conflict (filename) do nothing;

-- ── Post-condition ──────────────────────────────────────────────────────────
-- Même forme que `0089` : on assert sur le CONTENU, pas sur la présence.
-- `on conflict do nothing` rend un succès silencieux quand la ligne était déjà
-- là avec autre chose.
do $$
declare v_manquantes text;
begin
  select string_agg(x.f, ', ') into v_manquantes
    from (values
      ('0089_registre_0087_0088.sql',
       '7740c1af74b38ce9e6581148cf8c2f050e68746c769967a774202cfe43c06a64'),
      ('0090_messagerie.sql',
       '717726bdb34f11deaeb4fbd5bb8e362ae02c76677e235ea6046e09398069f773')
    ) as x(f, h)
   where not exists (
     select 1 from zabelie_schema_migrations z
      where z.filename = x.f
        and z.sha256 = x.h
        and z.statut = 'appliquee'
        and z.preuve = 'journal_supabase'
   );

  if v_manquantes is not null then
    raise exception
      '0091 KO: inscription absente ou divergente au registre pour % — '
      'le registre ne decrit pas ce qui a tourne en production',
      v_manquantes using errcode = 'ZB091';
  end if;

  raise notice '0091 OK: 0089 et 0090 inscrites, empreinte et statut conformes';
end $$;
