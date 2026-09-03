-- Tests du profil créé à l'inscription (0045). Transaction annulée à la fin.
-- Usage : psql "$DATABASE_URL" -f supabase/tests/profile_on_signup.test.sql
--
--   PS1. Compte créé → profil créé, nom déduit de l'e-mail, role/tier par défaut.
--   PS2. Nom saisi au formulaire (métadonnées) → repris tel quel.
--   PS3. Nom vide ou blanc → repli sur l'e-mail, jamais une chaîne vide.
--   PS4. Ni nom ni e-mail → 'Kont' (display_name est NOT NULL).
--   PS5. Profil déjà présent (insert client gagnant la course) → intact.
--   PS6. CAS NOMINAL : un compte peut acheter sans aucune écriture du client.
--   PS7. CAS CONNU-NÉGATIF : sans le déclencheur, la même commande échoue en
--        violation de clé étrangère — c'est exactement le trou que 0045 ferme.
--   PS8. Nom hostile : longueur, caractères de contrôle, usurpation de marque.
--   PS9. Le déclencheur reste TOTAL sur ces entrées : l'inscription aboutit.
--
--   PS10. LE CHEMIN QUI MANQUAIT : renommage après inscription (`update`).
--   PS11. Le repli ne peut JAMAIS produire NULL ni chaîne vide sur une
--         colonne NOT NULL — sinon le filtre recrée l'échec total qu'il
--         devait éviter, cette fois sur le renommage aussi.
--   PS12. Compte né par fournisseur tiers (0095) : les métadonnées portent
--         `full_name`/`name`, pas `display_name`. Le nom est repris, filtré
--         (usurpation refusée → repli e-mail), et `display_name` garde la
--         priorité quand les deux existent.
--
-- PS7 retire le déclencheur DANS sa transaction : règle du dépôt, un garde se
-- prouve sur un cas où il doit manquer, pas en raisonnant.
--
-- ⚠️ CHAQUE CAS A SA PROPRE TRANSACTION, annulée à la fin. La première version
-- de ce fichier n'en avait qu'une : PS7 y retirait le déclencheur et PS9
-- échouait ensuite pour une raison qui n'était pas la sienne. Le correctif
-- durable n'est pas de penser à reposer ce qu'on a retiré — c'est que le
-- geste soit impossible à oublier. Un cas ne peut plus polluer le suivant.

begin;

-- ─────────────────────────── PS1 → PS4 ──────────────────────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000a0001', 'marie.dupont@test.local', null),
  ('00000000-0000-0000-0000-0000000a0002', 'jean@test.local',
     '{"display_name": "Jean Boutique"}'::jsonb),
  ('00000000-0000-0000-0000-0000000a0003', 'blanc@test.local',
     '{"display_name": "   "}'::jsonb),
  ('00000000-0000-0000-0000-0000000a0004', null, null);

do $$
declare r record;
begin
  select display_name, role::text, tier::text into r
    from profiles where id = '00000000-0000-0000-0000-0000000a0001';
  if r is null then
    raise exception 'PS1 : aucun profil créé pour un compte tout juste inscrit';
  end if;
  if r.display_name <> 'marie.dupont' then
    raise exception 'PS1 : nom attendu « marie.dupont », obtenu « % »', r.display_name;
  end if;
  -- Le déclencheur ne fixe NI role NI tier : il laisse les défauts. Les
  -- colonnes privilégiées restent hors de sa portée (0015/0017).
  if r.role <> 'buyer' or r.tier <> 'standard' then
    raise exception 'PS1 : role/tier attendus buyer/standard, obtenus %/%', r.role, r.tier;
  end if;

  select display_name into r
    from profiles where id = '00000000-0000-0000-0000-0000000a0002';
  if r.display_name <> 'Jean Boutique' then
    raise exception 'PS2 : nom du formulaire perdu, obtenu « % »', r.display_name;
  end if;

  select display_name into r
    from profiles where id = '00000000-0000-0000-0000-0000000a0003';
  if r.display_name <> 'blanc' then
    raise exception 'PS3 : un nom blanc doit retomber sur l''e-mail, obtenu « % »',
      r.display_name;
  end if;

  select display_name into r
    from profiles where id = '00000000-0000-0000-0000-0000000a0004';
  if r.display_name <> 'Kont' then
    raise exception 'PS4 : repli attendu « Kont », obtenu « % »', r.display_name;
  end if;

  raise notice 'OK — PS1 profil créé ; PS2 nom du formulaire ; PS3 repli e-mail ; PS4 repli Kont';
end $$;

rollback;

