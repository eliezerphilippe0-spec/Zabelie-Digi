-- Réponse du vendeur à un avis (0139 ; audit docs/69, lot 2). Transaction annulée.
-- Éprouvé sous les rôles réels ; chaque refus attendu est un connu-négatif.
--
--   A1  le vendeur du produit répond ; la réponse sort par zabelie_avis_produit ;
--   A2  une seconde réponse au même avis est refusée (23505) ;
--   A3  un AUTRE vendeur est refusé (42501) ;
--   A4  l'acheteur auteur de l'avis est refusé (42501) ;
--   A5  anon ne peut pas exécuter la fonction ;
--   A6  vide et 1 001 caractères refusés (22023) ; caractères de contrôle
--       retirés, saut de ligne gardé ;
--   A7  un vendeur suspendu ne répond plus (42501).
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000e0001', 'vendeur139@test.local'),
  ('00000000-0000-0000-0000-0000000e0002', 'autre139@test.local'),
  ('00000000-0000-0000-0000-0000000e0003', 'acheteur139@test.local')
  on conflict do nothing;
delete from profiles where id in (
  '00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-0000000e0002',
  '00000000-0000-0000-0000-0000000e0003');
insert into profiles (id, role, display_name) values
  ('00000000-0000-0000-0000-0000000e0001', 'creator', 'Vendeur 139'),
  ('00000000-0000-0000-0000-0000000e0002', 'creator', 'Autre 139'),
  ('00000000-0000-0000-0000-0000000e0003', 'buyer',   'Rose Pierre');

insert into products (id, seller_id, slug, title, kind, price_htg, status)
  values ('00000000-0000-0000-0000-0000000e00a1', '00000000-0000-0000-0000-0000000e0001',
          'prod-reponse-139', 'Prod 139', 'fichier', 1000, 'published');
insert into orders (id, buyer_id, product_id, amount_htg, status) values
  ('00000000-0000-0000-0000-0000000e00b1', '00000000-0000-0000-0000-0000000e0003', '00000000-0000-0000-0000-0000000e00a1', 1000, 'paid'),
  ('00000000-0000-0000-0000-0000000e00b2', '00000000-0000-0000-0000-0000000e0003', '00000000-0000-0000-0000-0000000e00a1', 1000, 'paid'),
  ('00000000-0000-0000-0000-0000000e00b3', '00000000-0000-0000-0000-0000000e0003', '00000000-0000-0000-0000-0000000e00a1', 1000, 'paid');
insert into product_reviews (id, product_id, buyer_id, order_id, rating, comment) values
  ('00000000-0000-0000-0000-0000000e00c1', '00000000-0000-0000-0000-0000000e00a1', '00000000-0000-0000-0000-0000000e0003', '00000000-0000-0000-0000-0000000e00b1', 4, 'Bien'),
  ('00000000-0000-0000-0000-0000000e00c2', '00000000-0000-0000-0000-0000000e00a1', '00000000-0000-0000-0000-0000000e0003', '00000000-0000-0000-0000-0000000e00b2', 5, 'Tres bien'),
  ('00000000-0000-0000-0000-0000000e00c3', '00000000-0000-0000-0000-0000000e00a1', '00000000-0000-0000-0000-0000000e0003', '00000000-0000-0000-0000-0000000e00b3', 3, 'Moyen');

-- ── A1. Le vendeur répond ; la réponse est publique ─────────────────────────
do $$
declare v_le timestamptz; v_rep text;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e0001', true);
  set local role authenticated;
  v_le := zabelie_repondre_avis('00000000-0000-0000-0000-0000000e00c1', '  Mesi anpil !  ');
  reset role;
  assert v_le is not null, 'A1 KO : aucune date de reponse rendue';

  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  select reponse_vendeur into v_rep from zabelie_avis_produit('00000000-0000-0000-0000-0000000e00a1')
   where id = '00000000-0000-0000-0000-0000000e00c1';
  reset role;
  assert v_rep = 'Mesi anpil !', format('A1 KO : reponse publique « %s »', v_rep);
  raise notice 'A1 OK — le vendeur repond, la reponse est publique (et rognee)';
