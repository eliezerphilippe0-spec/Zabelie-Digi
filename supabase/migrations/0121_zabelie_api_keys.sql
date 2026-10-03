select zabelie_migration_garde('0121_zabelie_api_keys.sql');

-- 0121 — Clés d'API vendeur (« brancher son site », modèle Chariow).
--
-- ─── POURQUOI ──────────────────────────────────────────────────────────────
-- Instruction directe du porteur, 2026-10-03 : une API pour que les vendeurs
-- branchent leurs sites. Elle va CONTRE `docs/44` §4 (« pas de clés tierces
-- tant qu'aucun partenaire »), et le conflit a été signalé avant d'écrire :
-- réponse « Vas-y ». Règle zéro de `CLAUDE.md`.
--
-- ─── CE QUE LA TABLE GARDE, ET CE QU'ELLE NE GARDE JAMAIS ──────────────────
-- * JAMAIS la clé : seulement son empreinte SHA-256 (hex, 64 caractères).
--   La clé fait 256 bits d'aléa : l'empreinte suffit, sans sel ni étirement —
--   ce n'est pas un mot de passe, on ne peut pas la deviner.
-- * le PRÉFIXE affiché (`zb_live_` + 6 caractères) pour que le vendeur
--   reconnaisse sa clé dans la liste.
-- * des PORTÉES fermées (énumération en contrainte) ;
-- * la révocation est une DATE, jamais une suppression : l'historique
--   d'usage reste lisible.
--
-- ─── ACCÈS ─────────────────────────────────────────────────────────────────
-- RLS dès la création. Le vendeur LIT ses clés ; il n'écrit rien en direct.
-- Création et révocation passent par une route serveur (service role) qui a
-- vérifié la session — le même schéma que les retraits. `anon` : rien.
--
-- ─── PLAFOND ───────────────────────────────────────────────────────────────
-- 5 clés ACTIVES par vendeur, imposé en base (trigger) et pas seulement dans
-- la route : deux créations simultanées ne le franchissent pas, le verrou
-- consultatif par vendeur sérialise le comptage.

create table zabelie_api_keys (
  id           uuid primary key default gen_random_uuid(),
  seller_id    uuid not null references profiles(id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 60),
  prefix       text not null check (prefix ~ '^zb_live_[A-Za-z0-9_-]{6}$'),
  key_hash     text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  scopes       text[] not null
               default array['products:read', 'sales:read', 'links:write']
               check (cardinality(scopes) between 1 and 4
                      and scopes <@ array['products:read', 'sales:read', 'links:write', 'webhooks:manage']),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

create index zabelie_api_keys_seller_idx on zabelie_api_keys (seller_id, created_at desc);

alter table zabelie_api_keys enable row level security;

create policy zabelie_api_keys_owner_select on zabelie_api_keys
  for select to authenticated
  using (seller_id = auth.uid());

revoke all on zabelie_api_keys from anon;
revoke insert, update, delete on zabelie_api_keys from authenticated;

-- Plafond de clés actives + immuabilité de ce qui identifie la clé.
create or replace function zabelie_api_keys_garde()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_actives integer;
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('zabelie_api_keys:' || new.seller_id::text));
    select count(*) into v_actives
      from zabelie_api_keys
     where seller_id = new.seller_id and revoked_at is null;
    if v_actives >= 5 then
      raise exception 'ZB121 : 5 clés actives au plus par vendeur'
        using errcode = 'ZB121';
    end if;
    return new;
  end if;

  -- UPDATE : seules `last_used_at` et la révocation bougent, et une clé
  -- révoquée ne se réactive pas.
  if new.seller_id is distinct from old.seller_id
     or new.key_hash is distinct from old.key_hash
     or new.prefix is distinct from old.prefix
     or new.scopes is distinct from old.scopes
     or new.created_at is distinct from old.created_at then
    raise exception 'ZB121 : une clé ne change pas d''identité ni de portée'
      using errcode = 'ZB121';
  end if;
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'ZB121 : une clé révoquée le reste'
      using errcode = 'ZB121';
  end if;
  return new;
end;
$$;

create trigger zabelie_api_keys_garde
  before insert or update on zabelie_api_keys
  for each row execute function zabelie_api_keys_garde();

revoke all on function zabelie_api_keys_garde() from public, anon, authenticated;
