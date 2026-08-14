select zabelie_migration_garde('0070_zone_requests.sql');

-- ============================================================================
-- 0070 — DEMANDES D'AJOUT DE QUARTIER : la modération de l'arbitrage Z-C
-- ============================================================================
-- PR-Z4 de `docs/33` §4, dernier volet du chantier zones. Le seed de `0069`
-- couvre 5 katye du Cap ; le reste du pays s'ajoute À LA DEMANDE — et la
-- demande passe par un HUMAIN (arbitrage Z-C) : l'auto-création produirait
-- des doublons de graphies (Kapayisyen / Cap-Haïtien / Okap), exactement le
-- problème que le seed a évité en restant court.
--
-- Le flux : un vendeur dont le katye manque le PROPOSE depuis son profil
-- (rattaché à une komin existante) ; l'admin ACCEPTE (le katye naît, la
-- demande garde la référence) ou REFUSE (avec note). Chaque décision est
-- journalisée dans `zabelie_admin_actions` (0055) par la route — cette
-- migration ne journalise pas elle-même : la table d'audit trace QUI a
-- décidé, la demande trace CE QUI a été décidé.
--
-- Ce que cette table n'est PAS : un canal libre vers le catalogue des zones.
-- Les clients n'ont que INSERT (leur propre demande) et SELECT (les leurs).
-- Les transitions d'état passent par service-role, et le trigger de décision
-- les garde même pour lui — `pending` est le seul état de départ, une
-- décision est finale, et le contenu d'une demande ne se réécrit pas.
-- ============================================================================

-- ── 1. La table ─────────────────────────────────────────────────────────────
create table zabelie_zone_requests (
  id           uuid primary key default gen_random_uuid(),
  requester    uuid not null references profiles(id) on delete cascade,
  komin_id     uuid not null references zabelie_zones(id),
  nom_propose  text not null
               check (char_length(btrim(nom_propose)) between 2 and 80),
  status       text not null default 'pending'
               check (status in ('pending', 'accepted', 'rejected')),
  note_admin   text,
  -- Le katye né d'une acceptation — la demande garde la référence, pour que
  -- « d'où vient cette zone ? » ait une réponse au registre.
  zone_creee   uuid references zabelie_zones(id),
  created_at   timestamptz not null default now(),
  decided_at   timestamptz
);

-- Un même nom (normalisé) ne s'empile pas en attente sous la même komin —
-- la modération n'a pas à trancher deux fois la même graphie.
create unique index zabelie_zone_requests_pending_uniq
  on zabelie_zone_requests (komin_id, lower(btrim(nom_propose)))
  where status = 'pending';

create index zabelie_zone_requests_status_idx
  on zabelie_zone_requests (status, created_at);

comment on table zabelie_zone_requests is
  'Demandes d''ajout de katye, modérées (Z-C, docs/33). Insert/select par le demandeur sous RLS ; décisions par service-role, gardées par trigger ZB070 ; chaque décision journalisée dans zabelie_admin_actions par la route.';

-- ── 2. Garde d'entrée (ZB070) : la cible est une KOMIN ──────────────────────
-- Lu sous le rôle appelant : pour un client, la RLS des zones masque les
-- inactives — une komin fermée est donc « introuvable », et c'est voulu :
-- une zone fermée ne prend pas de demandes.
create function zabelie_zone_requests_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_level text;
begin
  select level into v_level from zabelie_zones where id = new.komin_id;
  if v_level is null then
    raise exception 'ZB070 : komin introuvable ou fermée';
  end if;
  if v_level <> 'komin' then
    raise exception 'ZB070 : une demande de katye se rattache à une komin, pas à %', v_level;
  end if;
  return new;
end;
$$;
revoke all on function zabelie_zone_requests_guard() from public, anon, authenticated;

create trigger zabelie_zone_requests_entree
  before insert on zabelie_zone_requests
  for each row execute function zabelie_zone_requests_guard();

-- ── 3. Garde de décision (ZB070) : pending → finale, une fois, sans réécriture
create function zabelie_zone_requests_decision_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status <> 'pending' then
    raise exception 'ZB070 : la demande est déjà décidée (%) — une décision est finale', old.status;
  end if;
  if new.status not in ('accepted', 'rejected') then
    raise exception 'ZB070 : une mise à jour est une décision — accepted ou rejected';
  end if;
  if new.requester <> old.requester
     or new.komin_id <> old.komin_id
     or new.nom_propose <> old.nom_propose
     or new.created_at <> old.created_at then
    raise exception 'ZB070 : le contenu d''une demande ne se réécrit pas — seule la décision change';
  end if;
  if new.decided_at is null then
    new.decided_at := now();
  end if;
  return new;
end;
$$;
revoke all on function zabelie_zone_requests_decision_guard()
  from public, anon, authenticated;

create trigger zabelie_zone_requests_decision
  before update on zabelie_zone_requests
  for each row execute function zabelie_zone_requests_decision_guard();

-- ── 4. RLS ──────────────────────────────────────────────────────────────────
alter table zabelie_zone_requests enable row level security;

create policy zabelie_zone_requests_insert_own on zabelie_zone_requests
  for insert with check (requester = auth.uid());
create policy zabelie_zone_requests_read_own on zabelie_zone_requests
  for select using (requester = auth.uid());

grant select, insert on zabelie_zone_requests to authenticated;
revoke update, delete on zabelie_zone_requests from anon, authenticated;
revoke all on zabelie_zone_requests from anon;

-- ── 5. POST-CONDITIONS ──────────────────────────────────────────────────────
do $$
declare
  v_n integer;
begin
  if to_regclass('public.zabelie_zone_requests') is null then
    raise exception 'ZB070 : table absente';
  end if;
  select count(*) into v_n from pg_trigger
   where tgname in ('zabelie_zone_requests_entree', 'zabelie_zone_requests_decision');
  if v_n <> 2 then
    raise exception 'ZB070 : % trigger(s) au lieu de 2', v_n;
  end if;
  select count(*) into v_n from pg_policies
   where tablename = 'zabelie_zone_requests';
  if v_n <> 2 then
    raise exception 'ZB070 : % policy(ies) au lieu de 2', v_n;
  end if;
  if not exists (select 1 from pg_indexes
                  where indexname = 'zabelie_zone_requests_pending_uniq') then
    raise exception 'ZB070 : index anti-doublon en attente absent';
  end if;
end $$;
