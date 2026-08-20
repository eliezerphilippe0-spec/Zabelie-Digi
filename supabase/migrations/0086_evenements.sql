select zabelie_migration_garde('0086_evenements.sql');

-- ============================================================================
-- 0086 — TIKÈ LAKAY, PR-T1 : l'événement et ses catégories de billets
-- ============================================================================
-- Premier morceau du chantier `docs/40`. Deux tables, une table de config,
-- leur RLS. **Aucun billet, aucun scan, aucun argent** — ceux-là arrivent en
-- PR-T3 et PR-T4, et le payant attend l'avis du cabinet (`docs/40` §3).
--
-- ─── POURQUOI CE MORCEAU-LÀ D'ABORD ────────────────────────────────────────
-- Le découpage gratuit/payant de `docs/40` n'est pas un confort de planning :
-- c'est ce qui permet de construire l'infrastructure — émission, QR, scanner,
-- journal, révocation — **sans encaisser un centime**, donc sans toucher à la
-- Circulaire 121 ni aggraver la rétention que `docs/17` interroge. Un billet
-- gratuit ne retient rien.
--
-- ─── CE QUI EST DÉLIBÉRÉMENT ABSENT ────────────────────────────────────────
-- * Aucun lien vers `orders`, `payments` ou le ledger. La table ne connaît pas
--   l'argent, et `prix_htg = 0` est le seul prix qu'elle acceptera tant que
--   `paiement_ouvert` reste `false` (voir la contrainte plus bas).
-- * Aucune valeur ajoutée à `product_kind`. `docs/40` A3 bis le pose comme un
--   arbitrage, et `CLAUDE.md` rappelle qu'ajouter une valeur à cette énumération
--   ne casse AUCUNE compilation — ça se fait en une passe complète et déclarée,
--   pas au détour d'une migration de structure.
-- * Aucun rôle `organizer`. `docs/40` A3 recommande d'étendre `creator` :
--   ajouter une valeur à `user_role` toucherait la RLS de tout le dépôt.
--
-- ─── LE VERROU DU PAYANT, EN BASE ET PAS DANS UNE NOTE ─────────────────────
-- `zabelie_ticket_config.paiement_ouvert` vaut `false`, et une contrainte le
-- relie au prix : tant qu'il est faux, **aucune catégorie ne peut porter un
-- prix non nul**. Ce n'est pas une ceinture de plus, c'est la traduction en
-- base de l'unique chose que le dossier BRH ne permet pas encore. Une note
-- dans un document s'oublie ; une contrainte, non.
-- ============================================================================

-- ── 1. Statut d'un événement ────────────────────────────────────────────────
-- En kreyòl, comme les autres énumérations métier du dépôt (`docs/40` §4).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'zabelie_event_statut') then
    create type zabelie_event_statut as enum ('bouyon', 'pibliye', 'anile', 'fini');
  end if;
end $$;

-- ── 2. La configuration, AVANT les tables qui s'y réfèrent ─────────────────
create table if not exists zabelie_ticket_config (
  id              boolean primary key default true check (id),
  -- ⛔ LE VERROU. Passe à `true` le jour où l'avis du cabinet le permet, et
  -- pas avant. Voir `docs/40` §3 et `docs/17`.
  paiement_ouvert boolean not null default false,
  -- Bornes de saisie, en table parce que ce sont des paramètres commerciaux
  -- (règle dure n°3) — jamais en dur dans le code.
  quota_max       integer not null default 20000 check (quota_max between 1 and 1000000),
  types_max       integer not null default 10 check (types_max between 1 and 50),
  duree_max_jours integer not null default 30 check (duree_max_jours between 1 and 365)
);
insert into zabelie_ticket_config default values on conflict do nothing;

comment on table zabelie_ticket_config is
  'Bornes et verrou de Tikè Lakay (docs/40). paiement_ouvert = false tant que l''avis BRH n''est pas rendu : la contrainte zabelie_ticket_types_gratuit_tant_que_ferme s''appuie dessus. Défauts PROPOSÉS, modifiables par UPDATE.';

alter table zabelie_ticket_config enable row level security;
revoke all on zabelie_ticket_config from public, anon, authenticated;

