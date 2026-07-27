-- ============================================================================
-- 0045 — Le profil naît en base, plus dans le navigateur
-- ============================================================================
-- ⚠️ NON APPLIQUÉE. À exécuter par le porteur (docs/14).
--
-- LE TROU
-- -------
-- `profiles` n'était créé qu'à un seul endroit : `components/connexion-form.tsx`,
-- côté client, et UNIQUEMENT dans la branche où `signUp` renvoie une session —
-- c'est-à-dire uniquement si la confirmation par e-mail est DÉSACTIVÉE. Aucun
-- déclencheur sur `auth.users` ne prenait le relais. Conséquences :
--
--   * confirmation e-mail ACTIVE  → aucun acheteur n'obtient jamais de profil ;
--   * confirmation DÉSACTIVÉE     → l'insert client peut quand même échouer
--                                   (connexion coupée après `signUp`, onglet
--                                   fermé) et rien ne le rejoue.
--
-- Le second cas est le plus vicieux : plus rare, et impossible à reproduire.
--
-- FORME DE L'ÉCHEC EN AVAL — vérifiée dans le code, pas supposée
-- --------------------------------------------------------------
-- `orders.buyer_id` référence `profiles(id)` (0001). Un acheteur sans profil
-- ne crée donc AUCUNE commande : l'insert échoue en violation de clé
-- étrangère, `/api/checkout` renvoie « Création commande échouée » (500).
-- **Rien n'est écrit** — ni commande, ni paiement, ni ligne de grand livre.
-- C'est la branche bénigne pour le registre, et la pire pour l'acheteur :
-- blocage total, message opaque, à la seconde où il allait payer.
--
-- POURQUOI EN BASE ET PAS CÔTÉ CLIENT
-- ------------------------------------
-- Un profil est une conséquence de l'existence d'un compte, pas une action de
-- l'utilisateur. Le navigateur peut disparaître entre les deux ; la base, non.
-- Aucune colonne privilégiée n'est en jeu : `role`, `tier` et les champs de
-- suspension sont déjà gelés à l'insertion par `protect_profile_privileges`
-- (0015/0017). Ce déclencheur ne les fixe pas — il laisse les valeurs par
-- défaut s'appliquer (`role='buyer'`, `tier='standard'`).
-- ============================================================================

-- ─────────────────────────── 1. La fonction ─────────────────────────────────
-- `security definer` : le déclencheur s'exécute dans le contexte de
-- `supabase_auth_admin`, qui n'écrit pas dans `public` par défaut.
create or replace function zabelie_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- `on conflict do nothing` : l'insert client historique existe encore (il
  -- reste le seul chemin tant que cette migration n'est pas appliquée). Les
  -- deux doivent pouvoir coexister sans qu'aucun ne casse l'autre.
  insert into profiles (id, display_name)
  values (
    new.id,
    coalesce(
      -- Nom saisi au formulaire, transmis via les métadonnées de `signUp`.
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      -- Dernier recours : `display_name` est NOT NULL. Kreyòl, comme le reste
      -- de ce qu'un utilisateur peut lire.
      'Kont'
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function zabelie_handle_new_user() is
  'Crée la ligne profiles d''un nouveau compte. Le profil est une conséquence '
  'de l''existence du compte : il ne peut pas dépendre d''un navigateur encore '
  'ouvert. Voir 0045.';

drop trigger if exists trg_zabelie_profile_on_signup on auth.users;
create trigger trg_zabelie_profile_on_signup
  after insert on auth.users
  for each row execute function zabelie_handle_new_user();

-- ─────────────────────── 2. Rattrapage des comptes existants ────────────────
-- Idempotent : les comptes déjà pourvus ne sont pas touchés. Sur la production
-- du 2026-07-27 (1 compte, avec profil), attendu : 0 ligne.
insert into profiles (id, display_name)
select
  u.id,
  coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'Kont'
  )
from auth.users u
left join profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

do $$
declare v_orphelins integer;
begin
  select count(*) into v_orphelins
    from auth.users u left join profiles p on p.id = u.id
   where p.id is null;
  -- Journalisé même à zéro : sinon « le rattrapage n'a pas tourné » et « il a
  -- tourné, rien à rattraper » produisent le même silence (CLAUDE.md).
  raise notice '0045 — comptes sans profil après rattrapage : %', v_orphelins;
end $$;