-- ───────── PS10 : le renommage après coup — le chemin que je manquais ───────
-- `profiles_self_update` autorise chacun à écrire sa propre ligne, et
-- `POST /api/profile` l'expose. Un filtre posé au seul moment de
-- l'inscription ne voit jamais cette voie.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a0040', 'renommage@test.local');

do $$
declare v_nom text;
begin
  -- (a) Usurpation par `update` — refusée, l'ancien nom est conservé.
  update profiles set display_name = 'Support Zabelie'
   where id = '00000000-0000-0000-0000-0000000a0040';
  select display_name into v_nom
    from profiles where id = '00000000-0000-0000-0000-0000000a0040';
  if v_nom <> 'renommage' then
    raise exception 'PS10a : renommage en « % » accepté', v_nom;
  end if;

  -- (b) Longueur bornée aussi sur cette voie.
  update profiles set display_name = repeat('b', 500)
   where id = '00000000-0000-0000-0000-0000000a0040';
  select display_name into v_nom
    from profiles where id = '00000000-0000-0000-0000-0000000a0040';
  if length(v_nom) <> 60 then
    raise exception 'PS10b : nom de % caractères écrit par update', length(v_nom);
  end if;

  -- (c) Un renommage légitime passe — le garde n'est pas un mur.
  update profiles set display_name = 'Boutique Marie'
   where id = '00000000-0000-0000-0000-0000000a0040';
  select display_name into v_nom
    from profiles where id = '00000000-0000-0000-0000-0000000a0040';
  if v_nom <> 'Boutique Marie' then
    raise exception 'PS10c : renommage légitime refusé (« % »)', v_nom;
  end if;

  raise notice 'OK — PS10 renommage : usurpation refusée, longueur bornée, '
               'renommage légitime accepté';
end $$;

rollback;

-- ─────────────────────────── PS5 : pas de course perdue ─────────────────────
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000a0002', 'jean@test.local',
     '{"display_name": "Jean Boutique"}'::jsonb);
