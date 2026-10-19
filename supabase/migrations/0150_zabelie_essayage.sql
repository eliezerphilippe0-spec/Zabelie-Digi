select zabelie_migration_garde('0150_zabelie_essayage.sql');

-- 0150 — Essayage virtuel, pilote (docs/74 ; tasks/essayage-todo.md 3.1 et 3.2).
-- Exige 0001 (products, profiles), 0035 et 0077 (taxonomie), 0036 (physique),
-- 0098 (products.category_id).
--
-- ─── CE QUE LA BASE GARANTIT ───────────────────────────────────────────────
-- 1. Rien de l'essayage n'est lisible ni modifiable par `anon` ou
--    `authenticated` : tables et fonctions au rôle service seul. Le serveur
--    passe l'identité de l'acheteur tirée de la session VÉRIFIÉE, jamais d'une
--    donnée du navigateur. Raison : un acheteur qui pourrait clore lui-même un
--    essai le dirait « échoué », sortirait du quota et obtiendrait des essais
--    payants sans limite.
-- 2. Une fiche n'est éligible que publiée, physique, avec photo principale,
--    d'un vendeur pilote actif, rangée dans un sous-rayon ouvert (niveau 3),
--    et regardée par un autre que son vendeur.
-- 3. Pause, plafond du mois haïtien (global) et quota du jour haïtien (par
--    acheteur) sont vérifiés puis l'essai inscrit sous UN verrou : des
--    réservations simultanées ne dépassent jamais le plafond.
-- 4. Seul un essai ÉCHOUÉ ne compte pas. Un essai abandonné « en cours »
--    compte : le fournisseur facture dès la création.
-- 5. Aucune colonne ne contient de photo, d'URL de photo ou de résultat.
--
-- La sonde `zabelie_objets_requis()` recevra ces fonctions avec leurs appels
-- `.rpc()` (tâches 4.1 et 4.2) : la surveiller sans appelant ferait un fantôme
-- (`tests/objets-requis-couverture.test.ts`).

-- ── Réglages du pilote (une ligne) ─────────────────────────────────────────
create table public.zabelie_essayage_config (
  id           boolean primary key default true check (id),
  plafond_mois integer not null default 1000 check (plafond_mois between 0 and 1000000),
  quota_jour   integer not null default 5 check (quota_jour between 0 and 100),
  en_pause     boolean not null default false,
  modifie_le   timestamptz not null default now()
);
insert into public.zabelie_essayage_config (id) values (true) on conflict do nothing;

-- ── Vendeurs pilotes, activés un par un par l'administration ───────────────
create table public.zabelie_essayage_vendeurs (
  seller_id  uuid primary key references public.profiles (id) on delete cascade,
  actif      boolean not null default true,
  active_par uuid references public.profiles (id) on delete set null,
  active_le  timestamptz not null default now()
);

-- ── Sous-rayons ouverts (docs/74 §2.1 ; la même liste que lib/essayage/regles.ts) ──
create table public.zabelie_essayage_rayons (
  category_id uuid primary key references public.zabelie_categories (id) on delete cascade
);
insert into public.zabelie_essayage_rayons (category_id)
select c.id
  from public.zabelie_categories c
  join public.zabelie_categories parent on parent.id = c.parent_id
 where c.level = 3
   and parent.slug in ('rad-fanm', 'rad-gason', 'rad-espo')
   and c.slug in (
     'wob', 'blouz-chemizye', 'pantalon-djin-fanm', 'jip', 'ansanm-taye', 'ves-manto-fanm', 'rad-tradisyonel',
     'chemiz', 'mayo-polo', 'pantalon-djin-gason', 'chot', 'kostim', 'ves-gason',
     'mayo-chot-espo', 'sivetman')
on conflict do nothing;
-- Fermé par défaut : si l'arbre ne rend pas les quinze, la migration s'arrête
-- plutôt que d'ouvrir un rayon de travers ou d'en fermer un sans bruit.
do $$
begin
  if (select count(*) from public.zabelie_essayage_rayons) <> 15 then
    raise exception 'essayage : % sous-rayons trouvés au lieu de 15', (select count(*) from public.zabelie_essayage_rayons);
  end if;
end;
$$;

