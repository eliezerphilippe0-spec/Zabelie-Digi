-- ============================================================================
-- 0045 — Le profil naît en base, plus dans le navigateur
-- ============================================================================
-- ⚠️ ÉTAT : appliquée le 2026-07-31 D'APRÈS LE JOURNAL DE SESSION.
-- **NON CONFIRMÉ CONTRE LA BASE** — la session qui écrit cette ligne n'a aucun
-- accès Postgres. Ce commentaire n'est donc PAS une source de vérité : il dit
-- ce qu'on croit savoir, et d'où on le tient.
--
-- Pourquoi il ne peut pas en être une : un en-tête est écrit une fois et jamais
-- revérifié. Il portait « NON APPLIQUÉE » alors que `0049` disait, deux fichiers
-- plus loin, « appliquée le 2026-07-31, juste après `0045` ». Le dépôt s'est
-- contredit pendant deux jours sans que rien ne le signale.
--
-- LA SOURCE DE VÉRITÉ EST LE REGISTRE (`0041`) — et le registre lui-même peut
-- diverger du réel, c'est tout l'objet de `0048`. VÉRIFIER LES DEUX avant
-- d'exécuter quoi que ce soit :
--
--   select * from zabelie_schema_migrations
--    where filename = '0045_profile_on_signup.sql';   -- ce qui est DÉCLARÉ
--   select tgname from pg_trigger
--    where tgname = 'trg_zabelie_profile_on_signup';  -- ce qui EXISTE
--
-- SI ELLE EST DÉJÀ APPLIQUÉE ET QU'ON LA REJOUE : sans dommage.
-- Tout y est `create or replace` / `drop trigger if exists`, et le rattrapage
-- final vers `profiles` porte `on conflict (id) do nothing`. Vérifié instruction
-- par instruction, pas supposé de la forme du fichier.
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
-- ⚠️ CE FILTRE NE PEUT PAS VIVRE AU SEUL MOMENT DE L'INSCRIPTION.
-- `profiles_self_update` (0015) autorise chaque utilisateur à écrire sa propre
-- ligne, et `POST /api/profile` l'expose avec un simple `trim()`. Un compte
-- s'inscrirait donc sous n'importe quel nom, puis se renommerait d'un `update`
-- que le déclencheur sur `auth.users` ne voit jamais. Le nettoyage vit donc
-- sur `profiles`, en `before insert or update` — toutes les voies d'écriture,
-- présentes et futures.
--
-- Fonctions PURES et `immutable` : testables directement, sans créer de compte.