-- Le client insère encore le profil tant que 0045 n'est pas appliquée en
-- production. Les deux chemins doivent coexister : celui qui arrive second ne
-- doit rien casser ni rien écraser.
do $$
declare v_nom text;
begin
  update profiles set display_name = 'Nom choisi par le client'
   where id = '00000000-0000-0000-0000-0000000a0002';
  -- Second chemin (l'insert client) arrivant après le déclencheur.
  insert into profiles (id, display_name)
  values ('00000000-0000-0000-0000-0000000a0002', 'écrasement')
  on conflict (id) do nothing;

  select display_name into v_nom
    from profiles where id = '00000000-0000-0000-0000-0000000a0002';
  if v_nom <> 'Nom choisi par le client' then
    raise exception 'PS5 : le profil existant a été écrasé (« % »)', v_nom;
  end if;
  raise notice 'OK — PS5 profil existant intact';
end $$;

rollback;

-- ─────────────── PS6 : le parcours d'achat, sans écriture cliente ───────────
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a0001', 'marie.dupont@test.local'),
  ('00000000-0000-0000-0000-0000000a0010', 'vendeur.ps@test.local');
update profiles set role = 'creator'
 where id = '00000000-0000-0000-0000-0000000a0010';

insert into products (id, seller_id, slug, title, price_htg, kind, status)
values ('00000000-0000-0000-0000-0000000a0011',
        '00000000-0000-0000-0000-0000000a0010',
        'produit-ps', 'Produit PS', 2500, 'fichier', 'published');

do $$
declare v_order uuid;
begin
  -- Aucun `insert into profiles` ici : c'est tout l'objet du test. L'acheteur
  -- n'existe que parce qu'un compte a été créé.
  insert into orders (buyer_id, product_id, amount_htg, status)
  values ('00000000-0000-0000-0000-0000000a0001',
          '00000000-0000-0000-0000-0000000a0011', 2500, 'pending')
  returning id into v_order;

  if v_order is null then
    raise exception 'PS6 : commande non créée';
  end if;
  raise notice 'OK — PS6 un compte peut acheter sans écriture du navigateur';
end $$;

rollback;

-- ─────────── PS7 : cas connu-négatif — sans le déclencheur, ça casse ────────
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a0010', 'vendeur.ps@test.local');
update profiles set role = 'creator'
 where id = '00000000-0000-0000-0000-0000000a0010';
insert into products (id, seller_id, slug, title, price_htg, kind, status)
values ('00000000-0000-0000-0000-0000000a0011',
        '00000000-0000-0000-0000-0000000a0010',
        'produit-ps7', 'Produit PS7', 2500, 'fichier', 'published');
do $$
declare v_code text;
begin
  drop trigger trg_zabelie_profile_on_signup on auth.users;

  insert into auth.users (id, email)
  values ('00000000-0000-0000-0000-0000000a0020', 'orphelin@test.local');

  begin
    insert into orders (buyer_id, product_id, amount_htg, status)
    values ('00000000-0000-0000-0000-0000000a0020',
            '00000000-0000-0000-0000-0000000a0011', 2500, 'pending');
    raise exception 'PS7 : la commande a été créée sans profil — le test ne prouve rien';
  exception
    when foreign_key_violation then
      v_code := 'FK';
  end;

  if v_code is distinct from 'FK' then
    raise exception 'PS7 : violation de clé étrangère attendue, obtenu %', v_code;
  end if;

  -- Rien à reposer : la transaction de CE cas est annulée, donc le
  -- déclencheur revient sans que personne n'ait à y penser.
  raise notice 'OK — PS7 sans le déclencheur, l''achat échoue en violation de FK '
               '(c''est la panne que 0045 ferme : blocage total, rien d''écrit)';
end $$;

rollback;

-- ───────────── PS8 : le nom vient du navigateur, donc il est hostile ────────
begin;
-- Testé sur la fonction pure : chaque cas est lisible, aucun compte à créer.
do $$
declare
  v_long text := repeat('a', 300);
  v_out  text;
begin
  -- (a) Longueur bornée à 60 — la colonne est indexée en trigram (0013).
  v_out := zabelie_safe_display_name(v_long, 'x@test.local');
  if length(v_out) <> 60 then
    raise exception 'PS8a : nom non borné, longueur %', length(v_out);
  end if;

  -- (b) Caractères de contrôle retirés, espaces réduits.
  v_out := zabelie_safe_display_name(E'Ma\trie\n  Dupont', 'x@test.local');
  if v_out <> 'Marie Dupont' then
    raise exception 'PS8b : nettoyage attendu « Marie Dupont », obtenu « % »', v_out;
  end if;

  -- (c) Usurpation de la plateforme, sous ses variantes d'écriture.
  foreach v_out in array array[
    'Zabelie', 'Support Zabelie', 'ZABELIE  OFFICIEL',
    'Z-a-b-e-l-i-e', 'zabely', 'Zabelie Digi'
  ] loop
    if zabelie_safe_display_name(v_out, 'vendeur@test.local') <> 'vendeur' then
      raise exception 'PS8c : « % » accepté comme nom affiché', v_out;
    end if;
  end loop;

  -- (d) Le repli e-mail subit le MÊME filtre, sinon il rouvre la porte.
  if zabelie_safe_display_name(null, 'zabelie@test.local') <> 'Kont' then
    raise exception 'PS8d : « zabelie@… » a produit le nom de la marque';
  end if;

  -- (e) Un nom légitime n'est pas mutilé au passage.
  if zabelie_safe_display_name('Isabelle Toussaint', 'i@test.local')
     <> 'Isabelle Toussaint' then
    raise exception 'PS8e : faux positif sur un nom légitime';
  end if;

  raise notice 'OK — PS8 longueur bornée, contrôles retirés, usurpation refusée, '
               'repli filtré, nom légitime intact';
end $$;

rollback;

-- ───────── PS9 : totalité — une entrée hostile ne ferme pas l'inscription ───
begin;
do $$
declare v_nom text;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values ('00000000-0000-0000-0000-0000000a0030', 'hostile@test.local',
          jsonb_build_object('display_name', repeat('Z', 5000)));

  select display_name into v_nom
    from profiles where id = '00000000-0000-0000-0000-0000000a0030';
  if v_nom is null then
    raise exception 'PS9 : inscription passée sans profil';
  end if;
  if length(v_nom) > 60 then
    raise exception 'PS9 : nom de % caractères écrit en base', length(v_nom);
  end if;
  raise notice 'OK — PS9 entrée hostile absorbée, inscription aboutie (nom « % »)', v_nom;
end $$;

rollback;

-- ── PS11 : un refus ne doit jamais violer NOT NULL, sur aucune voie ─────────
-- Le déclencheur `profiles` REMPLACE une valeur refusée. Si ce remplacement
-- pouvait rendre NULL ou '', on aurait déplacé l'échec total du point 3 de
-- l'inscription vers le renommage — c'est-à-dire partout.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a0050', 'ps11@test.local');

do $$
declare
  v_nom  text;
  v_cas  text;
begin
  -- (a) INSERT direct portant un nom refusé (pas via auth.users).
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000a0051', null);
  update profiles set display_name = 'Zabelie'
   where id = '00000000-0000-0000-0000-0000000a0051';

  -- (b) Toutes les entrées que le filtre refuse, sur les DEUX voies.
  foreach v_cas in array array['Zabelie', '', '   ', E'\t\n', 'zabely'] loop
    -- update
    update profiles set display_name = v_cas
     where id = '00000000-0000-0000-0000-0000000a0050';
    select display_name into v_nom
      from profiles where id = '00000000-0000-0000-0000-0000000a0050';
    if v_nom is null or btrim(v_nom) = '' then
      raise exception 'PS11 update « % » : nom vide ou NULL écrit', v_cas;
    end if;

    -- insert (ligne neuve, donc repli « Kont » et non l'ancien nom)
    delete from profiles where id = '00000000-0000-0000-0000-0000000a0051';
    insert into profiles (id, display_name)
    values ('00000000-0000-0000-0000-0000000a0051', v_cas);
    select display_name into v_nom
      from profiles where id = '00000000-0000-0000-0000-0000000a0051';
    if v_nom is null or btrim(v_nom) = '' then
      raise exception 'PS11 insert « % » : nom vide ou NULL écrit', v_cas;
    end if;
    if v_nom <> 'Kont' then
      raise exception 'PS11 insert « % » : repli attendu « Kont », obtenu « % »',
        v_cas, v_nom;
    end if;
  end loop;

  -- (c) Le repli lui-même ne doit pas être refusé par le filtre : sinon la
  --     boucle serait sans fin logique (« Kont » réécrit en « Kont »).
  if zabelie_clean_display_name('Kont') is distinct from 'Kont' then
    raise exception 'PS11 : le repli « Kont » est lui-même refusé par le filtre';
  end if;

  raise notice 'OK — PS11 aucun refus ne produit NULL ni chaîne vide '
               '(update garde l''ancien nom, insert retombe sur « Kont »)';
end $$;

rollback;

-- ───────── PS12 : le compte né chez Google/Microsoft porte son nom (0095) ───
-- Ce que Supabase pose pour un profil OAuth : `full_name`, `name`, `email`,
-- `avatar_url`… et jamais `display_name`. Avant 0095, ces comptes tombaient
-- sur le repli e-mail. Quatre cas, dont un connu-négatif.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  -- (a) Google : full_name et name, pas de display_name.
  ('00000000-0000-0000-0000-0000000a0060', 'marie.google@test.local',
     '{"full_name": "Marie Dupont", "name": "Marie Dupont", "iss": "https://accounts.google.com"}'::jsonb),
  -- (b) name seul (certains fournisseurs ne posent pas full_name).
  ('00000000-0000-0000-0000-0000000a0061', 'jean.ms@test.local',
     '{"name": "Jean Baptiste"}'::jsonb),
  -- (c) CONNU-NÉGATIF : un compte Google nommé comme la plateforme.
  ('00000000-0000-0000-0000-0000000a0062', 'faux.support@test.local',
     '{"full_name": "Support Zabelie"}'::jsonb),
  -- (d) display_name ET full_name : le formulaire garde la priorité.
  ('00000000-0000-0000-0000-0000000a0063', 'deux@test.local',
     '{"display_name": "Boutique Deux", "full_name": "Autre Nom"}'::jsonb);

do $$
declare v_nom text;
begin
  select display_name into v_nom from profiles where id = '00000000-0000-0000-0000-0000000a0060';
  if v_nom <> 'Marie Dupont' then
    raise exception 'PS12a : full_name Google perdu, obtenu « % »', v_nom;
  end if;

  select display_name into v_nom from profiles where id = '00000000-0000-0000-0000-0000000a0061';
  if v_nom <> 'Jean Baptiste' then
    raise exception 'PS12b : name seul perdu, obtenu « % »', v_nom;
  end if;

  select display_name into v_nom from profiles where id = '00000000-0000-0000-0000-0000000a0062';
  if v_nom <> 'faux.support' then
    raise exception 'PS12c : « Support Zabelie » venu d''un fournisseur ACCEPTÉ (« % »)', v_nom;
  end if;

  select display_name into v_nom from profiles where id = '00000000-0000-0000-0000-0000000a0063';
  if v_nom <> 'Boutique Deux' then
    raise exception 'PS12d : display_name du formulaire supplanté par full_name (« % »)', v_nom;
  end if;

  raise notice 'OK — PS12 nom OAuth repris (full_name, name), usurpation refusée, '
               'display_name prioritaire';
end $$;

rollback;
