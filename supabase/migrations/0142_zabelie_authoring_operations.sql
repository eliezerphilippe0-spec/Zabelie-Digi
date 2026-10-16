select zabelie_migration_garde('0142_zabelie_authoring_operations.sql');

-- 0142 — Studio de création éditoriale, phase 3 : les opérations d'IA
-- (docs/70 §6 et §7.3, tasks/todo.md 3.1). Exige 0141.
--
-- ─── CE QUE LA BASE GARANTIT, ET POURQUOI ICI ──────────────────────────────
-- 1. Une demande = une ligne, inscrite AVANT tout appel au fournisseur, avec
--    une clé d'idempotence unique par vendeur. Même clé, même entrée : même
--    opération, rien de plus. Même clé, autre entrée : refus (PRD STU 09).
-- 2. L'entrée est un INSTANTANÉ immuable du projet (`zabelie_authoring_revisions`)
--    pris dans la même transaction : si le document change ensuite, la
--    génération et toute reprise lisent l'instantané d'origine (PRD T29).
-- 3. Les quotas (vendeur, plateforme, opérations simultanées) sont comptés
--    sous verrou : dix demandes sur le dernier quota, une seule passe (T08).
--    Une opération annulée ou échouée AVANT l'envoi rend son quota ; après
--    l'envoi, jamais (le fournisseur a pu facturer).
-- 4. Le bail : un exécuteur prend l'opération avec un jeton ; un ancien
--    jeton ne peut plus rien écrire (T10). Un bail expiré APRÈS l'envoi ne
--    rend pas la main : l'opération devient `uncertain`, jamais relancée.
-- 5. Juste avant l'envoi, la base revérifie compte actif, projet admissible
--    et liste pilote (PRD §10.2.5) — un vendeur suspendu entre la demande et
--    l'envoi ne déclenche aucun appel (T30).
--
-- ─── LE MODÈLE DE DROITS (décision C1-A) ───────────────────────────────────
-- Le vendeur LIT ses opérations et ses instantanés sous son JWT. Il demande
-- et annule par deux fonctions sous `auth.uid()`. Il n'écrit JAMAIS un état,
-- un résultat, un jeton ou un compteur (T31). Le bail, la soumission et la
-- conclusion sont le « contrat système » : fonctions réservées au service
-- role, appelées par l'exécuteur du serveur, conditionnées au jeton.
--
-- ─── CE QU'ELLE NE TOUCHE PAS ──────────────────────────────────────────────
-- Aucune table d'argent, de commande, de produit ni de livraison. Les quotas
-- sont NON MONÉTAIRES (PRD §9.5) : ni crédit, ni prix, ni ledger.

-- ── Config : quotas et bail (valeurs techniques proposées, D4 à arbitrer) ──
alter table public.zabelie_authoring_config
  add column suggestions_vendeur_jour integer not null default 10 check (suggestions_vendeur_jour between 0 and 200),
  add column suggestions_global_jour integer not null default 100 check (suggestions_global_jour between 0 and 10000),
  add column operations_simultanees integer not null default 2 check (operations_simultanees between 1 and 10),
  add column bail_secondes integer not null default 60 check (bail_secondes between 10 and 600),
  add column pilote_requis boolean not null default true;

-- ── Liste pilote (D7) : remplie à la main par l'administration ─────────────
create table public.zabelie_authoring_pilotes (
  seller_id uuid primary key references public.profiles(id) on delete cascade,
  ajoute_le timestamptz not null default now()
);
alter table public.zabelie_authoring_pilotes enable row level security;
revoke all on public.zabelie_authoring_pilotes from public, anon, authenticated, service_role;
grant select on public.zabelie_authoring_pilotes to authenticated, service_role;
create policy zabelie_authoring_pilotes_lecture on public.zabelie_authoring_pilotes
  for select to authenticated using (seller_id = auth.uid());