-- ── 3. L'événement ──────────────────────────────────────────────────────────
create table if not exists zabelie_events (
  id            uuid primary key default gen_random_uuid(),
  organisateur  uuid not null references profiles(id) on delete cascade,
  titre         text not null check (char_length(btrim(titre)) between 3 and 140),
  description   text check (description is null or char_length(description) <= 4000),
  -- La zone suit `docs/33` : on déclare où l'on est, jamais un `depatman` nu.
  -- Le niveau est gardé ici plutôt que par trigger — l'événement n'a pas la
  -- cascade de cohérence que `profiles` porte (0069), une contrainte suffit.
  zone_id       uuid references zabelie_zones(id),
  lye           text check (lye is null or char_length(lye) <= 200),
  debut_a       timestamptz not null,
  fin_a         timestamptz not null,
  statut        zabelie_event_statut not null default 'bouyon',
  afich_url     text,
  created_at    timestamptz not null default now(),
  -- Un événement qui finit avant de commencer n'est pas un cas limite, c'est
  -- une saisie fausse. Elle est refusée en base, pas rattrapée à l'écran.
  constraint zabelie_events_ordre_dates check (fin_a > debut_a)
);

create index if not exists zabelie_events_organisateur_idx on zabelie_events (organisateur);
create index if not exists zabelie_events_public_idx
  on zabelie_events (debut_a) where statut = 'pibliye';

comment on table zabelie_events is
  'Événement Tikè Lakay (docs/40 PR-T1). Ne connaît NI orders, NI payments, NI le ledger — la billetterie gratuite ne retient aucun fonds.';

-- Le niveau de zone, gardé comme dans `0069` : ni depatman, ni rien d'inconnu.
create or replace function zabelie_events_zone_garde()
returns trigger
language plpgsql
set search_path = public
as $$
declare v_level text;
begin
  if new.zone_id is null then return new; end if;
  select level into v_level from zabelie_zones where id = new.zone_id;
  if v_level is null then
    raise exception 'ZB086 : zone inconnue' using errcode = 'ZB086';
  end if;
  if v_level = 'depatman' then
    raise exception 'ZB086 : un evenement se declare au niveau komin ou katye, jamais depatman — un departement ne dit pas ou aller'
      using errcode = 'ZB086';
  end if;
  return new;
end $$;

drop trigger if exists trg_zabelie_events_zone on zabelie_events;
create trigger trg_zabelie_events_zone
  before insert or update of zone_id on zabelie_events
  for each row execute function zabelie_events_zone_garde();

-- ── 4. Les catégories de billets ────────────────────────────────────────────
create table if not exists zabelie_event_ticket_types (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references zabelie_events(id) on delete cascade,
  non            text not null check (char_length(btrim(non)) between 1 and 60),
  -- ENTIER, jamais un flottant : règle dure n°3. Et `0` est la seule valeur
  -- admise tant que le verrou du payant est fermé — voir la contrainte.
  prix_htg       bigint not null default 0 check (prix_htg >= 0),
  quota          integer not null check (quota > 0),
  vant_kòmanse_a timestamptz,
  vant_fini_a    timestamptz,
  aktif          boolean not null default true,
  created_at     timestamptz not null default now(),
  constraint zabelie_ticket_types_fenetre
    check (vant_fini_a is null or vant_kòmanse_a is null or vant_fini_a > vant_kòmanse_a),
  constraint zabelie_ticket_types_non_unique unique (event_id, non)
);

create index if not exists zabelie_ticket_types_event_idx
  on zabelie_event_ticket_types (event_id);

-- ⛔ LE VERROU DU PAYANT. Une contrainte, pas une note : tant que
-- `paiement_ouvert` est faux, aucun prix non nul n'entre en base. La fonction
-- est `stable` et lit la config — le jour où le porteur bascule le drapeau,
-- les prix deviennent admissibles sans qu'une migration soit nécessaire.
create or replace function zabelie_paiement_billets_ouvert()
returns boolean
language sql
stable
set search_path = public
as $$ select coalesce((select paiement_ouvert from zabelie_ticket_config), false) $$;

alter table zabelie_event_ticket_types
  add constraint zabelie_ticket_types_gratuit_tant_que_ferme
  check (prix_htg = 0 or zabelie_paiement_billets_ouvert());

comment on constraint zabelie_ticket_types_gratuit_tant_que_ferme
  on zabelie_event_ticket_types is
  'docs/40 §3 : la billetterie PAYANTE attend l''avis du cabinet sur la retention (docs/17). Tant que zabelie_ticket_config.paiement_ouvert est false, seul prix_htg = 0 est admis. Une note dans un document s''oublie ; cette contrainte non.';