-- Rend NULL si rien d'acceptable ne subsiste. C'est l'appelant qui décide du
-- repli — un `update` doit garder l'ancien nom, une insertion n'a rien à
-- garder.
create or replace function zabelie_clean_display_name(p_raw text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_nom text;
begin
  v_nom := regexp_replace(coalesce(p_raw, ''), '[[:cntrl:]]', '', 'g');
  v_nom := btrim(regexp_replace(v_nom, '\s+', ' ', 'g'));
  v_nom := nullif(left(v_nom, 60), '');

  -- Usurpation de la plateforme, sur forme normalisée (minuscules, non
  -- alphanumériques retirés) : « Z-a-b-e-l-i-e » tombe dans le même filet.
  --
  -- ⚠️ CE QUE CE FILTRE EST, ET CE QU'IL N'EST PAS. C'est un ralentisseur, pas
  -- une serrure : `Zabelye`, un « I » majuscule à la place du « l », une
  -- lettre cyrillique — tout passe. Allonger la liste ne changerait pas sa
  -- nature. La mesure d'exposition (2026-07-27) dit pourquoi ça suffit
  -- aujourd'hui : `display_name` n'apparaît sur AUCUNE page publique, les
  -- e-mails vendeur ne portent pas le nom de l'acheteur, et il n'existe
  -- aucune messagerie — donc aucun chemin par lequel un compte renommé
  -- atteint un autre utilisateur. Le jour où ce nom s'affiche sur une fiche
  -- boutique ou dans un message, il faudra un MARQUEUR de compte officiel,
  -- pas une liste plus longue. → OPS_TODO.
  if v_nom is not null
     and regexp_replace(lower(v_nom), '[^a-z0-9]', '', 'g') ~ '(zabelie|zabely)'
  then
    return null;
  end if;

  return v_nom;
end;
$$;

comment on function zabelie_clean_display_name(text) is
  'Nom affiché nettoyé, ou NULL si rien d''acceptable ne subsiste (vide, '
  'usurpation de marque). Le repli appartient à l''appelant. Voir 0045.';

-- Enrobage pour l'INSCRIPTION : repli sur l'e-mail, puis sur « Kont ».
create or replace function zabelie_safe_display_name(
  p_raw   text,
  p_email text
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  -- Le repli e-mail subit le MÊME filtre, sinon « zabelie@… » rouvrirait la
  -- porte qu'on vient de fermer.
  select coalesce(
    zabelie_clean_display_name(p_raw),
    zabelie_clean_display_name(split_part(coalesce(p_email, ''), '@', 1)),
    -- `display_name` est NOT NULL. Kreyòl, comme tout ce qu'un utilisateur lit.
    'Kont'
  );
$$;

comment on function zabelie_safe_display_name(text, text) is
  'Nom affiché sûr à partir d''une entrée contrôlée par le navigateur : coupe '
  'à 60, retire les caractères de contrôle, refuse les variantes du nom de la '
  'marque (repli e-mail puis « Kont »). Voir 0045.';

-- ───────────── 2. Le filtre, sur TOUTES les voies d'écriture ────────────────
create or replace function zabelie_sanitize_profile_name()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Aucune exemption de rôle, `service_role` compris. Une exemption serait
  -- une porte dérobée pour toute route qui écrit avec la clé de service.
  --
  -- ⚠️ CONSÉQUENCE ASSUMÉE, ET ELLE VISE AUSSI LA PLATEFORME : plus personne
  -- ne peut créer un compte affiché « Zabelie » ou « Support Zabelie » — pas
  -- même le porteur, pas même en back-office. Ce n'est pas un effet de bord,
  -- c'est la position : **un compte officiel se signale par un marqueur, pas
  -- par son nom**. Un nom peut se copier ; une colonne vérifiée, non.
  --
  -- Le jour où un compte support est réellement nécessaire, la voie N'EST PAS
  -- de retirer ce filtre ni d'exempter un rôle. C'est d'ajouter la colonne de
  -- marquage (`is_official` ou équivalent), de l'afficher partout où le nom
  -- l'est, puis d'autoriser le nom réservé UNIQUEMENT aux lignes marquées.
  -- Faire l'inverse — le nom d'abord, le marqueur plus tard — laisse une
  -- fenêtre pendant laquelle « Support Zabelie » n'est vérifiable par
  -- personne. → OPS_TODO.
  --
  -- Le repli ne peut produire ni NULL ni chaîne vide sur une colonne NOT NULL
  -- (PS11) : sinon ce filtre recréerait, sur le renommage cette fois, l'échec
  -- total que la note « totalité » ci-dessus cherche à éviter.
  new.display_name := coalesce(
    zabelie_clean_display_name(new.display_name),
    -- Un nom refusé ne bloque JAMAIS l'écriture : on garde le précédent, ou
    -- « Kont » à la création. Le refus explicite, lui, est du ressort du
    -- formulaire, qui peut expliquer ; la base, elle, garantit.
    case when tg_op = 'UPDATE' then old.display_name else 'Kont' end
  );
  return new;
end;
$$;

comment on function zabelie_sanitize_profile_name() is
  'Nettoie display_name sur toute écriture de profiles (insert et update). '
  'Le déclencheur sur auth.users ne couvre que la création : la RLS '
  'profiles_self_update laisse chacun se renommer ensuite. Voir 0045.';

drop trigger if exists trg_zabelie_sanitize_profile_name on profiles;
create trigger trg_zabelie_sanitize_profile_name
  before insert or update on profiles
  for each row execute function zabelie_sanitize_profile_name();

-- ─────────────────────────── 3. Le déclencheur d'inscription ────────────────
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

-- ─────────────────────── 4. Rattrapage des comptes existants ────────────────
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
