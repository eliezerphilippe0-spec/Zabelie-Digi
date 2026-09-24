select zabelie_migration_garde('0118_studio_creatif.sql');

-- 0118 — Studio Créatif, Phase 3 (docs/62 §5-§7) : journal des générations
-- d'images publicitaires, quotas, et machine d'états gardée en base.
--
-- ─── FORME : UNE LIGNE FIGÉE + DES ÉVÉNEMENTS ──────────────────────────────
-- `zabelie_creative_generations` : une ligne par demande, jamais modifiée.
-- `zabelie_creative_events` : une ligne par transition, jamais modifiée.
-- L'état courant se LIT dans les événements (docs/62 §5 : append-only et
-- machine d'états ne tiennent ensemble que sous cette forme).
--
-- ─── CE QUI EST GARDÉ ICI, ET PAS DANS LA ROUTE ────────────────────────────
-- 1. L'idempotence : unique (seller_id, idempotency_key). Higgsfield n'expose
--    aucune clé (docs/65 §3.2) ; une seconde soumission paierait deux fois.
-- 2. Les quotas : vendeur ET plateforme, par jour civil haïtien, lus dans
--    `zabelie_studio_config` (règle dure 3 : jamais en dur), comptés sous
--    verrou pour qu'une rafale concurrente ne les franchisse pas.
-- 3. L'ordre des transitions : generating une fois, puis UN seul état final.
--
-- ─── CE QU'ELLE NE TOUCHE PAS ──────────────────────────────────────────────
-- Aucun lien vers commande, paiement, escrow, ledger, retrait, KYC ou
-- recharge. Aucun texte saisi par le vendeur : `prompt` est construit par le
-- Prompt Builder à partir d'ÉNUMÉRATIONS (lib/creative/prompt-builder.ts).
--
-- ─── ÉTAT ──────────────────────────────────────────────────────────────────
-- Rédigée, NON appliquée. Le Studio reste éteint (`ZABELIE_STUDIO_ENABLED`
-- absent) : aucune route ne l'écrit tant que le porteur ne l'allume pas.

-- ── Configuration (une seule ligne) ────────────────────────────────────────
create table public.zabelie_studio_config (
  id boolean primary key default true check (id),
  -- Images par vendeur et par jour civil haïtien. 3 = une campagne d'essai.
  quota_vendeur_jour integer not null default 3 check (quota_vendeur_jour between 0 and 50),
  -- Borne de DÉPENSE absolue de la plateforme, tous vendeurs confondus.
  quota_global_jour integer not null default 30 check (quota_global_jour between 0 and 1000),
  updated_at timestamptz not null default now()
);
insert into public.zabelie_studio_config (id) values (true);
alter table public.zabelie_studio_config enable row level security;
revoke all on public.zabelie_studio_config from public, anon, authenticated, service_role;
grant select on public.zabelie_studio_config to service_role;

-- ── Générations (figées) ───────────────────────────────────────────────────
create table public.zabelie_creative_generations (
  id uuid primary key default gen_random_uuid(),
  -- `cascade` : un compte ou un produit supprimé emporte ses générations.
  -- `restrict` bloquerait la suppression de compte (/api/account → 503 à
  -- vie pour un vendeur sans vente qui aurait essayé le Studio).
  seller_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  idempotency_key uuid not null,
  brief_index smallint not null check (brief_index between 0 and 15),
  format text not null check (format in ('1:1', '3:4', '9:16')),
  prompt text not null check (length(prompt) between 1 and 5000),
  rule_version text not null check (rule_version = 'R-STUDIO-01'),
  provider text not null check (provider in ('higgsfield', 'mock')),
  created_at timestamptz not null default now(),
  constraint zabelie_creative_generations_idem unique (seller_id, idempotency_key)
);
create index zabelie_creative_generations_jour on public.zabelie_creative_generations (created_at);
create index zabelie_creative_generations_vendeur on public.zabelie_creative_generations (seller_id, created_at);

alter table public.zabelie_creative_generations enable row level security;
revoke all on public.zabelie_creative_generations from public, anon, authenticated, service_role;
grant select, insert on public.zabelie_creative_generations to service_role;

create function public.zabelie_creative_quota() returns trigger
language plpgsql set search_path = public as $$
declare
  v_cfg zabelie_studio_config%rowtype;
  v_debut timestamptz := date_trunc('day', now() at time zone 'America/Port-au-Prince')
                           at time zone 'America/Port-au-Prince';
  v_vendeur integer;
  v_global integer;