-- ── 5. RLS ──────────────────────────────────────────────────────────────────
alter table zabelie_events enable row level security;
alter table zabelie_event_ticket_types enable row level security;

-- Lecture publique : les événements PUBLIÉS et non annulés, rien d'autre. Un
-- brouillon appartient à son organisateur seul — c'est le connu-négatif du
-- test qui accompagne cette migration.
drop policy if exists zabelie_events_public_read on zabelie_events;
create policy zabelie_events_public_read on zabelie_events for select
  using (statut = 'pibliye');

drop policy if exists zabelie_events_organisateur_read on zabelie_events;
create policy zabelie_events_organisateur_read on zabelie_events for select
  using (auth.uid() = organisateur);

drop policy if exists zabelie_events_organisateur_write on zabelie_events;
create policy zabelie_events_organisateur_write on zabelie_events for all
  using (auth.uid() = organisateur)
  with check (auth.uid() = organisateur);

-- Les catégories suivent la visibilité de leur événement, jamais la leur.
drop policy if exists zabelie_ticket_types_read on zabelie_event_ticket_types;
create policy zabelie_ticket_types_read on zabelie_event_ticket_types for select
  using (exists (
    select 1 from zabelie_events e
     where e.id = zabelie_event_ticket_types.event_id
       and (e.statut = 'pibliye' or e.organisateur = auth.uid())
  ));

drop policy if exists zabelie_ticket_types_write on zabelie_event_ticket_types;
create policy zabelie_ticket_types_write on zabelie_event_ticket_types for all
  using (exists (
    select 1 from zabelie_events e
     where e.id = zabelie_event_ticket_types.event_id and e.organisateur = auth.uid()
  ))
  with check (exists (
    select 1 from zabelie_events e
     where e.id = zabelie_event_ticket_types.event_id and e.organisateur = auth.uid()
  ));

-- ── Post-conditions ─────────────────────────────────────────────────────────
do $$
declare v_n int;
begin
  -- Les objets sont là.
  if to_regclass('public.zabelie_events') is null
     or to_regclass('public.zabelie_event_ticket_types') is null
     or to_regclass('public.zabelie_ticket_config') is null then
    raise exception '0086 KO: une table manque apres creation';
  end if;

  -- RLS active partout — l'invariant que `rls_toutes_tables` garde par ailleurs,
  -- vérifié ici aussi : une table servie à tout le monde ne lève aucune erreur.
  select count(*) into v_n from pg_tables
   where schemaname = 'public'
     and tablename in ('zabelie_events','zabelie_event_ticket_types','zabelie_ticket_config')
     and not rowsecurity;
  if v_n > 0 then
    raise exception '0086 KO: % table(s) sans RLS', v_n;
  end if;

  -- ⛔ Le verrou tient. C'est LE contrôle de cette migration : si un prix non
  -- nul passait, la billetterie payante serait ouverte par accident.
  begin
    insert into zabelie_events (id, organisateur, titre, debut_a, fin_a)
    select '00000000-0000-0000-0000-0000000e0086', p.id, 'Sonde 0086',
           now() + interval '1 day', now() + interval '2 days'
      from profiles p limit 1;

    if exists (select 1 from zabelie_events where id = '00000000-0000-0000-0000-0000000e0086') then
      begin
        insert into zabelie_event_ticket_types (event_id, non, prix_htg, quota)
        values ('00000000-0000-0000-0000-0000000e0086', 'Sonde payante', 500, 10);
        raise exception '0086 KO: un prix NON NUL a ete accepte alors que paiement_ouvert est false — le verrou du payant ne tient pas';
      exception when check_violation then
        raise notice '0086 : verrou du payant confirme (prix non nul refuse)';
      end;
      delete from zabelie_events where id = '00000000-0000-0000-0000-0000000e0086';
    else
      -- Aucun profil en base (CI sur base vierge) : on ne peut pas éprouver le
      -- verrou par l'insertion. On le dit, plutôt que de laisser croire qu'il
      -- a été testé — `supabase/tests/evenements.test.sql` le fait, lui.
      raise notice '0086 : aucun profil disponible, verrou non eprouve ICI (il l''est dans evenements.test.sql)';
    end if;
  end;

  raise notice '0086 OK: evenements + categories + config, RLS active, aucun lien vers orders/payments/ledger';
end $$;