-- ── Essais : qui, quoi, chez qui, où en est-il. Jamais la photo ni le résultat ──
create table public.zabelie_essayage_essais (
  id          uuid primary key default gen_random_uuid(),
  acheteur_id uuid not null references public.profiles (id) on delete cascade,
  produit_id  uuid not null references public.products (id) on delete cascade,
  vendeur_id  uuid not null references public.profiles (id) on delete cascade,
  fournisseur text not null check (fournisseur in ('genlook', 'fashn', 'simulation')),
  travail_id  text check (travail_id is null or length(travail_id) between 1 and 200),
  statut      text not null default 'en_cours' check (statut in ('en_cours', 'reussi', 'echec')),
  raison      text check (raison is null or raison in ('moderation', 'photo_refusee', 'fournisseur', 'delai')),
  cree_le     timestamptz not null default now(),
  termine_le  timestamptz,
  constraint zabelie_essayage_essais_fin check ((statut = 'en_cours') = (termine_le is null)),
  constraint zabelie_essayage_essais_raison check ((statut = 'echec') = (raison is not null))
);
create index zabelie_essayage_essais_acheteur_idx on public.zabelie_essayage_essais (acheteur_id, cree_le desc);
create index zabelie_essayage_essais_cree_idx on public.zabelie_essayage_essais (cree_le);

-- ── Expositions : première vue d'une fiche éligible, par jour, dans les deux groupes ──
create table public.zabelie_essayage_expositions (
  acheteur_id  uuid not null references public.profiles (id) on delete cascade,
  produit_id   uuid not null references public.products (id) on delete cascade,
  groupe       text not null check (groupe in ('essai', 'temoin')),
  jour         date not null,
  premiere_vue timestamptz not null default now(),
  primary key (acheteur_id, produit_id, jour)
);

-- ── Droits : rôle service seul. RLS active et aucune politique : rien pour les clients ──
alter table public.zabelie_essayage_config enable row level security;
alter table public.zabelie_essayage_vendeurs enable row level security;
alter table public.zabelie_essayage_rayons enable row level security;
alter table public.zabelie_essayage_essais enable row level security;
alter table public.zabelie_essayage_expositions enable row level security;
revoke all on public.zabelie_essayage_config, public.zabelie_essayage_vendeurs, public.zabelie_essayage_rayons,
              public.zabelie_essayage_essais, public.zabelie_essayage_expositions
  from public, anon, authenticated, service_role;
-- L'administration (tâche 5.1) règle le pilote et ses vendeurs ; elle LIT les essais.
grant select, update on public.zabelie_essayage_config to service_role;
grant select, insert, update, delete on public.zabelie_essayage_vendeurs to service_role;
grant select on public.zabelie_essayage_rayons to service_role;
-- Essais et expositions ne s'écrivent QUE par les fonctions ci-dessous.
grant select on public.zabelie_essayage_essais, public.zabelie_essayage_expositions to service_role;

-- ── Éligibilité d'une fiche (et, si l'acheteur est donné, pas la sienne) ───
create function public.zabelie_essayage_eligible(p_produit uuid, p_acheteur uuid default null)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
      from public.products p
      join public.zabelie_essayage_vendeurs v on v.seller_id = p.seller_id and v.actif
      join public.zabelie_essayage_rayons r on r.category_id = p.category_id
     where p.id = p_produit
       and p.status = 'published'
       and p.kind = 'physical'
       and nullif(btrim(p.cover_url), '') is not null
       and (p_acheteur is null or p.seller_id <> p_acheteur)
  );
$$;

