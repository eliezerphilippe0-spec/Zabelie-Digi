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
--
-- PS7 retire le déclencheur DANS la transaction (annulée ensuite) : règle du
-- dépôt, un garde se prouve sur un cas où il doit manquer, pas en raisonnant.

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

-- ─────────────────────────── PS5 : pas de course perdue ─────────────────────
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

-- ─────────────── PS6 : le parcours d'achat, sans écriture cliente ───────────
insert into auth.users (id, email) values
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

-- ─────────── PS7 : cas connu-négatif — sans le déclencheur, ça casse ────────
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

  raise notice 'OK — PS7 sans le déclencheur, l''achat échoue en violation de FK '
               '(c''est la panne que 0045 ferme : blocage total, rien d''écrit)';
end $$;

rollback;
