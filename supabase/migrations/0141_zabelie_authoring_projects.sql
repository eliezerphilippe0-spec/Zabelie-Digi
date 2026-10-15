select zabelie_migration_garde('0141_zabelie_authoring_projects.sql');

-- 0141 — Studio de création éditoriale, phase 2 : les projets privés
-- (docs/70 §7.1, tasks/todo.md 2.1).
--
-- ─── LE MODÈLE DE DROITS (décision C1-A du 2026-10-15) ─────────────────────
-- Le vendeur lit et écrit SES projets sous son propre JWT, à travers la RLS.
-- Aucune route du Studio n'emploie le service role pour ces tables. Mais un
-- JWT valide permet aussi d'appeler PostgREST DIRECTEMENT, sans passer par
-- nos routes : tout ce que la route vérifie, la base doit donc le tenir aussi.
--   - Écriture par colonne : `authenticated` ne peut modifier QUE les colonnes
--     éditoriales. `revision`, `plan_approuve_revision`, `archived_at`,
--     `seller_id` et les dates ne s'écrivent pas par SQL direct (PRD T31).
--   - Création, approbation du plan, archivage : par fonctions qui lisent
--     `auth.uid()`, jamais un identifiant fourni par le client.
--   - Le contenu reste une ENTRÉE NON FIABLE : la base en borne la forme et la
--     taille (lues dans la config), la route le revalide entièrement.
--
-- ─── LA SAUVEGARDE PAR COMPARAISON DE RÉVISION (PRD §10.1) ─────────────────
-- La route écrit `update … where id = $1 and revision = $attendue`. Zéro ligne
-- = conflit, jamais une écriture gagnante silencieuse. Le trigger fixe
-- `revision = old.revision + 1` dès qu'une colonne éditoriale change :
-- le client ne choisit jamais le numéro.
-- `derniere_sauvegarde` est un jeton aléatoire fourni à chaque sauvegarde :
-- si la réponse se perd, relire ce jeton dit « c'était nous » sans ambiguïté
-- (lib/digital-authoring/revision.ts, `rapprocherApresPerte`).
--
-- ─── CE QU'ELLE NE TOUCHE PAS ──────────────────────────────────────────────
-- Aucune table existante. Aucun lien vers produit, commande, paiement,
-- release ou droit acquis : un projet supprimé n'emporte rien d'autre que
-- lui-même. Le module reste éteint (`ZABELIE_AUTHORING_ENABLED` absent).

-- ── Configuration (une seule ligne, règle dure n°3) ────────────────────────
-- Limites du PRD §11.1. `projets_actifs_max` est une borne TECHNIQUE proposée
-- (PRD §11.1 « projets actifs »), réglable sans redéploiement.
create table public.zabelie_authoring_config (
  id boolean primary key default true check (id),
  titre_max integer not null default 160 check (titre_max between 10 and 500),
  brief_max integer not null default 6000 check (brief_max between 500 and 20000),
  sections_max integer not null default 12 check (sections_max between 1 and 40),
  section_max integer not null default 12000 check (section_max between 1000 and 50000),
  total_max integer not null default 120000 check (total_max between 10000 and 500000),
  projets_actifs_max integer not null default 10 check (projets_actifs_max between 1 and 100),
  updated_at timestamptz not null default now()
);
insert into public.zabelie_authoring_config (id) values (true);

alter table public.zabelie_authoring_config enable row level security;
revoke all on public.zabelie_authoring_config from public, anon, authenticated, service_role;
-- Les limites ne sont pas secrètes : la route les lit sous le JWT du vendeur.
grant select on public.zabelie_authoring_config to authenticated, service_role;
create policy zabelie_authoring_config_lecture on public.zabelie_authoring_config
  for select to authenticated using (true);

