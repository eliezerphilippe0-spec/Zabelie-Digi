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
--
-- TOTALITÉ — obligation, pas confort
-- -----------------------------------
-- Le déclencheur s'exécute DANS la transaction d'`auth.users` : toute
-- exception qu'il lève fait échouer l'inscription entière. On passerait d'un
-- orphelin silencieux à une porte fermée. Le sens d'échec est le bon, mais il
-- impose que la fonction soit **totale**. Ce qui la rend totale, vérifié sur
-- le schéma réel du 2026-07-27 :
--   * `display_name` est un `text` NOT NULL sans contrainte d'unicité ni
--     `check` — `zabelie_safe_display_name` rend toujours une chaîne non vide ;
--   * les deux seuls `check` de la table portent sur `country_code` et
--     `region_code`, que ce déclencheur n'écrit pas ;
--   * `zabelie1_user_id` (unique) a été supprimée en `0007` ;
--   * `on conflict (id) do nothing` couvre la course avec l'insert client ;
--   * la table n'est pas en FORCE ROW LEVEL SECURITY, donc son propriétaire
--     écrit sans être filtré par la RLS.
-- Toute colonne NOT NULL, unique ou contrainte ajoutée plus tard à `profiles`
-- devra être revérifiée ici : elle pourrait fermer les inscriptions.
-- ============================================================================

-- ────────────────── 1. Le nom affiché — entrée hostile par nature ───────────
-- `raw_user_meta_data` est écrit par le NAVIGATEUR à l'inscription : aucune
-- validation serveur ne s'applique en amont. Trois risques, dans l'ordre de
-- ce qu'ils coûtent :
--
--   1. **Usurpation de la plateforme.** Un compte nommé « Support Zabelie »
--      qui écrit à des vendeurs est le scénario le plus cher sur un marché où
--      la confiance passe par WhatsApp. → repli sur l'e-mail, jamais un rejet
--      (le repli, jamais le rejet : voir « totalité » ci-dessous).
--   2. **Longueur.** `display_name` est un `text` non borné : sans coupe, on
--      accepte des mégaoctets dans une colonne indexée (trigram, `0013`).
--   3. **Caractères de contrôle**, qui cassent l'affichage et les e-mails.
--
-- Fonction PURE et `immutable` : testable directement, sans créer de compte.
create or replace function zabelie_safe_display_name(
  p_raw   text,
  p_email text
)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_nom text;
begin
  -- (a) Nom proposé : contrôles retirés, espaces réduits, coupé à 60.
  v_nom := regexp_replace(coalesce(p_raw, ''), '[[:cntrl:]]', '', 'g');
  v_nom := btrim(regexp_replace(v_nom, '\s+', ' ', 'g'));
  v_nom := nullif(left(v_nom, 60), '');

  -- (b) Usurpation de marque. La comparaison se fait sur une forme normalisée
  --     (minuscules, tout ce qui n'est pas alphanumérique retiré) pour que
  --     « Z-a-b-e-l-i-e », « ZABELIE  SUPPORT » et « zabely » tombent dans le
  --     même filet. ⚠️ La LISTE et la sanction (repli ici, ou refus à
  --     l'inscription) sont une décision porteur — cf. OPS_TODO.
  if v_nom is not null
     and regexp_replace(lower(v_nom), '[^a-z0-9]', '', 'g') ~ '(zabelie|zabely)'
  then
    v_nom := null;
  end if;

  -- (c) Repli sur l'e-mail — soumis au MÊME filtre : « zabelie@… » donnerait
  --     sinon exactement le nom qu'on vient de refuser.
  if v_nom is null then
    v_nom := nullif(left(split_part(coalesce(p_email, ''), '@', 1), 60), '');
    if v_nom is not null
       and regexp_replace(lower(v_nom), '[^a-z0-9]', '', 'g') ~ '(zabelie|zabely)'
    then
      v_nom := null;
    end if;
  end if;

  -- (d) Dernier recours : `display_name` est NOT NULL. Kreyòl, comme tout ce
  --     qu'un utilisateur peut lire.
  return coalesce(v_nom, 'Kont');
end;
$$;

comment on function zabelie_safe_display_name(text, text) is
  'Nom affiché sûr à partir d''une entrée contrôlée par le navigateur : coupe '
  'à 60, retire les caractères de contrôle, refuse les variantes du nom de la '
  'marque (repli e-mail puis « Kont »). Voir 0045.';

-- ─────────────────────────── 2. Le déclencheur ──────────────────────────────
-- `security definer` : le déclencheur s'exécute dans le contexte de
-- `supabase_auth_admin`, qui n'écrit pas dans `public` par défaut.
create or replace function zabelie_handle_new_user()
returns trigger
language plpgsql
security definer
-- `pg_temp` en DERNIER : sans ça il est implicitement cherché en PREMIER, et
-- une table temporaire nommée `profiles` détournerait l'écriture d'une
-- fonction `security definer`. C'est la classe de faille relevée à
-- 43 exemplaires par l'audit — le coût de s'en prémunir est de deux mots.
set search_path = public, pg_temp
as $$
begin
  -- `on conflict do nothing` : l'insert client historique existe encore (il
  -- reste le seul chemin tant que cette migration n'est pas appliquée). Les
  -- deux doivent pouvoir coexister sans qu'aucun ne casse l'autre.
  insert into profiles (id, display_name)
  values (
    new.id,
    zabelie_safe_display_name(
      new.raw_user_meta_data ->> 'display_name',
      new.email
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

-- ─────────────────────── 3. Rattrapage des comptes existants ────────────────
-- Idempotent : les comptes déjà pourvus ne sont pas touchés. Sur la production
-- du 2026-07-27 (1 compte, avec profil), attendu : 0 ligne.
insert into profiles (id, display_name)
select
  u.id,
  zabelie_safe_display_name(u.raw_user_meta_data ->> 'display_name', u.email)
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