-- ── Réserver un essai : éligibilité, pause, plafond, quota, inscription ────
-- Rend (essai, null) ou (null, refus) avec refus parmi non_eligible, pause,
-- plafond, quota : les codes de lib/essayage/regles.ts.
create function public.zabelie_essayage_reserver(p_acheteur uuid, p_produit uuid, p_fournisseur text)
returns table (essai uuid, refus text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c public.zabelie_essayage_config%rowtype;
  v_jour timestamptz := date_trunc('day', now() at time zone 'America/Port-au-Prince') at time zone 'America/Port-au-Prince';
  v_mois timestamptz := date_trunc('month', now() at time zone 'America/Port-au-Prince') at time zone 'America/Port-au-Prince';
  v_n integer;
  v_vendeur uuid;
  v_id uuid;
begin
  if p_acheteur is null or p_produit is null or p_fournisseur is null
     or p_fournisseur not in ('genlook', 'fashn', 'simulation') then
    raise exception 'essayage_demande_invalide' using errcode = '22023';
  end if;
  if not public.zabelie_essayage_eligible(p_produit, p_acheteur) then
    return query select null::uuid, 'non_eligible'::text;
    return;
  end if;

  -- Tout ce qui suit est sérialisé : pause, plafond, quota et inscription.
  perform pg_advisory_xact_lock(hashtext('zabelie_essayage_essais'));

  select * into c from public.zabelie_essayage_config where id;
  if not found then
    raise exception 'essayage_config_absente' using errcode = 'P0001';
  end if;
  if c.en_pause then
    return query select null::uuid, 'pause'::text;
    return;
  end if;
  -- Seul un essai échoué ne compte pas (garantie 4).
  select count(*) into v_n from public.zabelie_essayage_essais where cree_le >= v_mois and statut <> 'echec';
  if v_n >= c.plafond_mois then
    return query select null::uuid, 'plafond'::text;
    return;
  end if;
  select count(*) into v_n from public.zabelie_essayage_essais
   where acheteur_id = p_acheteur and cree_le >= v_jour and statut <> 'echec';
  if v_n >= c.quota_jour then
    return query select null::uuid, 'quota'::text;
    return;
  end if;

  select seller_id into v_vendeur from public.products where id = p_produit;
  insert into public.zabelie_essayage_essais (acheteur_id, produit_id, vendeur_id, fournisseur)
  values (p_acheteur, p_produit, v_vendeur, p_fournisseur)
  returning id into v_id;
  return query select v_id, null::text;
end;
$$;

-- ── Noter le travail du fournisseur, une seule fois, sur un essai en cours ─
create function public.zabelie_essayage_lancer(p_essai uuid, p_travail text)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ok boolean;
begin
  if p_travail is null or length(p_travail) not between 1 and 200 then
    raise exception 'essayage_travail_invalide' using errcode = '22023';
  end if;
  update public.zabelie_essayage_essais
     set travail_id = p_travail
   where id = p_essai and statut = 'en_cours' and travail_id is null
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

-- ── Clore un essai : en cours → réussi, ou échec avec sa raison. Une fois ──
create function public.zabelie_essayage_terminer(p_essai uuid, p_statut text, p_raison text default null)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ok boolean;
begin
  if p_statut is null or p_statut not in ('reussi', 'echec')
     or (p_statut = 'echec') <> (p_raison is not null)
     or (p_raison is not null and p_raison not in ('moderation', 'photo_refusee', 'fournisseur', 'delai')) then
    raise exception 'essayage_fin_invalide' using errcode = '22023';
  end if;
  update public.zabelie_essayage_essais
     set statut = p_statut, raison = p_raison, termine_le = now()
   where id = p_essai and statut = 'en_cours'
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

-- ── Exposition : une par acheteur, fiche et jour haïtien, fiche éligible seulement ──
create function public.zabelie_essayage_exposer(p_acheteur uuid, p_produit uuid, p_groupe text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_acheteur is null or p_groupe is null or p_groupe not in ('essai', 'temoin') then
    raise exception 'essayage_exposition_invalide' using errcode = '22023';
  end if;
  if not public.zabelie_essayage_eligible(p_produit, p_acheteur) then
    return;
  end if;
  insert into public.zabelie_essayage_expositions (acheteur_id, produit_id, groupe, jour)
  values (p_acheteur, p_produit, p_groupe, (now() at time zone 'America/Port-au-Prince')::date)
  on conflict do nothing;
end;
$$;

revoke all on function public.zabelie_essayage_eligible(uuid, uuid) from public, anon, authenticated;
revoke all on function public.zabelie_essayage_reserver(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.zabelie_essayage_lancer(uuid, text) from public, anon, authenticated;
revoke all on function public.zabelie_essayage_terminer(uuid, text, text) from public, anon, authenticated;
revoke all on function public.zabelie_essayage_exposer(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.zabelie_essayage_eligible(uuid, uuid) to service_role;
grant execute on function public.zabelie_essayage_reserver(uuid, uuid, text) to service_role;
grant execute on function public.zabelie_essayage_lancer(uuid, text) to service_role;
grant execute on function public.zabelie_essayage_terminer(uuid, text, text) to service_role;
grant execute on function public.zabelie_essayage_exposer(uuid, uuid, text) to service_role;
