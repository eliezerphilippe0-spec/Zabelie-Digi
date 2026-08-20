-- ============================================================================
-- C3.1 (docs/31) — LES GRANTS DE COLONNE, QUE PERSONNE NE LISAIT
-- ============================================================================
-- Ce garde existe parce que son absence a tué deux pages pendant quatre jours,
-- sans une ligne de journal.
--
-- `0015` a posé sur `profiles` une **liste blanche de colonnes** : `revoke
-- select` global, puis `grant select (id, role, display_name, bio, avatar_url,
-- tier, created_at)`. C'est une liste FERMÉE. `0069` y a ajouté `zone_id` et
-- `pwen_repe`, `0083` `boutik_slug` — aucune n'a été ajoutée à la liste, et
-- **Postgres n'avait aucune raison de le dire** : une colonne non citée dans
-- un grant ne lève rien, ne journalise rien. Elle naît invisible.
--
-- Résultat mesuré en production le 2026-08-18 sous le rôle `anon` :
-- `/createur/[id]` et `/boutik/[slug]` répondaient 404 pour tout le monde,
-- parce que leurs `select` citaient ces colonnes. Détail qui compte :
-- **il suffit de FILTRER sur une colonne non accordée** (`where boutik_slug =
-- …`) pour se faire refuser toute la requête — la colonne n'a même pas besoin
-- d'être dans la liste des champs rendus.
--
-- Pourquoi aucun garde existant ne pouvait l'attraper :
--   • `rls_toutes_tables` (C3.4) lit `pg_tables.rowsecurity` — la RLS ÉTAIT
--     active, et `profiles_public_read` valait `true`. Tout allait bien.
--   • les tests de policies lisent `pg_policies` — la RLS filtre des LIGNES,
--     jamais des COLONNES. Le filtre réel n'y figure pas.
--   • `tsc` ne voit rien : la colonne est adressée par CHAÎNE, dans un
--     `.select("…")`. C'est la classe d'artefact que `CLAUDE.md` dit de
--     croiser mécaniquement, faute de compilateur pour la voir.
--
-- ─── CE QUE LE GARDE EXIGE ─────────────────────────────────────────────────
-- Sur toute table où une liste blanche est en vigueur, chaque colonne est
-- soit **accordée**, soit **déclarée privée ci-dessous, avec sa raison**. Une
-- colonne ni l'une ni l'autre fait rougir la CI : c'est un choix qui n'a pas
-- été fait, pas un choix qu'on a fait.
--
-- ⚠️ Et la déclaration se périme DANS LES DEUX SENS. Une liste qui ne sait
-- que grandir devient une conformité par usure : L3 échoue donc aussi quand
-- une colonne déclarée privée a été ACCORDÉE entre-temps. La déclaration
-- suit la base, elle ne la commente pas.
-- ============================================================================

begin;

-- La déclaration. Une ligne = une colonne volontairement hors de portée de
-- `anon`/`authenticated`, et POURQUOI.
create temporary table zabelie_colonnes_privees (
  nom_table  text not null,
  colonne    text not null,
  raison     text not null,
  primary key (nom_table, colonne)
) on commit drop;

insert into zabelie_colonnes_privees (nom_table, colonne, raison) values
  ('profiles', 'country_code',     '0015 : reserve au service_role (tableau /admin/geo)'),
  ('profiles', 'region_code',      '0015 : reserve au service_role (tableau /admin/geo)'),
  ('profiles', 'suspended_at',     'moderation — un profil ne publie pas sa sanction'),
  ('profiles', 'suspended_reason', 'moderation — texte libre ecrit par un admin, jamais public'),
  ('profiles', 'suspended_by',     'moderation — n''expose pas quel admin a agi'),
  ('profiles', 'zone_id',          '0084 : servi par zabelie_boutik_public pour les MARCHANDS seuls ; un grant l''ouvrirait aussi sur les acheteurs'),
  ('profiles', 'pwen_repe',        '0084 : idem — point de repere saisi par tout compte sur le formulaire de livraison'),
  ('profiles', 'boutik_slug',      '0084 : idem — la resolution d''adresse passe par la fonction, pas par un filtre direct');

-- Les tables sous liste blanche : grants de COLONNE présents, grant de TABLE
-- absent. C'est la définition exacte d'« une liste blanche est en vigueur ».
create temporary view zabelie_listes_blanches as
  select col.table_name, col.grantee
    from (select distinct table_name, grantee
            from information_schema.column_privileges
           where table_schema = 'public' and privilege_type = 'SELECT'
             and grantee in ('anon', 'authenticated')) col
   where not exists (
     select 1 from information_schema.role_table_grants t
      where t.table_schema = 'public' and t.privilege_type = 'SELECT'
        and t.table_name = col.table_name and t.grantee = col.grantee);

-- Les colonnes invisibles : sous liste blanche, et pas dans le grant.
create temporary view zabelie_colonnes_invisibles as
  select lb.table_name, lb.grantee, c.column_name
    from zabelie_listes_blanches lb
    join information_schema.columns c
      on c.table_schema = 'public' and c.table_name = lb.table_name
   where not exists (
     select 1 from information_schema.column_privileges p
      where p.table_schema = 'public' and p.privilege_type = 'SELECT'
        and p.table_name = lb.table_name and p.column_name = c.column_name
        and p.grantee = lb.grantee);

