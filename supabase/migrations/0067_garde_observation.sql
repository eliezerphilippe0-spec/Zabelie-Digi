select zabelie_migration_garde('0067_garde_observation.sql');

-- ============================================================================
-- 0067 — L'OBSERVATION DU GARDE, DANS UNE TABLE PLUTÔT QUE DANS LE VENT
-- ============================================================================
-- `0065` porte une question ouverte, et elle l'a posée correctement : elle ne
-- devine pas si `apply_migration` inscrit sa ligne au journal interne AVANT ou
-- APRÈS l'exécution des instructions — elle COMPTE et journalise. Le jour où
-- une migration gardée passerait, la trace donnerait la réponse, et un garde
-- renforcé pourrait s'appuyer sur une mesure au lieu d'une hypothèse.
--
-- ─── CE QUI S'EST PASSÉ, ET C'EST LA RAISON D'ÊTRE DE CE FICHIER ────────────
-- `0066` est passée le 2026-08-12. Le garde a tourné, l'observation a été
-- calculée… et personne ne l'a lue. Elle partait dans un `raise notice`, et
-- l'outil par lequel cette base est administrée **ne remonte pas les
-- notices**. La mesure a eu lieu dans un canal aveugle.
--
-- Le défaut ne vient pas du raisonnement de `0065` — il vient de son CANAL.
-- Et il n'était pas visible en répétition : `psql` affiche les `notice`, donc
-- l'instrument marchait parfaitement partout sauf là où il devait servir.
-- C'est le motif du dépôt appliqué à l'observabilité elle-même : un
-- instrument éprouvé dans les mauvaises conditions.
--
-- ⚠️ `0065` est appliquée, son fichier ne bouge plus. On ne corrige pas son
-- `raise notice` — on lui ADJOINT une table, et le garde y écrira à partir de
-- maintenant. La correction se fait par ajout, jamais par retour en arrière.
--
-- ─── CE QUE CETTE TABLE N'EST PAS ───────────────────────────────────────────
-- Ni un journal d'audit, ni une trace de gouvernance — la règle 5 est servie
-- par `applied_by` et par le rapport de session. C'est un carnet de mesure,
-- avec une seule question à répondre, une seule fois. Quand la réponse sera
-- lue et qu'un `0068` aura renforcé le garde, cette table aura fini son
-- travail : il faudra la retirer plutôt que la laisser grossir.
-- ============================================================================

do $$
begin
  if to_regproc('public.zabelie_migration_garde') is null then
    raise exception
      'ZB067 : zabelie_migration_garde absente — appliquer 0065 AVANT 0067.'
      using errcode = 'ZB067';
  end if;
end $$;

create table zabelie_garde_observations (
  id         bigint generated always as identity primary key,
  fichier    text        not null,
  -- LE CHIFFRE QU'ON CHERCHE. Nombre de lignes portant ce nom au journal
  -- interne de Supabase, LU PENDANT l'exécution de la migration :
  --   0   → `apply_migration` inscrit sa ligne APRÈS les instructions ;
  --   ≥ 1 → il l'inscrit AVANT, et un garde qui lirait ce journal se verrait
  --         lui-même — il bloquerait toute première application.
  lignes_journal integer,
  -- NULL quand le journal interne n'existe pas : c'est le cas de la CI et des
  -- bases de répétition. Distinguer « 0 ligne » de « pas de journal » est tout
  -- l'objet de la colonne — sans quoi la CI polluerait la mesure avec des
  -- zéros qui ne veulent pas dire la même chose.
  journal_present boolean not null,
  observe_a  timestamptz not null default now()
);

alter table zabelie_garde_observations enable row level security;
revoke all on zabelie_garde_observations from anon, authenticated;

comment on table zabelie_garde_observations is
  'Carnet de mesure du garde de rejeu (0065). Répond à UNE question : apply_migration inscrit-il sa ligne au journal interne avant ou après l''exécution ? lignes_journal = 0 → après ; >= 1 → avant. À retirer quand la réponse aura servi à renforcer le garde.';

