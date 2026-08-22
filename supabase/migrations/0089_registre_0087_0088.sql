select zabelie_migration_garde('0089_registre_0087_0088.sql');

-- ============================================================================
-- 0089 — Inscription au registre de 0087 et 0088
-- ============================================================================
-- POURQUOI CETTE MIGRATION EXISTE, et elle n'aurait pas dû être nécessaire.
--
-- `0087` et `0088` ont été appliquées en production le 2026-08-22. Le registre
-- `zabelie_schema_migrations` ne le savait pas : 88 fichiers sur le disque,
-- 86 lignes en base. C'est très exactement le défaut que `CLAUDE.md` nomme —
-- « rien n'empêche d'en appliquer une sans l'inscrire » — constaté sur nos
-- propres gestes, une heure après les avoir faits.
--
-- ⚠️ La cause immédiate est technique et vaut d'être écrite, parce qu'elle se
-- reproduira : le connecteur MCP expose `execute_sql` en LECTURE SEULE. Un
-- `insert` de registre y échoue avec `25006: cannot execute INSERT in a
-- read-only transaction`. La seule voie d'écriture est `apply_migration` —
-- donc une migration, donc ce fichier. L'inscription du registre n'est pas un
-- geste séparé qu'on peut « faire après » : elle doit être une migration, au
-- même titre que ce qu'elle enregistre.
--
-- ── LA CONVENTION SUIVIE, VÉRIFIÉE PLUTÔT QUE SUPPOSÉE ──────────────────────
-- Une migration de registre n'inscrit PAS sa propre ligne. Mesuré sur `0063` :
-- `grep -c "0063_registre_complet.sql" 0063_registre_complet.sql` rend 0, et
-- sa ligne au registre porte pourtant son empreinte canonique exacte — elle a
-- donc été posée par une passe ultérieure. `0089` fait la même chose : elle
-- inscrit `0087` et `0088`, pas elle-même. Sa propre ligne suivra.
--
-- Le paradoxe est réel et c'est pour ça que la convention existe : une ligne
-- qui contiendrait l'empreinte du fichier qui la contient changerait cette
-- empreinte en s'écrivant.
--
-- ── LES EMPREINTES, ET CE QU'ELLES PROUVENT ─────────────────────────────────
-- `sha256` est l'empreinte CANONIQUE (commentaires retirés, espaces réduits),
-- celle que rend `scripts/zabelie-migration-hash.mjs` — convention de `0041`,
-- pas un écart.
--
-- La `note` porte autre chose, et c'est elle qui vaut preuve : l'empreinte
-- CROISÉE, méthode inaugurée par `0086`. Le SQL réellement REÇU par Supabase
-- (`supabase_migrations.schema_migrations.statements`) a été haché après la
-- même normalisation que le fichier de `main`, et les deux valeurs sont
-- identiques. C'est ce qui distingue `journal_supabase` d'une déclaration :
-- ce qui a tourné est ce qui est écrit dans le dépôt, vérifié, pas affirmé.
-- ============================================================================

insert into zabelie_schema_migrations
  (filename, sha256, applied_at, applied_by, statut, preuve, note)
values
  ('0087_rail_gratis.sql',
   '104316909c20e5100ef7cb54981de4e67fc0d3a5e59df0bbe6d1643ab4f51b2a',
   '2026-08-22 02:37:13+00',
   'porteur — autorisation permanente du 2026-08-17 + signal direct « reessaie » du 2026-08-22, appliquee par agent via MCP',
   'appliquee', 'journal_supabase',
   'Empreinte croisee (methode 0086) : SHA-256 du SQL RECU par Supabase, '
   'commentaires retires et espaces reduits = '
   'd2bfbb8cc3851f3f3b23ef3b322d5844030e1c8b7d53814849db0394354c3b9d, '
   'identique a celui du fichier de main. Effet mesure : payment_rail = '
   'moncash,stripe,zelle,gratis.'),
  ('0088_livraison_jour_meme.sql',
   'e41f646289964d249fcae7afcfff18e45d5e5e72c5e723ca359009e3412ee247',
   '2026-08-22 02:38:49+00',
   'porteur — autorisation permanente du 2026-08-17 + signal direct « reessaie » du 2026-08-22, appliquee par agent via MCP',
   'appliquee', 'journal_supabase',
   'Empreinte croisee (methode 0086) = '
   '53050764401b3ef7dbe312e3fdf5b98a9873e67ca9b9787a16374bfb76502c0a '
   'des deux cotes. Sonde P1/P2 executee sur 3 profils reels ; ligne de sonde '
   'supprimee, 0 residu, 9 produits inchanges. Aucun trigger sur products : '
   'rien laisse derriere.')
on conflict (filename) do nothing;

-- ── Post-condition ──────────────────────────────────────────────────────────
-- ⚠️ CONNU-NÉGATIF INCLUS. Une inscription qui ne vérifie que « la ligne
-- existe » ne prouve rien : `on conflict do nothing` rend un succès silencieux
-- quand la ligne était déjà là avec un AUTRE contenu. On assert donc sur le
-- contenu — l'empreinte et le statut — pas sur la présence.
do $$
declare
  v_manquantes text;
begin
  select string_agg(x.f, ', ') into v_manquantes
    from (values
      ('0087_rail_gratis.sql',
       '104316909c20e5100ef7cb54981de4e67fc0d3a5e59df0bbe6d1643ab4f51b2a'),
      ('0088_livraison_jour_meme.sql',
       'e41f646289964d249fcae7afcfff18e45d5e5e72c5e723ca359009e3412ee247')
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
      '0089 KO: inscription absente ou divergente au registre pour % — '
      'le registre ne decrit pas ce qui a tourne en production',
      v_manquantes using errcode = 'ZB089';
  end if;

  raise notice
    '0089 OK: 0087 et 0088 inscrites, empreinte et statut conformes';
end $$;