begin
  -- Sérialise les réservations : deux requêtes simultanées ne lisent pas le
  -- même compte avant d'insérer.
  perform pg_advisory_xact_lock(hashtext('zabelie_creative_quota'));
  -- Un rejeu de la même clé n'est pas une nouvelle génération : la contrainte
  -- unique le refusera, et il ne doit pas être compté comme un dépassement.
  if exists (select 1 from zabelie_creative_generations
              where seller_id = new.seller_id and idempotency_key = new.idempotency_key) then
    return new;
  end if;
  select * into v_cfg from zabelie_studio_config where id;
  if not found then
    raise exception 'studio_config_absente' using errcode = 'P0001';
  end if;
  select count(*) into v_vendeur from zabelie_creative_generations
   where seller_id = new.seller_id and created_at >= v_debut;
  if v_vendeur >= v_cfg.quota_vendeur_jour then
    raise exception 'studio_quota_vendeur' using errcode = 'P0001';
  end if;
  select count(*) into v_global from zabelie_creative_generations where created_at >= v_debut;
  if v_global >= v_cfg.quota_global_jour then
    raise exception 'studio_quota_global' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.zabelie_creative_quota() from public, anon, authenticated;
create trigger zabelie_creative_quota
  before insert on public.zabelie_creative_generations
  for each row execute function public.zabelie_creative_quota();

-- ── Événements (transitions) ───────────────────────────────────────────────
create table public.zabelie_creative_events (
  id bigint generated always as identity primary key,
  generation_id uuid not null references public.zabelie_creative_generations(id) on delete cascade,
  etat text not null check (etat in ('generating', 'completed', 'failed')),
  provider_ref text check (provider_ref is null or provider_ref ~ '^[A-Za-z0-9_-]{1,128}$'),
  image_url text check (image_url is null or (image_url ~ '^https://' and length(image_url) <= 2048)),
  detail text check (detail is null or detail ~ '^[a-z0-9_]{1,40}$'),
  created_at timestamptz not null default now(),
  constraint zabelie_creative_events_coherence check (
    (etat = 'generating' and provider_ref is not null and image_url is null and detail is null)
    or (etat = 'completed' and image_url is not null and detail is null)
    or (etat = 'failed' and image_url is null and detail is not null))
);
-- Un seul `generating`, un seul état final, par génération.
create unique index zabelie_creative_events_une_fois on public.zabelie_creative_events (generation_id, etat);
create unique index zabelie_creative_events_un_final on public.zabelie_creative_events (generation_id)
  where etat in ('completed', 'failed');

alter table public.zabelie_creative_events enable row level security;
revoke all on public.zabelie_creative_events from public, anon, authenticated, service_role;
grant select, insert on public.zabelie_creative_events to service_role;

create function public.zabelie_creative_transition() returns trigger
language plpgsql set search_path = public as $$
begin
  -- requested → generating | failed ; generating → completed | failed.
  -- `completed` exige donc un `generating` antérieur ; les index uniques
  -- empêchent de rejouer une transition ou d'en ajouter une après la fin.
  if new.etat = 'completed' and not exists (
       select 1 from zabelie_creative_events where generation_id = new.generation_id and etat = 'generating') then
    raise exception 'studio_transition_interdite' using errcode = 'P0001';
  end if;
  if new.etat = 'generating' and exists (
       select 1 from zabelie_creative_events where generation_id = new.generation_id and etat in ('completed', 'failed')) then
    raise exception 'studio_transition_interdite' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.zabelie_creative_transition() from public, anon, authenticated;
create trigger zabelie_creative_transition
  before insert on public.zabelie_creative_events
  for each row execute function public.zabelie_creative_transition();

-- ── Append-only, pour les deux tables ──────────────────────────────────────
-- Aucune modification, jamais. Une suppression seulement quand le PARENT a
-- déjà disparu, c'est-à-dire par la cascade d'une suppression de compte ou de
-- produit : les déclencheurs de clé étrangère s'exécutent après la
-- suppression du parent, qui n'est donc plus visible ici.
-- Deux fonctions et non une : PL/pgSQL résout `old.<champ>` à l'exécution
-- même derrière un `and` faux, et chaque table a ses propres parents.
create function public.zabelie_creative_generations_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' and (
       not exists (select 1 from profiles where id = old.seller_id)
    or not exists (select 1 from products where id = old.product_id)) then
    return old;
  end if;
  raise exception 'zabelie_creative_generations est append-only' using errcode = '42501';
end $$;
create function public.zabelie_creative_events_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' and not exists (
       select 1 from zabelie_creative_generations where id = old.generation_id) then
    return old;
  end if;
  raise exception 'zabelie_creative_events est append-only' using errcode = '42501';
end $$;
revoke all on function public.zabelie_creative_generations_immutable() from public, anon, authenticated;
revoke all on function public.zabelie_creative_events_immutable() from public, anon, authenticated;
create trigger zabelie_creative_generations_immutable
  before update or delete on public.zabelie_creative_generations
  for each row execute function public.zabelie_creative_generations_immutable();
create trigger zabelie_creative_generations_no_truncate
  before truncate on public.zabelie_creative_generations
  for each statement execute function public.zabelie_creative_generations_immutable();
create trigger zabelie_creative_events_immutable
  before update or delete on public.zabelie_creative_events
  for each row execute function public.zabelie_creative_events_immutable();
create trigger zabelie_creative_events_no_truncate
  before truncate on public.zabelie_creative_events
  for each statement execute function public.zabelie_creative_events_immutable();