-- ─────────── LE GARDE ÉCRIT DÉSORMAIS CE QU'IL VOIT ─────────────────────────
-- Signature et comportement INCHANGÉS : mêmes refus, mêmes codes d'erreur.
-- Seule la destination de l'observation change — du vent vers une table.
create or replace function zabelie_migration_garde(p_fichier text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_statut  text;
  v_journal integer;
  v_present boolean := false;
begin
  if p_fichier is null or p_fichier !~ '^\d{4}_[a-z0-9_]+\.sql$' then
    raise exception 'ZB065 : nom de fichier de migration invalide (%)', p_fichier
      using errcode = 'ZB065';
  end if;

  select statut into v_statut
    from zabelie_schema_migrations where filename = p_fichier;

  if v_statut = 'appliquee' then
    raise exception
      'ZB065 : % est deja inscrite comme appliquee au registre — rejeu refuse. Si l''inscription est fausse, corrigez le registre AVANT de rejouer, jamais l''inverse.',
      p_fichier using errcode = 'ZB065';
  end if;

  -- L'OBSERVATION, ÉCRITE. Le `raise notice` de `0065` est conservé — il ne
  -- coûte rien et sert dans `psql` — mais il n'est plus le seul canal.
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    v_present := true;
    execute format(
      'select count(*) from supabase_migrations.schema_migrations where name = %L',
      replace(p_fichier, '.sql', '')
    ) into v_journal;
    raise notice
      'ZB065 observation : % — journal interne Supabase = % ligne(s) PENDANT l''execution (0 = inscrit apres, >=1 = inscrit avant)',
      p_fichier, v_journal;
  end if;

  -- Écriture SANS effet de bord sur le garde : si la table manque (base de
  -- répétition d'avant 0067), on n'empêche pas la migration de tourner. Un
  -- carnet de mesure ne bloque jamais le chemin qu'il observe.
  if to_regclass('public.zabelie_garde_observations') is not null then
    insert into zabelie_garde_observations (fichier, lignes_journal, journal_present)
    values (p_fichier, v_journal, v_present);
  end if;
end;
$$;

revoke all on function zabelie_migration_garde(text) from public, anon, authenticated;

-- ─────────── POST-CONDITIONS ────────────────────────────────────────────────
do $$
declare
  v_avant integer;
  v_apres integer;
  v_lu    integer;
begin
  select count(*) into v_avant from zabelie_garde_observations;

  -- LE GARDE DOIT ÉCRIRE. On l'appelle sur un nom qui n'est pas au registre —
  -- il laisse passer — et on vérifie qu'une ligne est apparue. Sans cette
  -- assertion, un `insert` mal placé laisserait la table vide pour toujours,
  -- et l'absence de mesure ressemblerait à une mesure à zéro.
  perform zabelie_migration_garde('9999_sonde_de_0067.sql');
  select count(*) into v_apres from zabelie_garde_observations;
  if v_apres <> v_avant + 1 then
    raise exception 'ZB067 : le garde n''a pas ecrit son observation (% -> %)', v_avant, v_apres;
  end if;

  -- Et la ligne doit porter ce qu'on cherche, pas n'importe quoi.
  select lignes_journal into v_lu
    from zabelie_garde_observations where fichier = '9999_sonde_de_0067.sql';
  raise notice 'ZB067 OK — observation ecrite, journal interne = % ligne(s) pour un nom inconnu', v_lu;

  -- La sonde ne laisse pas de trace : elle a prouvé l'écriture, pas mesuré
  -- une vraie migration.
  delete from zabelie_garde_observations where fichier = '9999_sonde_de_0067.sql';

  -- Le garde refuse TOUJOURS un rejeu — la réécriture ne l'a pas ramolli.
  --
  -- ⚠️ PREMIÈRE VERSION DE CE BLOC : elle appelait le garde sur
  -- `0065_garde_de_rejeu.sql`, en supposant qu'il soit inscrit `appliquee`.
  -- C'est vrai en PRODUCTION, où sa ligne a été insérée à la main, et FAUX en
  -- CI, où aucune migration n'inscrit `0065` — `0063` s'arrête à `0062`. La
  -- post-condition a donc rougi au premier passage, en annonçant « le garde a
  -- cesse de refuser » alors que le garde allait très bien : il n'avait
  -- simplement rien à refuser.
  --
  -- Une assertion qui dépend d'un état ambiant ne prouve pas ce qu'elle
  -- croit. Celle-ci FABRIQUE son cas, donc elle vaut dans les deux mondes.
  insert into zabelie_schema_migrations
    (filename, sha256, statut, preuve, applied_at, applied_by)
  values ('9998_sonde_rejeu_0067.sql', '-', 'appliquee', 'sonde_schema', now(), 'sonde 0067');
  begin
    perform zabelie_migration_garde('9998_sonde_rejeu_0067.sql');
    raise exception 'ZB067 : le garde a cesse de refuser les rejeux apres reecriture';
  exception when sqlstate 'ZB065' then
    raise notice 'ZB067 OK — le refus de rejeu tient toujours';
  end;
  delete from zabelie_schema_migrations where filename = '9998_sonde_rejeu_0067.sql';
  delete from zabelie_garde_observations where fichier = '9998_sonde_rejeu_0067.sql';
end $$;