end $$;

-- ── A2 → A4. Refus attendus ─────────────────────────────────────────────────
do $$
declare v_etat text;
begin
  -- A2 : seconde réponse au même avis.
  begin
    perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e0001', true);
    set local role authenticated;
    perform zabelie_repondre_avis('00000000-0000-0000-0000-0000000e00c1', 'Encore');
    raise exception 'A2 KO : une seconde reponse a ete acceptee';
  exception when unique_violation then v_etat := 'A2';
  end;
  reset role;
  assert v_etat = 'A2', 'A2 KO';

  -- A3 : un autre vendeur.
  begin
    perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e0002', true);
    set local role authenticated;
    perform zabelie_repondre_avis('00000000-0000-0000-0000-0000000e00c2', 'Je ne suis pas le vendeur');
    raise exception 'A3 KO : un autre vendeur a repondu';
  exception when insufficient_privilege then v_etat := 'A3';
  end;
  reset role;
  assert v_etat = 'A3', 'A3 KO';

  -- A4 : l'acheteur auteur de l'avis.
  begin
    perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e0003', true);
    set local role authenticated;
    perform zabelie_repondre_avis('00000000-0000-0000-0000-0000000e00c2', 'Je reponds a moi-meme');
    raise exception 'A4 KO : l''acheteur a repondu a la place du vendeur';
  exception when insufficient_privilege then v_etat := 'A4';
  end;
  reset role;
  assert v_etat = 'A4', 'A4 KO';
  raise notice 'A2-A4 OK — une seule reponse, et seulement du vendeur du produit';
end $$;

-- ── A5. anon n'exécute pas ──────────────────────────────────────────────────
do $$
declare v_refus boolean := false;
begin
  begin
    perform set_config('request.jwt.claim.sub', '', true);
    set local role anon;
    perform zabelie_repondre_avis('00000000-0000-0000-0000-0000000e00c2', 'Anonyme');
  exception when insufficient_privilege then v_refus := true;
  end;
  reset role;
  assert v_refus, 'A5 KO : anon a pu appeler zabelie_repondre_avis';
  raise notice 'A5 OK — anon ne peut pas repondre';
end $$;

-- ── A6. Longueurs et caractères de contrôle ─────────────────────────────────
do $$
declare v_n integer := 0; v_rep text;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e0001', true);
  begin
    set local role authenticated;
    perform zabelie_repondre_avis('00000000-0000-0000-0000-0000000e00c2', '   ');
  exception when invalid_parameter_value then v_n := v_n + 1;
  end;
  reset role;
  begin
    set local role authenticated;
    perform zabelie_repondre_avis('00000000-0000-0000-0000-0000000e00c2', repeat('a', 1001));
  exception when invalid_parameter_value then v_n := v_n + 1;
  end;
  reset role;
  assert v_n = 2, format('A6 KO : %s refus de longueur sur 2', v_n);

  set local role authenticated;
  perform zabelie_repondre_avis('00000000-0000-0000-0000-0000000e00c2', E'Merci\x07\nA bientot');
  reset role;
  select reponse_vendeur into v_rep from product_reviews where id = '00000000-0000-0000-0000-0000000e00c2';
  assert v_rep = E'Merci\nA bientot', format('A6 KO : texte enregistre « %s »', v_rep);
  raise notice 'A6 OK — longueurs bornees, controle retire, saut de ligne garde';
end $$;

-- ── A7. Vendeur suspendu ────────────────────────────────────────────────────
update profiles set suspended_at = now() where id = '00000000-0000-0000-0000-0000000e0001';
do $$
declare v_refus boolean := false;
begin
  begin
    perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000e0001', true);
    set local role authenticated;
    perform zabelie_repondre_avis('00000000-0000-0000-0000-0000000e00c3', 'Suspendu');
  exception when insufficient_privilege then v_refus := true;
  end;
  reset role;
  assert v_refus, 'A7 KO : un vendeur suspendu a pu repondre';
  raise notice 'A7 OK — un vendeur suspendu ne repond plus';
end $$;

rollback;