-- ── L1. Connu-POSITIF — le garde sait-il voir une colonne invisible ? ──────
-- Sans L1, une sonde mal jointe rendrait « zéro colonne orpheline » pour
-- toujours : le vert qui ne vérifie rien. On ajoute un témoin à `profiles`,
-- il doit apparaître, et il ne doit pas être seul à être trouvé par hasard —
-- on vérifie qu'il est NOMMÉ.
alter table profiles add column zabelie_temoin_invisible text;

do $$
declare v_vu int;
begin
  select count(*) into v_vu from zabelie_colonnes_invisibles
   where table_name = 'profiles' and column_name = 'zabelie_temoin_invisible';
  if v_vu = 0 then
    raise exception 'L1 KO : la colonne-temoin ajoutee SANS grant n''a pas ete vue — la sonde est aveugle, son zero ne prouverait rien';
  end if;
  if v_vu <> 2 then
    raise exception 'L1 KO : le temoin est vu % fois au lieu de 2 (anon + authenticated) — la sonde ne couvre pas les deux roles', v_vu;
  end if;
  raise notice 'L1 OK : une colonne ajoutee sans grant est vue, pour les deux roles';
end $$;

-- ── L2. Second connu-POSITIF — le garde sait-il voir l'INVERSE ? ───────────
-- Une déclaration périmée dans l'autre sens : la colonne est déclarée privée
-- ET accordée. Le témoin reçoit le grant, la contradiction doit se voir.
grant select (zabelie_temoin_invisible) on profiles to anon, authenticated;
insert into zabelie_colonnes_privees values
  ('profiles', 'zabelie_temoin_invisible', 'temoin de L2 — declaration volontairement fausse');

do $$
declare v_contradictions int;
begin
  select count(*) into v_contradictions
    from zabelie_colonnes_privees d
    join zabelie_listes_blanches lb on lb.table_name = d.nom_table
   where exists (
     select 1 from information_schema.column_privileges p
      where p.table_schema = 'public' and p.privilege_type = 'SELECT'
        and p.table_name = d.nom_table and p.column_name = d.colonne
        and p.grantee = lb.grantee);
  if v_contradictions = 0 then
    raise exception 'L2 KO : une colonne declaree privee ET accordee n''est pas detectee — la declaration ne pourrait que grandir, elle deviendrait une conformite par usure';
  end if;
  raise notice 'L2 OK : une declaration perimee dans l''autre sens est vue';
end $$;

-- Le témoin sort de scène — la suite porte sur le dépôt réel.
delete from zabelie_colonnes_privees where colonne = 'zabelie_temoin_invisible';
alter table profiles drop column zabelie_temoin_invisible;

-- ── L3. L'INVARIANT — aucune colonne orpheline, aucune déclaration périmée ─
do $$
declare
  v_orphelines text;
  v_n          int;
  v_perimees   text;
  v_m          int;
  v_tables     int;
begin
  select count(*) into v_tables from zabelie_listes_blanches;

  -- (a) invisible et non déclarée : un choix jamais fait.
  select count(*), string_agg(distinct format('%s.%s', table_name, column_name), ', ' order by format('%s.%s', table_name, column_name))
    into v_n, v_orphelines
    from zabelie_colonnes_invisibles i
   where not exists (
     select 1 from zabelie_colonnes_privees d
      where d.nom_table = i.table_name and d.colonne = i.column_name);
  if v_n > 0 then
    raise exception 'L3 KO : % colonne(s) invisible(s) a anon/authenticated et non declaree(s) : %. Une colonne ajoutee a une table sous liste blanche n''est PAS lisible, et Postgres ne le dit pas — un `.select()` ou meme un `.eq()` qui la cite se fait refuser TOUTE la requete. Soit vous l''accordez dans la migration qui la cree, soit vous la declarez privee ci-dessus avec sa raison.', v_n, v_orphelines;
  end if;

  -- (b) déclarée privée alors qu'elle est accordée : déclaration périmée.
  select count(*), string_agg(distinct format('%s.%s', d.nom_table, d.colonne), ', ' order by format('%s.%s', d.nom_table, d.colonne))
    into v_m, v_perimees
    from zabelie_colonnes_privees d
    join zabelie_listes_blanches lb on lb.table_name = d.nom_table
   where exists (
     select 1 from information_schema.column_privileges p
      where p.table_schema = 'public' and p.privilege_type = 'SELECT'
        and p.table_name = d.nom_table and p.column_name = d.colonne
        and p.grantee = lb.grantee);
  if v_m > 0 then
    raise exception 'L3 KO : % declaration(s) perimee(s) — % est accordee alors qu''elle est declaree privee. Retirez la ligne de la declaration.', v_m, v_perimees;
  end if;

  -- La sonde a-t-elle lu quelque chose ? `profiles` est sous liste blanche
  -- depuis 0015 ; zéro table lue voudrait dire que le harnais n'a pas
  -- appliqué les migrations, et le vert serait celui du vide.
  if v_tables = 0 then
    raise exception 'L3 KO : aucune table sous liste blanche trouvee — profiles l''est depuis 0015, le harnais n''a pas applique les migrations';
  end if;

  raise notice 'L3 OK : % couple(s) table/role sous liste blanche, aucune colonne orpheline, aucune declaration perimee', v_tables;
end $$;

rollback;
