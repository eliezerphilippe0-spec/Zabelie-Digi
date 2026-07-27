-- ============================================================================
-- 0046 — Attestation vendeur : acceptation de la politique produits interdits
-- ============================================================================
-- ⚠️ NON APPLIQUÉE. À exécuter par le porteur (docs/14).
--
-- POURQUOI CETTE TABLE
-- --------------------
-- La politique (`/produits-interdits`, R1) est plus stricte que la loi. Ce qui
-- la rend opposable n'est donc pas un texte officiel : c'est le fait que le
-- vendeur l'a acceptée, et qu'on sait DANS QUELLE VERSION. Sans cette trace,
-- une suspension repose sur « la règle existait quelque part sur le site ».
--
-- CE QU'ON ENREGISTRE, ET RIEN D'AUTRE
-- -------------------------------------
-- `user_id`, `policy_version`, `accepted_at`. **Pas d'adresse IP, pas d'agent
-- utilisateur.** Ils ne servent qu'à une chose — contester la parole du
-- vendeur — et ils transforment une attestation en collecte. La règle du
-- dépôt sur les identifiants de personne vaut ici aussi.
--
-- APPEND-ONLY
-- -----------
-- Une nouvelle version de politique produit une NOUVELLE ligne. Jamais une
-- mise à jour : réécrire une acceptation, c'est réécrire ce que le vendeur a
-- effectivement lu. Même discipline que le grand livre (`0025`).
--
-- UNICITÉ (user_id, policy_version)
-- ----------------------------------
-- Le vendeur coche à CHAQUE mise en ligne, mais une version acceptée l'est une
-- fois. La contrainte rend le ré-enregistrement idempotent : dix fiches ne
-- produisent pas dix lignes, et `accepted_at` garde la PREMIÈRE acceptation —
-- celle qui compte, pas la plus récente.
-- ============================================================================

create table zabelie_policy_acceptances (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles (id) on delete cascade,
  -- Version telle que servie par `lib/policy.ts` (POLICY_VERSION). Jamais
  -- fournie par le client : la page et l'enregistrement doivent parler de la
  -- même version, sinon l'attestation ne prouve rien.
  policy_version text not null check (policy_version ~ '^v[0-9]+$'),
  accepted_at    timestamptz not null default now(),
  unique (user_id, policy_version)
);

comment on table zabelie_policy_acceptances is
  'Acceptation de la politique produits interdits, une ligne par (vendeur, '
  'version). Append-only. Aucune donnée de traçage : ni IP, ni user-agent.';

create index zabelie_policy_acceptances_user_idx
  on zabelie_policy_acceptances (user_id);

-- ─────────────────────────── Append-only ────────────────────────────────────
create or replace function zabelie_policy_acceptances_append_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception
    'zabelie_policy_acceptances est append-only : ni UPDATE ni DELETE. '
    'Une nouvelle version de politique s''enregistre par une NOUVELLE ligne.'
    using errcode = 'ZB046';
end;
$$;

drop trigger if exists trg_zabelie_policy_acceptances_append_only
  on zabelie_policy_acceptances;
create trigger trg_zabelie_policy_acceptances_append_only
  before update or delete on zabelie_policy_acceptances
  for each row execute function zabelie_policy_acceptances_append_only();

-- ─────────────────────────────── RLS ────────────────────────────────────────
-- Dès la création (règle du dépôt). Le vendeur LIT sa propre attestation —
-- il doit pouvoir vérifier ce qu'on lui oppose. Il ne l'écrit pas : c'est le
-- serveur qui fixe la version, sinon le client choisirait celle qu'il a
-- « acceptée ».
alter table zabelie_policy_acceptances enable row level security;
revoke all on zabelie_policy_acceptances from anon, authenticated;
grant select (id, user_id, policy_version, accepted_at)
  on zabelie_policy_acceptances to authenticated;

drop policy if exists "policy_acceptances_self_read" on zabelie_policy_acceptances;
create policy "policy_acceptances_self_read"
  on zabelie_policy_acceptances for select
  using (auth.uid() = user_id);

-- ───────────────────── Enregistrement (idempotent) ──────────────────────────
-- Appelée par les deux routes de création, AVANT d'écrire le produit : une
-- attestation sans fiche est sans conséquence, une fiche sans attestation est
-- exactement le trou qu'on ferme.
--
-- `security definer` + `search_path` épinglé + révoquée de anon/authenticated :
-- seul le serveur l'appelle, avec la version qu'il tient de `lib/policy.ts`.
create or replace function zabelie_record_policy_acceptance(
  p_user_id uuid,
  p_version text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into zabelie_policy_acceptances (user_id, policy_version)
  values (p_user_id, p_version)
  on conflict (user_id, policy_version) do nothing;
end;
$$;

revoke all on function zabelie_record_policy_acceptance(uuid, text)
  from public, anon, authenticated;

comment on function zabelie_record_policy_acceptance(uuid, text) is
  'Enregistre l''acceptation d''une version de politique. Idempotente : '
  'ré-accepter la même version ne crée pas de ligne et ne touche pas '
  'accepted_at, qui garde la PREMIÈRE acceptation. Voir 0046.';