-- ── Instantanés (immuables) ────────────────────────────────────────────────
create table public.zabelie_authoring_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.zabelie_authoring_projects(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  numero integer not null check (numero >= 1),
  titre text not null,
  langue text not null,
  public_vise text not null,
  marche_diaspora text not null,
  brief jsonb not null,
  contenu jsonb not null,
  empreinte text not null check (empreinte ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  constraint zabelie_authoring_revisions_unique unique (project_id, numero)
);
alter table public.zabelie_authoring_revisions enable row level security;
revoke all on public.zabelie_authoring_revisions from public, anon, authenticated, service_role;
grant select on public.zabelie_authoring_revisions to authenticated, service_role;
create policy zabelie_authoring_revisions_lecture on public.zabelie_authoring_revisions
  for select to authenticated using (seller_id = auth.uid());

-- Immuable. Une suppression seulement quand un PARENT a déjà disparu (cascade
-- d'une suppression de projet ou de compte) : sans la seconde condition, la
-- suppression d'un compte échouerait selon l'ordre des cascades (motif 0118).
create function public.zabelie_authoring_revisions_immuable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' and (
       not exists (select 1 from public.zabelie_authoring_projects where id = old.project_id)
    or not exists (select 1 from public.profiles where id = old.seller_id)) then
    return old;
  end if;
  raise exception 'authoring_instantane_immuable' using errcode = '42501';
end;
$$;
revoke all on function public.zabelie_authoring_revisions_immuable() from public, anon, authenticated;
create trigger zabelie_authoring_revisions_immuable
  before update or delete on public.zabelie_authoring_revisions
  for each row execute function public.zabelie_authoring_revisions_immuable();

-- L'instantané de la révision COURANTE d'un projet, créé s'il n'existe pas.
-- Interne : appelé par les fonctions ci-dessous, jamais exposé.
create function public.zabelie_authoring_instantane(p_projet uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p public.zabelie_authoring_projects%rowtype;
  v_id uuid;
begin
  select * into p from public.zabelie_authoring_projects where id = p_projet;
  if not found then
    raise exception 'authoring_projet_introuvable' using errcode = '42501';
  end if;
  insert into public.zabelie_authoring_revisions
    (project_id, seller_id, numero, titre, langue, public_vise, marche_diaspora, brief, contenu, empreinte)
  values (p.id, p.seller_id, p.revision, p.titre, p.langue, p.public_vise, p.marche_diaspora, p.brief, p.contenu,
    encode(sha256(convert_to(jsonb_build_object(
      'titre', p.titre, 'langue', p.langue, 'public', p.public_vise, 'marche', p.marche_diaspora,
      'brief', p.brief, 'contenu', p.contenu)::text, 'UTF8')), 'hex'))
  on conflict (project_id, numero) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.zabelie_authoring_revisions where project_id = p.id and numero = p.revision;
  end if;
  return v_id;
end;
$$;
revoke all on function public.zabelie_authoring_instantane(uuid) from public, anon, authenticated, service_role;

-- ── Opérations ─────────────────────────────────────────────────────────────
create table public.zabelie_authoring_operations (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.zabelie_authoring_projects(id) on delete cascade,
  revision_id uuid not null references public.zabelie_authoring_revisions(id) on delete cascade,
  type text not null check (type in ('plan', 'draft', 'rewrite', 'exercise')),
  section_id uuid,
  idempotency_key uuid not null,
  empreinte text not null check (empreinte ~ '^[0-9a-f]{64}$'),
  etat text not null default 'queued'
    check (etat in ('queued', 'running', 'succeeded', 'failed', 'uncertain', 'cancelled')),
  fournisseur text check (fournisseur is null or fournisseur in ('mock', 'openai', 'gemini')),
  bail_jeton uuid,
  bail_expire timestamptz,
  tentatives integer not null default 0 check (tentatives >= 0),
  soumis_le timestamptz,
  resultat jsonb,
  code_erreur text check (code_erreur is null or code_erreur ~ '^[a-z_]{1,40}$'),
  usage_entree integer check (usage_entree is null or usage_entree >= 0),
  usage_sortie integer check (usage_sortie is null or usage_sortie >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  termine_le timestamptz,
  constraint zabelie_authoring_operations_cle unique (seller_id, idempotency_key),
  constraint zabelie_authoring_operations_cible check ((type = 'plan') = (section_id is null)),
  -- Un état final n'a plus de bail : un vieux jeton n'ouvre plus rien.
  constraint zabelie_authoring_operations_coherence check (
       (etat = 'queued' and soumis_le is null and resultat is null and termine_le is null and bail_jeton is null)
    or (etat = 'running' and resultat is null and termine_le is null and bail_jeton is not null and bail_expire is not null)
    or (etat = 'succeeded' and soumis_le is not null and resultat is not null and termine_le is not null and bail_jeton is null)
    or (etat = 'uncertain' and soumis_le is not null and resultat is null and termine_le is not null and bail_jeton is null)
    or (etat = 'failed' and resultat is null and code_erreur is not null and termine_le is not null and bail_jeton is null)
    or (etat = 'cancelled' and soumis_le is null and resultat is null and code_erreur is not null and termine_le is not null and bail_jeton is null))
);
create index zabelie_authoring_operations_vendeur on public.zabelie_authoring_operations (seller_id, created_at);
create index zabelie_authoring_operations_projet on public.zabelie_authoring_operations (project_id, created_at desc);
create index zabelie_authoring_operations_jour on public.zabelie_authoring_operations (created_at);

alter table public.zabelie_authoring_operations enable row level security;
revoke all on public.zabelie_authoring_operations from public, anon, authenticated, service_role;
-- Le vendeur lit tout SAUF le jeton de bail : il n'en a aucun usage.
grant select (id, seller_id, project_id, revision_id, type, section_id, idempotency_key, etat, fournisseur,
  soumis_le, resultat, code_erreur, created_at, updated_at, termine_le)
  on public.zabelie_authoring_operations to authenticated;
grant select on public.zabelie_authoring_operations to service_role;
create policy zabelie_authoring_operations_lecture on public.zabelie_authoring_operations
  for select to authenticated using (seller_id = auth.uid());

-- Transitions : le miroir de `transitionAdmise` (lib/digital-authoring/operations.ts).
-- Gardé même contre le service role : un exécuteur défaillant ne réécrit
-- pas une opération terminée, ni une soumission déjà inscrite.
create function public.zabelie_authoring_operations_transition() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.zabelie_authoring_projects where id = old.project_id)
       or not exists (select 1 from public.profiles where id = old.seller_id) then
      return old;
    end if;
    raise exception 'authoring_operation_immuable' using errcode = '42501';
  end if;
  if (new.id, new.seller_id, new.project_id, new.revision_id, new.type, new.idempotency_key, new.empreinte, new.created_at)
     is distinct from
     (old.id, old.seller_id, old.project_id, old.revision_id, old.type, old.idempotency_key, old.empreinte, old.created_at)
     or new.section_id is distinct from old.section_id then
    raise exception 'authoring_operation_immuable' using errcode = '42501';
  end if;
  if old.etat in ('succeeded', 'failed', 'uncertain', 'cancelled') then
    raise exception 'authoring_operation_terminee' using errcode = '42501';
  end if;
  if old.soumis_le is not null and new.soumis_le is distinct from old.soumis_le then
    raise exception 'authoring_soumission_immuable' using errcode = '42501';
  end if;
  if not (
       (old.etat = 'queued' and new.etat in ('queued', 'running', 'cancelled', 'failed') and new.soumis_le is null)
    or (old.etat = 'running' and new.etat = 'running')
    or (old.etat = 'running' and new.etat in ('succeeded', 'uncertain') and new.soumis_le is not null)
    or (old.etat = 'running' and new.etat = 'cancelled' and new.soumis_le is null)
    or (old.etat = 'running' and new.etat = 'failed')) then
    raise exception 'authoring_transition_interdite' using errcode = '23514';
  end if;
  new.updated_at := now();
  if new.etat in ('succeeded', 'failed', 'uncertain', 'cancelled') then
    new.termine_le := coalesce(new.termine_le, now());
    new.bail_jeton := null;
    new.bail_expire := null;
  end if;
  return new;
end;
$$;
revoke all on function public.zabelie_authoring_operations_transition() from public, anon, authenticated;
create trigger zabelie_authoring_operations_transition
  before update or delete on public.zabelie_authoring_operations
  for each row execute function public.zabelie_authoring_operations_transition();

-- ── Vendeur : demander une suggestion ──────────────────────────────────────
create function public.zabelie_authoring_demander(p_projet uuid, p_type text, p_section uuid, p_cle uuid)
returns setof public.zabelie_authoring_operations
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_moi uuid := auth.uid();
  p public.zabelie_authoring_projects%rowtype;
  c public.zabelie_authoring_config%rowtype;
  o public.zabelie_authoring_operations%rowtype;
  v_rev uuid;
  v_empreinte text;
  v_debut timestamptz := date_trunc('day', now() at time zone 'America/Port-au-Prince') at time zone 'America/Port-au-Prince';
  v_n integer;
begin
  if v_moi is null or not public.seller_is_active(v_moi) then
    raise exception 'authoring_compte_inactif' using errcode = '42501';
  end if;
  if p_cle is null or p_type is null or p_type not in ('plan', 'draft', 'rewrite', 'exercise')
     or (p_type = 'plan') <> (p_section is null) then
    raise exception 'authoring_demande_invalide' using errcode = '22023';
  end if;
  select * into p from public.zabelie_authoring_projects where id = p_projet for share;
  if not found or p.seller_id <> v_moi then
    raise exception 'authoring_projet_introuvable' using errcode = '42501';
  end if;
  if p.archived_at is not null then
    raise exception 'authoring_projet_archive' using errcode = 'P0001';
  end if;
  -- Aucun texte de section avant l'approbation du plan (PRD STU 03).
  if p_type <> 'plan' then
    if p.plan_approuve_revision is null then
      raise exception 'authoring_plan_non_approuve' using errcode = 'P0001';
    end if;
    if not exists (select 1 from jsonb_array_elements(p.contenu -> 'sections') s where s ->> 'id' = p_section::text) then
      raise exception 'authoring_section_introuvable' using errcode = 'P0001';
    end if;
  end if;

  v_rev := public.zabelie_authoring_instantane(p.id);
  select encode(sha256(convert_to(p_type || ':' || coalesce(p_section::text, '') || ':' || r.empreinte, 'UTF8')), 'hex')
    into v_empreinte from public.zabelie_authoring_revisions r where r.id = v_rev;

  -- Tout ce qui suit est sérialisé : rejeu, quotas et inscription.
  perform pg_advisory_xact_lock(hashtext('zabelie_authoring_operations'));

  select * into o from public.zabelie_authoring_operations where seller_id = v_moi and idempotency_key = p_cle;
  if found then
    if o.empreinte = v_empreinte then
      return next o;
      return;
    end if;
    raise exception 'authoring_cle_conflit' using errcode = 'P0001';
  end if;

  select * into c from public.zabelie_authoring_config where id;
  if not found then
    raise exception 'authoring_config_absente' using errcode = 'P0001';
  end if;
  select count(*) into v_n from public.zabelie_authoring_operations
   where seller_id = v_moi and etat in ('queued', 'running');
  if v_n >= c.operations_simultanees then
    raise exception 'authoring_operations_en_cours' using errcode = 'P0001';
  end if;
  -- Un quota est CONSOMMÉ sauf annulation ou échec avant l'envoi (`reservationLiberable`).
  select count(*) into v_n from public.zabelie_authoring_operations
   where seller_id = v_moi and created_at >= v_debut and not (etat in ('cancelled', 'failed') and soumis_le is null);
  if v_n >= c.suggestions_vendeur_jour then
    raise exception 'authoring_quota_vendeur' using errcode = 'P0001';
  end if;
  select count(*) into v_n from public.zabelie_authoring_operations
   where created_at >= v_debut and not (etat in ('cancelled', 'failed') and soumis_le is null);
  if v_n >= c.suggestions_global_jour then
    raise exception 'authoring_quota_global' using errcode = 'P0001';
  end if;

  return query
    insert into public.zabelie_authoring_operations (seller_id, project_id, revision_id, type, section_id, idempotency_key, empreinte)
    values (v_moi, p.id, v_rev, p_type, p_section, p_cle, v_empreinte)
    returning *;
end;
$$;

-- ── Vendeur : annuler une demande qui n'est pas encore partie ──────────────
create function public.zabelie_authoring_annuler(p_operation uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_etat text;
begin
  if auth.uid() is null then
    raise exception 'authoring_connexion_requise' using errcode = '42501';
  end if;
  update public.zabelie_authoring_operations
     set etat = 'cancelled', code_erreur = 'annule_par_vendeur'
   where id = p_operation and seller_id = auth.uid() and etat = 'queued'
  returning etat into v_etat;
  if v_etat is null then
    raise exception 'authoring_operation_non_annulable' using errcode = 'P0001';
  end if;
  return v_etat;
end;
$$;

-- ── Vendeur : son quota du jour (compteur visible, idée validée le 2026-10-15) ─
-- SECURITY INVOKER : elle lit sous la RLS de l'appelant, avec la MÊME règle
-- que `zabelie_authoring_demander` (jour civil haïtien, quota rendu par une
-- annulation ou un échec avant l'envoi). L'écran ne recalcule rien.
create function public.zabelie_authoring_quota() returns table (utilisees integer, maximum integer)
language sql stable security invoker set search_path = public, pg_temp as $$
  select
    (select count(*)::integer from public.zabelie_authoring_operations
      where seller_id = auth.uid()
        and created_at >= date_trunc('day', now() at time zone 'America/Port-au-Prince') at time zone 'America/Port-au-Prince'
        and not (etat in ('cancelled', 'failed') and soumis_le is null)),
    (select suggestions_vendeur_jour from public.zabelie_authoring_config where id);
$$;
revoke all on function public.zabelie_authoring_quota() from public, anon, authenticated;
grant execute on function public.zabelie_authoring_quota() to authenticated;

-- ── Contrat système (service role seulement) ───────────────────────────────
-- Prendre l'opération : en attente, ou bail expiré AVANT l'envoi. Un bail
-- expiré APRÈS l'envoi fait d'abord passer l'opération en `uncertain`.
create function public.zabelie_authoring_prendre_bail(p_operation uuid, p_jeton uuid)
returns setof public.zabelie_authoring_operations
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_secondes integer;
begin
  select bail_secondes into v_secondes from public.zabelie_authoring_config where id;
  if v_secondes is null then
    raise exception 'authoring_config_absente' using errcode = 'P0001';
  end if;
  update public.zabelie_authoring_operations
     set etat = 'uncertain', code_erreur = 'delai_depasse'
   where id = p_operation and etat = 'running' and soumis_le is not null and bail_expire < now();
  return query
    update public.zabelie_authoring_operations
       set etat = 'running', bail_jeton = p_jeton, bail_expire = now() + make_interval(secs => v_secondes),
           tentatives = tentatives + 1
     where id = p_operation
       and (etat = 'queued' or (etat = 'running' and soumis_le is null and bail_expire < now()))
    returning *;
end;
$$;

-- Inscrire l'envoi AVANT l'appel réseau, après une dernière vérification EN
-- BASE. Faux = ne rien envoyer ; l'opération est alors annulée et son quota
-- rendu (rien n'est parti).
create function public.zabelie_authoring_marquer_soumis(p_operation uuid, p_jeton uuid, p_fournisseur text)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o public.zabelie_authoring_operations%rowtype;
  v_pilote_requis boolean;
  v_refus text;
begin
  select * into o from public.zabelie_authoring_operations where id = p_operation for update;
  if not found or o.bail_jeton is distinct from p_jeton or o.etat <> 'running'
     or o.soumis_le is not null or o.bail_expire < now() then
    return false;
  end if;
  select pilote_requis into v_pilote_requis from public.zabelie_authoring_config where id;
  if not public.seller_is_active(o.seller_id) then
    v_refus := 'compte_inactif';
  elsif exists (select 1 from public.zabelie_authoring_projects where id = o.project_id and archived_at is not null) then
    v_refus := 'projet_inadmissible';
  elsif v_pilote_requis is null then
    v_refus := 'configuration_absente';
  elsif v_pilote_requis and not exists (select 1 from public.zabelie_authoring_pilotes where seller_id = o.seller_id) then
    v_refus := 'hors_pilote';
  end if;
  if v_refus is not null then
    update public.zabelie_authoring_operations set etat = 'cancelled', code_erreur = v_refus where id = o.id;
    return false;
  end if;
  update public.zabelie_authoring_operations set soumis_le = now(), fournisseur = p_fournisseur where id = o.id;
  return true;
end;
$$;

-- Conclure, seulement avec le jeton du bail en cours : un ancien exécuteur
-- n'écrase pas une reprise (T10). Le trigger tient la table des transitions,
-- la contrainte tient la cohérence des champs.
create function public.zabelie_authoring_conclure(
  p_operation uuid, p_jeton uuid, p_etat text, p_resultat jsonb, p_code text, p_usage_entree integer, p_usage_sortie integer
) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.zabelie_authoring_operations
     set etat = p_etat, resultat = p_resultat, code_erreur = p_code,
         usage_entree = p_usage_entree, usage_sortie = p_usage_sortie
   where id = p_operation and bail_jeton = p_jeton and etat = 'running';
  return found;
end;
$$;

-- Supabase accorde EXECUTE à anon par défaut : chaque fonction nomme ses rôles.
revoke all on function public.zabelie_authoring_demander(uuid, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.zabelie_authoring_annuler(uuid) from public, anon, authenticated;
revoke all on function public.zabelie_authoring_prendre_bail(uuid, uuid) from public, anon, authenticated;
revoke all on function public.zabelie_authoring_marquer_soumis(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.zabelie_authoring_conclure(uuid, uuid, text, jsonb, text, integer, integer) from public, anon, authenticated;
grant execute on function public.zabelie_authoring_demander(uuid, text, uuid, uuid) to authenticated;
grant execute on function public.zabelie_authoring_annuler(uuid) to authenticated;
grant execute on function public.zabelie_authoring_prendre_bail(uuid, uuid) to service_role;
grant execute on function public.zabelie_authoring_marquer_soumis(uuid, uuid, text) to service_role;
grant execute on function public.zabelie_authoring_conclure(uuid, uuid, text, jsonb, text, integer, integer) to service_role;

-- ── Sonde de présence (`/api/admin/coherence`) ───────────────────────────
-- Redéfinition COMPLÈTE de la sonde de 0141, avec les cinq fonctions de
-- 0142 et son compteur en plus (`tests/objets-requis-couverture.test.ts`).
create or replace function zabelie_objets_requis()
returns table (objet text, present boolean, pourquoi text)
language sql
stable
set search_path = public, pg_temp
as $$
  -- Presence of the gate/table family means this module is installed (or
  -- partially installed). Its objects remain required even while the gate
  -- is closed: it can open automatically after the first real sale.
  with panier_installe as (
    select to_regprocedure('public.zabelie_panier_groupe_ouvert()') is not null
        or to_regclass('public.zabelie_panier_config') is not null
        or to_regclass('public.zabelie_order_groups') is not null as oui
  )
  select v.objet, to_regprocedure(v.objet) is not null, v.pourquoi
    from (values
      ('zabelie_product_recommendations(uuid,uuid)', 'les recommandations basees sur les achats reels'),
      ('zabelie_configure_product_offers(uuid,uuid,jsonb,boolean)', 'le choix vendeur et les suggestions automatiques'),
      ('zabelie_recommendation_stats(uuid)', 'les ventes attribuees aux recommandations'),
      ('zabelie_save_product_offers(uuid,uuid,jsonb)', 'la configuration des offres associees du vendeur'),
      ('zabelie_offers_public(uuid,uuid)', 'les offres disponibles sur la fiche produit'),
      ('zabelie_offer_stats(uuid)', 'les ventes confirmees issues des offres associees'),
      ('zabelie_digital_metrics(uuid)', 'les statistiques des commandes digitales du vendeur'),
      ('zabelie_webhook_claim(integer)', 'sans elle, aucun webhook vendeur ne part plus : ventes payees jamais signalees aux sites branches (0122)'),
      ('zabelie_webhook_record(uuid,boolean,integer,text)', 'sans elle, un webhook envoye reste en attente et repart en boucle (0122)'),
      ('zabelie_webhook_purge()', 'sans elle, le journal des envois webhook grossit sans fin (0122)'),
      -- ── Le chemin de l'argent. Absente = l'argent entre et rien ne bouge ──
      ('zabelie_claim_pending_payments(payment_rail)', 'la rotation des paiements en attente'),
      ('zabelie_order_participant(uuid)', 'la verification de propriete des dossiers'),
      ('zabelie_avis_produit(uuid,integer)', 'sans elle, les fiches produit n''affichent plus aucun avis (0137) : la lecture directe des auteurs est fermee'),
      ('zabelie_identites_verifiees(uuid[])', 'sans elle, aucun badge Identite verifiee ne s''affiche (0138) : silencieux, la page reste correcte'),
      ('zabelie_repondre_avis(uuid,text)', 'sans elle, un vendeur ne peut plus repondre a un avis (0139) : la route rend une erreur'),
      ('zabelie_authoring_creer_projet(text,text,text,text)', 'sans elle, aucun vendeur ne cree de projet dans le Studio de creation (0141) : la route rend une erreur'),
      ('zabelie_authoring_approuver_plan(uuid,integer)', 'sans elle, aucun plan de guide ne s''approuve (0141) : la redaction reste bloquee'),
      ('zabelie_authoring_archiver(uuid)', 'sans elle, un projet du Studio ne s''archive plus (0141) : le plafond de projets actifs devient un mur'),
      ('zabelie_authoring_demander(uuid,text,uuid,uuid)', 'sans elle, aucune suggestion ne peut etre demandee (0142) : quotas et idempotence ne sont plus tenus'),
      ('zabelie_authoring_annuler(uuid)', 'sans elle, une demande en attente ne s''annule plus (0142)'),
      ('zabelie_authoring_quota()', 'sans elle, le compteur de suggestions restantes ne s''affiche plus (0142)'),
      ('zabelie_authoring_prendre_bail(uuid,uuid)', 'sans elle, aucune suggestion n''est traitee (0142) : les demandes restent en attente'),
      ('zabelie_authoring_marquer_soumis(uuid,uuid,text)', 'sans elle, rien ne part vers le fournisseur (0142) : la verification avant envoi est le seul passage'),
      ('zabelie_authoring_conclure(uuid,uuid,text,jsonb,text,integer,integer)', 'sans elle, aucun resultat n''est enregistre (0142) : les operations restent en cours puis deviennent incertaines'),
      ('zabelie_submit_support(uuid,uuid,uuid,text,text,text)', 'les demandes et reponses du support'),
      ('zabelie_accept_account_legal(text,text,boolean,boolean)', 'enregistre les deux déclarations explicites de la première session OAuth (0133)'),
      ('zabelie_record_refund_receipt(uuid,uuid,text,text,timestamp with time zone)', 'sans elle, le retour effectif des fonds ne peut plus etre documente'),
      ('zabelie_operations_queue(integer,integer)', 'sans elle, les commandes bloquees disparaissent du suivi administrateur'),
      ('zabelie_market_metrics(integer)', 'sans elle, les ventes reelles par zone et categorie ne sont plus mesurables'),
      ('zabelie_stripe_payment_failed(uuid,text,text)', 'libere le stock apres un echec Stripe differe'),
      ('confirm_payment(text,text,jsonb,integer,integer)',
       'la confirmation serveur-à-serveur (invariant b) : absente, un paiement encaissé ne crée ni commande payée ni escrow'),
      ('refund_order(uuid)',
       'le remboursement : absente, un litige ne peut plus être résolu que par une écriture manuelle — donc hors ledger'),
      ('mature_wallets()',
       'la maturation J+7 : absente, aucun solde ne devient jamais retirable et le cron 13:00 échoue en silence'),
      ('zabelie_expire_stale_payment(text,text)',
       'expire les paiements qui n''aboutiront jamais : absente, les commandes en attente s''accumulent et le stock reste réservé'),
      ('zabelie_solvency_report()',
       'le rapport de solvabilité lu par /api/admin/coherence : absente, l''invariant 0033 n''est plus contrôlé du tout'),
      ('purge_payment_raw(integer)',
       'purge les charges brutes de paiement : absente, des données de paiement s''accumulent sans limite de rétention'),

      -- ── Retrait vendeur (chantier 0) ─────────────────────────────────────
      ('zabelie_request_payout(uuid,bigint)',
       'la demande de retrait : absente, la voie de sortie vendeur est fermée — le grief central du dossier BRH'),
      ('zabelie_settle_payout(uuid,payout_method,text,uuid,text)',
       'le règlement d''un retrait : absente, une demande acceptée ne peut plus être soldée'),
      ('zabelie_reject_payout(uuid,text,uuid)',
       'le refus motivé d''un retrait : absente, un refus se ferait sans trace ni motif'),
      ('zabelie_record_manual_payout(uuid,bigint,payout_method,text,uuid,text,timestamp with time zone)',
       'inscrit un versement fait à la main : absente, un paiement réel sortirait du ledger'),

      -- ── Stock ────────────────────────────────────────────────────────────
      ('zabelie_release_stock(uuid)',
       'libère une réservation : absente, un article annulé reste indisponible pour toujours'),
      ('zabelie_expire_stock_reservations()',
       'expire les réservations abandonnées (cron 13:45) : absente, le stock se vide sans qu''une vente ait eu lieu'),

      -- ── Expédition et remise (0043) ──────────────────────────────────────
      ('zabelie_open_fulfillment(uuid)',
       'ouvre le suivi d''une commande physique : absente, une commande payée n''entre jamais en expédition'),
      ('zabelie_declare_shipment(uuid,uuid,text)',
       'le vendeur déclare l''expédition : absente, il ne peut plus rien déclarer'),
      ('zabelie_mark_received(uuid,uuid,boolean)',
       'l''acheteur confirme la réception : absente, l''escrow ne se verrouille jamais'),
      ('zabelie_report_not_received(uuid,uuid,text)',
       'l''acheteur signale la non-réception : absente, le seul recours acheteur disparaît'),
      ('zabelie_fulfillment_sweep()',
       'le filet des commandes oubliées (cron 12:30) : absente, une commande payée peut rester orpheline sans que rien ne le dise'),

      -- ── Panier et rabais ─────────────────────────────────────────────────
      ('zabelie_cart_add(uuid)',    'ajout au panier : absente, le panier ne se remplit plus'),
      ('zabelie_cart_remove(uuid)', 'retrait du panier : absente, on ne peut plus retirer un article'),
      ('zabelie_set_variant_discount(uuid,uuid,uuid,bigint)', 'pose le rabais de la variante choisie en conservant son prix historique'),
      ('zabelie_clear_variant_discount(uuid,uuid,uuid)', 'retire le prix barre de la variante sans augmenter son prix courant'),
      ('zabelie_set_discount(uuid,uuid,bigint)',
       'pose un rabais vendeur : absente, la promotion est impossible côté vendeur'),
      ('zabelie_clear_discount(uuid,uuid)',
       'retire un rabais : absente, un rabais posé ne peut plus être annulé — un prix reste bas indéfiniment'),
      ('expire_coupons_job()',
       'expire les coupons (cron) : absente, un coupon périmé reste utilisable'),

      -- ── Fidélité (dormante, mais appelée par un cron) ────────────────────
      ('expire_points_batch_job()',
       'expire les lots de points (cron 14:00) : le système est débranché, mais le cron l''appelle — absente, le cron échoue et son échec masque les autres'),

      -- ── Notifications (0061) ─────────────────────────────────────────────
      ('zabelie_outbox_enqueue(uuid,zabelie_outbox_kind,text)',
       'met un avis en file : absente, plus aucune notification n''est jamais émise — et rien ne le signale'),
      ('zabelie_outbox_claim(uuid)',
       'réserve un avis à envoyer : absente, la file se remplit sans jamais se vider'),
      ('zabelie_outbox_mark_sent(uuid)',
       'marque l''avis envoyé : absente, le même avis serait renvoyé en boucle'),
      ('zabelie_outbox_mark_failed(uuid,text)',
       'marque l''échec d''envoi : absente, un échec devient indistinguable d''un envoi réussi'),
      ('zabelie_claim_notification(uuid)',
       'réserve une notification côté lecteur : absente, la lecture des avis se bloque'),

      -- ── Baux de cron (0060) ──────────────────────────────────────────────
      ('zabelie_cron_lease_acquire(text,text,integer)',
       'prend le bail d''un cron : absente, deux exécutions simultanées peuvent traiter la même chose deux fois'),
      ('zabelie_cron_lease_release(text,text)',
       'rend le bail : absente, un bail non rendu bloque le cron suivant jusqu''à expiration'),

      -- ── Recherche ────────────────────────────────────────────────────────
      ('zabelie_search_normalize(text)',
       'normalise une requête de recherche (0047) : absente, le capteur de demande dégrade en silence'),
      ('zabelie_record_search_miss(text,text,text)',
       'enregistre une recherche sans résultat : absente, on cesse de savoir ce que les acheteurs cherchent en vain'),
      ('zabelie_search_demand(integer,integer)',
       'restitue la demande non servie au tableau admin : absente, la page se vide sans erreur visible'),
      ('zabelie_search_fuzzy(text,integer)',
       'la recherche approximative : absente, une faute de frappe ne trouve plus rien'),
      -- ── Relances de paiement abandonné (0124) ────────────────────────────
      ('zabelie_relances_dues(integer)',
       'liste les relances dues (cron 15:30) : absente, aucune relance ne part et le journal paraît sain'),
      ('zabelie_email_jeton(uuid)',
       'le jeton de désabonnement de chaque e-mail : absente, aucune relance ne part'),
      ('zabelie_email_desabonner(uuid)',
       'le désabonnement en un clic : absente, un acheteur ne peut plus arrêter les relances'),
      -- ── Domaine personnalisé (0125) ──────────────────────────────────────
      ('zabelie_domaine_demander(uuid,text)',
       'la demande de domaine du vendeur : absente, le formulaire échoue'),
      ('zabelie_domaine_retirer(uuid)',
       'le retrait du domaine par le vendeur : absente, un vendeur ne peut plus débrancher son domaine'),
      ('zabelie_domaine_decider(uuid,boolean,text)',
       'la décision admin : absente, aucun domaine ne peut être activé ni refusé'),
      ('zabelie_domaine_boutik(text)',
       'hôte vers boutique, lu à chaque visite d''un domaine vendeur : absente, tous les domaines actifs répondent 404'),
      ('zabelie_purge_search_misses()',
       'purge la rétention 90 j des recherches (cron 14:15) : absente, des requêtes utilisateurs sont conservées au-delà de la durée annoncée'),

      -- ── KYC (0079) ───────────────────────────────────────────────────────
      ('zabelie_register_kyc_document(uuid,text,text,jsonb)',
       'le depot atomique des pieces KYC (0130) : absente, aucun document ne peut etre depose sans perdre la protection des decisions concurrentes'),
      ('zabelie_kyc_docs_expires()',
       'liste les pièces d''identité à purger : absente, la purge ne trouve rien et paraît saine'),
      ('zabelie_purge_kyc_documents(uuid[])',
       'purge les pièces d''identité (cron 14:45) : absente, des documents ultra-sensibles sont conservés au-delà de la durée annoncée'),

      -- ── Conformité et garde-fous ─────────────────────────────────────────
      ('zabelie_record_policy_acceptance(uuid,text)',
       'sans elle, TOUTE création de fiche échoue (0046) — et l''échec tombe devant l''un des vingt premiers vendeurs, recrutés un par un'),
      ('zabelie_rate_limit(text,integer,integer)',
       'le plafonnement d''appels : absente, les plafonds cessent d''exister sans qu''aucune erreur ne soit levée'),
      ('zabelie_objets_requis()',
       'cette sonde elle-même : absente, /api/admin/coherence retombe sur le registre, qui déclare au lieu de constater'),

      -- ── Topup (V-11) ─────────────────────────────────────────────────────
      ('zabelie_topup_confirm_payment(uuid,text,jsonb,integer,integer)',
       'confirme une recharge : absente, un client paie sa recharge et ne la reçoit jamais'),
      ('zabelie_topup_transition(uuid,topup_status,jsonb)',
       'la machine à états des recharges : absente, une commande de recharge reste figée'),

      -- ── Business (0022) ──────────────────────────────────────────────────
      ('zabelie_biz_get_invoice_by_token(text)',
       'le portail public de facture : absente, tout lien de facture envoyé à un client tombe'),
      ('zabelie_biz_upsert_item(uuid,text,integer,bigint,uuid)',
       'ajoute une ligne de facture : absente, l''éditeur de facture ne peut plus rien enregistrer'),
      ('zabelie_biz_recompute_invoice(uuid)',
       'recalcule les totaux serveur : absente, un total pourrait être cru sur parole du client'),
      ('zabelie_biz_send_invoice(uuid)',
       'passe la facture à « envoyée » et fige son contenu : absente, une facture envoyée resterait modifiable'),
      ('zabelie_biz_void_invoice(uuid)',
       'annule une facture non payée : absente, une facture erronée ne peut plus être retirée'),
      ('zabelie_biz_confirm_invoice_payment(uuid,payment_rail,text,bigint,text)',
       'confirme le paiement MonCash d''une facture pro : absente, un client paie sa facture et elle reste « envoyée »'),

      -- ── Les sept que le grep à la main avait manqués ─────────────────────
      -- Elles sont appelées avec des apostrophes simples ou sur plusieurs
      -- lignes. C'est le garde `tests/objets-requis-couverture.test.ts` qui
      -- les a trouvées, pas l'œil : un `.rpc()` est un artefact adressé par
      -- CHAÎNE, et une liste tenue à la main en oublie toujours.
      ('zabelie_reserve_stock(uuid,uuid,integer)',
       'réserve le stock à la commande, atomiquement : absente, deux acheteurs peuvent acheter le dernier article'),
      ('zabelie_topup_reserve_order(uuid,uuid,text,topup_operator,integer,integer,integer,payment_rail,integer)',
       'crée une commande de recharge sous plafonds : absente, plus aucune recharge ne peut être commandée'),
      ('zabelie_search_index_integrity()',
       'contrôle l''intégrité de l''index de recherche, lu par /api/admin/coherence : absente, ce contrôle-là devient muet'),
      ('zabelie_fichier_sans_livrable_sweep()',
       'rattrape les fiches fichier sans livrable (0059) : absente, un acheteur peut payer un fichier qui n''existe pas'),
      ('zabelie_service_sans_suivi_sweep()',
       'rattrape les services sans suivi ouvert : absente, une prestation payée reste sans canal de remise'),
      ('zabelie_purge_sent_notices(integer)',
       'purge à 90 j les avis de remise envoyés (0056) : absente, des avis sont conservés au-delà de la durée annoncée — c''est le cas AUJOURD''HUI, voir la liste des absences attendues ci-dessous'),

      -- ── Les deux de `0084`, ajoutées PAR LE GARDE lui-même ───────────────
      -- Le croisement code × sonde les a nommées à la première exécution sur
      -- la branche de `0084`, avant qu'on y pense. C'est la démonstration que
      -- le garde vaut mieux qu'une liste tenue à la main : il a trouvé un cas
      -- réel, pas une mutation fabriquée pour lui plaire.
      ('zabelie_boutik_public(uuid,text)',
       'la fiche publique d''une boutique (0084) : absente, /createur/[id] et /boutik/[slug] répondent 404 pour tout le monde — la panne exacte que 0084 répare'),
      ('zabelie_vande_nan_zon(uuid[])',
       'les marchands d''une zone (0084) : absente, le filtre acheteur par zone rend zéro vendeur en journalisant « introuvables », ce qui se lit comme « cette zone est vide »'),

      -- ── Ajoutée PAR LE GARDE, une seconde fois (0099) ────────────────────
      -- Le croisement code × sonde a nommé celle-ci dès la première exécution,
      -- exactement comme les deux de `0084` ci-dessus. Deux fois sur deux, il a
      -- trouvé un cas réel avant qu'on y pense.
      ('zabelie_save_product_commitment(uuid,uuid,text,text,integer,text,date,boolean)',
       'enregistre les engagements de remise et la disponibilite declaree par le vendeur (0107)'),
      ('zabelie_est_rechaj(uuid)',
       'decide si une fiche exige un numero a recharger (0099) : absente, /api/checkout leve sur toute fiche portant un sous-rayon — c''est-a-dire que PLUS AUCUN achat ne passe, recharge ou non'),
      ('zabelie_age_minimum(uuid)',
       'age minimum d''une fiche par l''ascendance de son rayon (0115) : absente, /api/checkout refuse en 503 toute fiche portant un sous-rayon, et la fiche produit perd sa mention 18+')
    ) as v(objet, pourquoi)
  union all
  select v.objet, to_regclass('public.' || v.objet) is not null, v.pourquoi
  from (values
    ('zabelie_support_cases','les dossiers de commandes'),
    ('zabelie_support_messages','les messages des dossiers'),
    ('zabelie_refund_receipts','les justificatifs de remboursement'),
    ('zabelie_operations_config','les seuils de suivi'),
    ('zabelie_payment_checks','la rotation des paiements'),
    ('zabelie_seller_pricing_config','configuration des tarifs vendeurs'),
    ('zabelie_seller_launch','eligibilite et compteur des 30 jours'),
    ('zabelie_order_pricing','tarif fige a la commande'),
    ('zabelie_product_commitments','les engagements publics de remise et de disponibilite (0107)'),
    ('zabelie_digital_studio','les brouillons de packs et de formations'),
    ('zabelie_digital_releases','les versions acquises et leurs fichiers privés'),
    ('zabelie_digital_entitlements','le contenu attaché à chaque commande'),
    ('zabelie_digital_progress','la progression privée des acheteurs'),
    ('zabelie_digital_accesses','les demandes de téléchargement mesurées'),
    ('zabelie_order_age_attestations','les attestations d''age des acheteurs (0115)'),
    ('zabelie_api_keys','les cles d''API vendeur (0121)'),
    ('zabelie_webhook_endpoints','les adresses webhook des vendeurs (0122)'),
    ('zabelie_webhook_deliveries','la file des envois webhook (0122)'),
    ('zabelie_seller_domains','les domaines personnalises des boutiques (0125)')
  ) v(objet,pourquoi)
  union all
  select v.objet, exists(select 1 from pg_trigger g where g.tgname=v.objet and not g.tgisinternal and g.tgenabled <> 'D'), v.pourquoi
  from (values
    ('zabelie_support_message_immutable','les messages non modifiables'),
    ('zabelie_refund_receipt_immutable','les justificatifs non modifiables'),
    ('zabelie_order_seller_guard','interdit les commandes des vendeurs suspendus'),
    ('zabelie_original_payment_method_guard','conserve le moyen d’origine après purge du payload (0132)'),
    ('zabelie_preserve_account_closure','conserve la date de fermeture au rejeu'),
    ('zabelie_record_seller_launch','enregistre la premiere offre'),
    ('zabelie_start_waiting_launches','demarre les lancements eligibles'),
    ('zabelie_snapshot_order_pricing','fige les frais a la commande'),
    ('zabelie_guard_order_pricing','protege le tarif fige'),
    ('zabelie_protect_test_account','empêche un compte de retirer sa marque d''essai'),
    ('zabelie_digital_order_snapshot','fige la version lors de la commande'),
    ('zabelie_digital_publication','crée une version après modération'),
    ('zabelie_digital_release_immutable','interdit la réécriture des versions achetées'),
    ('zabelie_digital_entitlement_immutable','interdit le remplacement du contrat acheté'),
    ('zabelie_digital_asset_guard','interdit de modifier un livrable publié'),
    ('zabelie_digital_studio_draft_guard','réserve la modification des leçons aux brouillons'),
    ('zabelie_order_age_attestation_immutable','interdit la reecriture d''une attestation d''age (0115)'),
    ('zabelie_api_keys_garde','plafond et immuabilite des cles d''API (0121)'),
    ('zabelie_webhook_endpoints_garde','plafond et immuabilite des adresses webhook (0122)'),
    ('zabelie_webhook_enfiler_vente','enfile les webhooks a chaque vente payee ou remboursee (0122)')
  ) v(objet,pourquoi)
  union all
  select v.objet, to_regprocedure(v.objet) is not null, v.pourquoi
  from (values
    ('zabelie_panier_groupe_ouvert()',
     'le gate du panier groupe (0128) : absent apres installation, le panier ne peut plus respecter son ouverture conditionnelle'),
    ('zabelie_group_create(uuid,payment_rail)',
     'ouvre un paiement groupe du panier (0128) : absente apres installation, la preparation du panier echoue'),
    ('zabelie_group_seal(uuid)',
     'scelle le total du panier depuis la base (0128) : absente apres installation, aucun paiement groupe ne part vers l''operateur'),
    ('zabelie_group_abort(uuid)',
     'abandonne un groupe avant paiement (0128) : absente apres installation, ses commandes restent pending et tiennent le stock'),
    ('zabelie_confirm_group_payment(uuid,text,jsonb,integer,integer)',
     'confirme les commandes d''un panier paye (0128) : absente apres installation, un encaissement groupe ne confirme aucune commande')
  ) v(objet,pourquoi)
  where (select oui from panier_installe)
  union all
  select v.objet, to_regclass('public.' || v.objet) is not null, v.pourquoi
  from (values
    ('zabelie_order_groups','les paniers payes en une fois (0128) : absente apres installation, le regroupement des commandes est impossible'),
    ('zabelie_panier_config','le gate du paiement groupe (0128) : absente apres installation, la condition d''ouverture ne peut plus etre verifiee')
  ) v(objet,pourquoi)
  where (select oui from panier_installe)
  union all
  select v.objet, exists(select 1 from pg_trigger g where g.tgname=v.objet and not g.tgisinternal and g.tgenabled <> 'D'), v.pourquoi
  from (values
    ('zabelie_group_leader_failed','propage l''echec de la meneuse au panier (0128) : absent apres installation, les autres commandes restent pending et tiennent le stock')
  ) v(objet,pourquoi)
  where (select oui from panier_installe)
  union all
  select 'payments.zabelie_original_method', exists(select 1 from pg_attribute where attrelid='public.payments'::regclass and attname='zabelie_original_method' and not attisdropped), 'conserve le moyen d’origine sans payload personnel (0132)';
$$;

-- ── Post-conditions : on asserte l'EFFET ───────────────────────────────────
do $$
begin
  if to_regclass('public.zabelie_authoring_projects') is null then
    raise exception 'ZB142 : 0141 absente';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.zabelie_authoring_operations'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.zabelie_authoring_revisions'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.zabelie_authoring_pilotes'::regclass) then
    raise exception 'ZB142 : RLS inactive';
  end if;
  if has_table_privilege('authenticated', 'public.zabelie_authoring_operations', 'INSERT')
     or has_table_privilege('authenticated', 'public.zabelie_authoring_operations', 'UPDATE')
     or has_table_privilege('authenticated', 'public.zabelie_authoring_operations', 'DELETE')
     or has_table_privilege('authenticated', 'public.zabelie_authoring_revisions', 'UPDATE')
     or has_table_privilege('authenticated', 'public.zabelie_authoring_pilotes', 'INSERT') then
    raise exception 'ZB142 : le vendeur ecrit directement une table du Studio';
  end if;
  if has_column_privilege('authenticated', 'public.zabelie_authoring_operations', 'bail_jeton', 'SELECT') then
    raise exception 'ZB142 : le jeton de bail est lisible par le vendeur';
  end if;
  if has_function_privilege('authenticated', 'public.zabelie_authoring_prendre_bail(uuid, uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.zabelie_authoring_marquer_soumis(uuid, uuid, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.zabelie_authoring_conclure(uuid, uuid, text, jsonb, text, integer, integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.zabelie_authoring_instantane(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.zabelie_authoring_demander(uuid, text, uuid, uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.zabelie_authoring_annuler(uuid)', 'EXECUTE') then
    raise exception 'ZB142 : une fonction du Studio est exposee au mauvais role';
  end if;
  if has_function_privilege('anon', 'public.zabelie_authoring_quota()', 'EXECUTE') then
    raise exception 'ZB142 : anon lit un quota';
  end if;
  if (select count(*) from zabelie_objets_requis() where objet like 'zabelie_authoring_%' and present) <> 9 then
    raise exception 'ZB142 : la sonde de presence ne voit pas les neuf fonctions du Studio';
  end if;
end $$;