-- ── Projets ────────────────────────────────────────────────────────────────
create table public.zabelie_authoring_projects (
  id uuid primary key default gen_random_uuid(),
  -- Un compte supprimé emporte ses projets ; rien d'autre ne dépend d'eux.
  seller_id uuid not null references public.profiles(id) on delete cascade,
  titre text not null check (char_length(titre) between 1 and 500),
  langue text not null check (langue in ('ht', 'fr')),
  public_vise text not null check (public_vise in ('haiti', 'diaspora', 'both')),
  marche_diaspora text not null default '' check (char_length(marche_diaspora) <= 500),
  brief jsonb not null default '{}'::jsonb check (jsonb_typeof(brief) = 'object'),
  contenu jsonb not null default '{"objectif": "", "sections": []}'::jsonb
    check (jsonb_typeof(contenu) = 'object' and jsonb_typeof(contenu -> 'sections') = 'array'),
  revision integer not null default 1 check (revision >= 1),
  derniere_sauvegarde uuid,
  plan_approuve_revision integer check (plan_approuve_revision is null or plan_approuve_revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint zabelie_authoring_projects_marche check (public_vise <> 'haiti' or marche_diaspora = '')
);
create index zabelie_authoring_projects_vendeur on public.zabelie_authoring_projects (seller_id, updated_at desc);

alter table public.zabelie_authoring_projects enable row level security;
revoke all on public.zabelie_authoring_projects from public, anon, authenticated, service_role;
grant select on public.zabelie_authoring_projects to authenticated;
grant update (titre, langue, public_vise, marche_diaspora, brief, contenu, derniere_sauvegarde)
  on public.zabelie_authoring_projects to authenticated;
-- Lecture seule pour l'export de compte (tâche 5.3) et le diagnostic.
grant select on public.zabelie_authoring_projects to service_role;

create policy zabelie_authoring_projects_lecture on public.zabelie_authoring_projects
  for select to authenticated using (seller_id = auth.uid());
-- Un projet archivé est en lecture seule : la clause `using` ne le retient pas.
create policy zabelie_authoring_projects_ecriture on public.zabelie_authoring_projects
  for update to authenticated
  using (seller_id = auth.uid() and archived_at is null)
  with check (seller_id = auth.uid());

-- ── Garde : limites lues en base, révision et dates calculées ──────────────
create function public.zabelie_authoring_projects_garde() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  c public.zabelie_authoring_config%rowtype;
begin
  select * into c from public.zabelie_authoring_config where id;
  if not found then
    raise exception 'authoring_config_absente' using errcode = 'P0001';
  end if;
  if char_length(new.titre) > c.titre_max or char_length(new.marche_diaspora) > c.titre_max then
    raise exception 'authoring_titre_trop_long' using errcode = '23514';
  end if;
  -- Bornes de STOCKAGE, en octets (4 au plus par caractère UTF-8, plus la
  -- syntaxe JSON). La mesure exacte, en caractères, est celle de la route.
  if octet_length(new.brief::text) > c.brief_max * 4 + 4096 then
    raise exception 'authoring_brief_trop_long' using errcode = '23514';
  end if;
  if jsonb_array_length(new.contenu -> 'sections') > c.sections_max then
    raise exception 'authoring_trop_de_sections' using errcode = '23514';
  end if;
  if octet_length(new.contenu::text) > c.total_max * 4 + 65536 then
    raise exception 'authoring_contenu_trop_long' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    new.revision := 1;
    new.plan_approuve_revision := null;
    new.archived_at := null;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  if new.seller_id <> old.seller_id or new.created_at <> old.created_at then
    raise exception 'authoring_projet_immuable' using errcode = '42501';
  end if;
  -- Une écriture éditoriale (ou une nouvelle sauvegarde) avance la révision
  -- d'exactement un. Une approbation ou un archivage ne la touche pas.
  if (new.titre, new.langue, new.public_vise, new.marche_diaspora, new.brief, new.contenu, new.derniere_sauvegarde)
     is distinct from
     (old.titre, old.langue, old.public_vise, old.marche_diaspora, old.brief, old.contenu, old.derniere_sauvegarde) then
    new.revision := old.revision + 1;
    new.updated_at := now();
  else
    new.revision := old.revision;
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;
revoke all on function public.zabelie_authoring_projects_garde() from public, anon, authenticated;
create trigger zabelie_authoring_projects_garde
  before insert or update on public.zabelie_authoring_projects
  for each row execute function public.zabelie_authoring_projects_garde();

-- ── Création : le vendeur vient de la session, pas du client ───────────────
create function public.zabelie_authoring_creer_projet(
  p_titre text, p_langue text, p_public text, p_marche text
) returns setof public.zabelie_authoring_projects
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_moi uuid := auth.uid();
  v_max integer;
  v_actifs integer;
begin
  if v_moi is null then
    raise exception 'authoring_connexion_requise' using errcode = '42501';
  end if;
  if not public.seller_is_active(v_moi) then
    raise exception 'authoring_compte_inactif' using errcode = '42501';
  end if;
  select projets_actifs_max into v_max from public.zabelie_authoring_config where id;
  if v_max is null then
    raise exception 'authoring_config_absente' using errcode = 'P0001';
  end if;
  -- Deux créations simultanées du même vendeur ne lisent pas le même compte.
  perform pg_advisory_xact_lock(hashtext('zabelie_authoring_projets'), hashtext(v_moi::text));
  select count(*) into v_actifs from public.zabelie_authoring_projects
   where seller_id = v_moi and archived_at is null;
  if v_actifs >= v_max then
    raise exception 'authoring_projets_max' using errcode = 'P0001';
  end if;
  return query
    insert into public.zabelie_authoring_projects (seller_id, titre, langue, public_vise, marche_diaspora)
    values (v_moi, p_titre, p_langue, p_public, coalesce(p_marche, ''))
    returning *;
end;
$$;

-- ── Approbation du plan : une révision EXACTE, celle que le vendeur a vue ───
create function public.zabelie_authoring_approuver_plan(p_projet uuid, p_revision integer)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_moi uuid := auth.uid();
  p public.zabelie_authoring_projects%rowtype;
begin
  if v_moi is null or not public.seller_is_active(v_moi) then
    raise exception 'authoring_compte_inactif' using errcode = '42501';
  end if;
  select * into p from public.zabelie_authoring_projects where id = p_projet for update;
  if not found or p.seller_id <> v_moi then
    raise exception 'authoring_projet_introuvable' using errcode = '42501';
  end if;
  if p.archived_at is not null then
    raise exception 'authoring_projet_archive' using errcode = 'P0001';
  end if;
  if p.revision <> p_revision then
    raise exception 'authoring_revision_perimee' using errcode = '40001';
  end if;
  if jsonb_array_length(p.contenu -> 'sections') = 0 then
    raise exception 'authoring_plan_vide' using errcode = 'P0001';
  end if;
  update public.zabelie_authoring_projects set plan_approuve_revision = p_revision where id = p_projet;
  return p_revision;
end;
$$;

-- ── Archivage : retire de la vue active, ne touche à rien d'autre ──────────
create function public.zabelie_authoring_archiver(p_projet uuid)
returns timestamptz
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_moi uuid := auth.uid();
  v_le timestamptz;
begin
  if v_moi is null then
    raise exception 'authoring_connexion_requise' using errcode = '42501';
  end if;
  update public.zabelie_authoring_projects
     set archived_at = now()
   where id = p_projet and seller_id = v_moi and archived_at is null
  returning archived_at into v_le;
  if v_le is null then
    raise exception 'authoring_projet_introuvable' using errcode = '42501';
  end if;
  return v_le;
end;
$$;

-- Supabase accorde EXECUTE à anon par défaut (bootstrap, 2026-10-14) :
-- révoquer `public` ne suffit pas, il faut nommer `anon`.
revoke all on function public.zabelie_authoring_creer_projet(text, text, text, text) from public, anon, authenticated;
revoke all on function public.zabelie_authoring_approuver_plan(uuid, integer) from public, anon, authenticated;
revoke all on function public.zabelie_authoring_archiver(uuid) from public, anon, authenticated;
grant execute on function public.zabelie_authoring_creer_projet(text, text, text, text) to authenticated;
grant execute on function public.zabelie_authoring_approuver_plan(uuid, integer) to authenticated;
grant execute on function public.zabelie_authoring_archiver(uuid) to authenticated;

-- ── Post-conditions : on asserte l'EFFET ───────────────────────────────────
do $$
begin
  if not exists (select 1 from public.zabelie_authoring_config where id) then
    raise exception 'ZB141 : ligne de configuration absente';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.zabelie_authoring_projects'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.zabelie_authoring_config'::regclass) then
    raise exception 'ZB141 : RLS inactive';
  end if;
  if has_table_privilege('anon', 'public.zabelie_authoring_projects', 'SELECT')
     or has_table_privilege('anon', 'public.zabelie_authoring_config', 'SELECT') then
    raise exception 'ZB141 : anon lit une table du Studio';
  end if;
  if has_table_privilege('authenticated', 'public.zabelie_authoring_projects', 'INSERT')
     or has_table_privilege('authenticated', 'public.zabelie_authoring_projects', 'DELETE') then
    raise exception 'ZB141 : authenticated insere ou supprime directement';
  end if;
  if has_column_privilege('authenticated', 'public.zabelie_authoring_projects', 'revision', 'UPDATE')
     or has_column_privilege('authenticated', 'public.zabelie_authoring_projects', 'plan_approuve_revision', 'UPDATE')
     or has_column_privilege('authenticated', 'public.zabelie_authoring_projects', 'archived_at', 'UPDATE')
     or has_column_privilege('authenticated', 'public.zabelie_authoring_projects', 'seller_id', 'UPDATE') then
    raise exception 'ZB141 : une colonne calculee est modifiable par le vendeur';
  end if;
  if has_function_privilege('anon', 'public.zabelie_authoring_creer_projet(text, text, text, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.zabelie_authoring_approuver_plan(uuid, integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.zabelie_authoring_archiver(uuid)', 'EXECUTE') then
    raise exception 'ZB141 : anon execute une fonction du Studio';
  end if;
end $$;
