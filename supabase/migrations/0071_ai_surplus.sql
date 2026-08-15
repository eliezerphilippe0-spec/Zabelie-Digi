select zabelie_migration_garde('0071_ai_surplus.sql');

-- ============================================================================
-- 0071 — SURPLUS IA : configuration et registre du « au-delà payant »
-- ============================================================================
-- Décisions porteur du 2026-08-15 (docs/34) : 50 suggestions/jour gratuites,
-- 5 HTG la suggestion au-delà, déduction au prochain règlement vendeur.
--
-- Deux objets :
--   1. `zabelie_ai_config` — les paramètres commerciaux (règle dure n°3 :
--      en table, jamais en dur). Ligne unique.
--   2. `zabelie_ai_surplus` — UNE ligne par suggestion facturée, au prix du
--      moment. Append-only (trigger ZB071) ; seule mutation permise : le
--      règlement (settled_at/settlement_ref, null → valeur, une fois).
--
-- ⛔ ORDRE D'APPLICATION (docs/34 §2) : cette migration ne s'applique qu'après
-- la fusion de la tranche 2 (déduction au règlement). Tant qu'elle n'est pas
-- appliquée, le code se comporte comme avant elle : blocage gratuit au quota,
-- aucune facturation — c'est le repli mesuré de `lireConfigSurplus` → null.
-- ============================================================================

-- ── 1. Configuration (ligne unique) ─────────────────────────────────────────
create table zabelie_ai_config (
  id                 boolean primary key default true check (id),
  quota_gratuit_jour integer not null default 50 check (quota_gratuit_jour >= 0),
  prix_surplus_htg   integer not null default 5  check (prix_surplus_htg >= 0),
  -- Plafond dur du jour, payant compris — borne d'abus ET de dépense.
  plafond_jour       integer not null default 200,
  updated_at         timestamptz not null default now(),
  constraint zabelie_ai_config_plafond check (plafond_jour >= quota_gratuit_jour)
);

insert into zabelie_ai_config default values;

comment on table zabelie_ai_config is
  'Paramètres commerciaux de l''aide IA (docs/34) : quota gratuit/jour, prix du surplus (HTG entiers), plafond dur. Ligne unique, service-role uniquement — le client n''a rien à y lire, la route sert le prix dans sa réponse 402.';

-- Service-role uniquement : RLS active, aucune policy.
alter table zabelie_ai_config enable row level security;

-- ── 2. Registre du surplus ──────────────────────────────────────────────────
create table zabelie_ai_surplus (
  id             bigint generated always as identity primary key,
  seller_id      uuid not null references profiles(id),
  -- Le prix DU MOMENT : un UPDATE du prix en config ne réécrit pas le passé.
  prix_htg       integer not null check (prix_htg >= 0),
  created_at     timestamptz not null default now(),
  -- Tranche 2 : posés au règlement, une seule fois, ensemble.
  settled_at     timestamptz,
  settlement_ref text,
  constraint zabelie_ai_surplus_reglement
    check ((settled_at is null) = (settlement_ref is null))
);

-- La tranche 2 lira « ce que ce vendeur doit » : lignes non réglées.
create index zabelie_ai_surplus_du_idx
  on zabelie_ai_surplus (seller_id) where settled_at is null;

comment on table zabelie_ai_surplus is
  'Une ligne par suggestion IA facturée au-delà du quota (docs/34). Append-only par trigger ZB071 ; seule mutation permise : le règlement (settled_at/settlement_ref, null → valeur). Écrite par service-role AVANT la génération — jamais de génération non facturée.';

-- ── 3. Garde ZB071 : append-only, règlement une seule fois ──────────────────
create function zabelie_ai_surplus_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'ZB071: registre de surplus append-only — suppression interdite';
  end if;
  -- UPDATE : seul le règlement se pose, depuis l'état non réglé, une fois.
  if new.seller_id <> old.seller_id
     or new.prix_htg <> old.prix_htg
     or new.created_at <> old.created_at
     or new.id <> old.id then
    raise exception 'ZB071: une ligne de surplus ne se réécrit pas';
  end if;
  if old.settled_at is not null then
    raise exception 'ZB071: règlement déjà posé — définitif';
  end if;
  if new.settled_at is null then
    raise exception 'ZB071: seul le règlement (null → valeur) est une mutation permise';
  end if;
  return new;
end;
$$;

create trigger zabelie_ai_surplus_guard_trg
  before update or delete on zabelie_ai_surplus
  for each row execute function zabelie_ai_surplus_guard();

-- Le vendeur LIT ses propres lignes (transparence de ce qu'il doit) ;
-- aucune écriture client — tout passe par service-role.
alter table zabelie_ai_surplus enable row level security;

create policy zabelie_ai_surplus_own_read on zabelie_ai_surplus
  for select using (auth.uid() = seller_id);

-- ── 4. Post-conditions ──────────────────────────────────────────────────────
do $$
declare
  v_quota integer;
  v_prix  integer;
begin
  select quota_gratuit_jour, prix_surplus_htg into v_quota, v_prix
    from zabelie_ai_config;
  if v_quota is distinct from 50 or v_prix is distinct from 5 then
    raise exception '0071: valeurs par défaut inattendues (quota=%, prix=%)', v_quota, v_prix;
  end if;
  if not exists (
    select 1 from pg_trigger
     where tgname = 'zabelie_ai_surplus_guard_trg'
       and tgrelid = 'zabelie_ai_surplus'::regclass
  ) then
    raise exception '0071: trigger ZB071 absent';
  end if;
  if not exists (
    select 1 from pg_policies
     where tablename = 'zabelie_ai_surplus'
       and policyname = 'zabelie_ai_surplus_own_read'
  ) then
    raise exception '0071: policy de lecture vendeur absente';
  end if;
end $$;
