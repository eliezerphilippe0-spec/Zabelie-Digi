-- Vie privée des comptes et des avis (0137 ; audit docs/69, lot 1 bis).
-- Transaction annulée (rollback). ON_ERROR_STOP fait échouer au 1er assert faux.
--
-- Chaque règle est éprouvée sous le RÔLE RÉEL du client (anon, authenticated),
-- jamais en superutilisateur seul : en superutilisateur, la RLS ne s'applique
-- pas et tout passerait. Chaque cas positif a son connu-négatif.
--
--   V1  anon ne voit que les MARCHANDS (ni acheteur, ni admin) ;
--   V2  l'acheteur voit sa ligne et le vendeur avec qui il converse ;
--   V3  le vendeur voit sa ligne et l'acheteur avec qui il converse ;
--   V4  un tiers connecté ne voit ni l'acheteur ni l'admin (connu-négatif de V2/V3) ;
--   V5  buyer_id et order_id des avis sont refusés à anon ET à authenticated ;
--   V6  la note reste lisible en direct (API publique v1) ;
--   V7  zabelie_avis_produit rend « Prénom + initiale », jamais le nom complet ;
--   V8  un produit non publié ne rend aucun avis par la fonction.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000c0001', 'vendeur137@test.local'),
  ('00000000-0000-0000-0000-0000000c0002', 'acheteur137@test.local'),
  ('00000000-0000-0000-0000-0000000c0003', 'tiers137@test.local'),
  ('00000000-0000-0000-0000-0000000c0004', 'admin137@test.local')
  on conflict do nothing;

-- 0045 crée le profil à l'inscription ; on pilote les lignes nous-mêmes.
delete from profiles where id in (
  '00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-0000000c0002',
  '00000000-0000-0000-0000-0000000c0003', '00000000-0000-0000-0000-0000000c0004');
insert into profiles (id, role, display_name) values
  ('00000000-0000-0000-0000-0000000c0001', 'creator', 'Boutik Mari'),
  ('00000000-0000-0000-0000-0000000c0002', 'buyer',   'Marie Joseph'),
  ('00000000-0000-0000-0000-0000000c0003', 'buyer',   'Tiers Inconnu'),
  ('00000000-0000-0000-0000-0000000c0004', 'admin',   'Admin Zabelie');

insert into products (id, seller_id, slug, title, kind, price_htg, status)
  values ('00000000-0000-0000-0000-0000000c00a1',
          '00000000-0000-0000-0000-0000000c0001',
          'prod-vie-privee-137', 'Prod 137', 'fichier', 1000, 'published');
insert into orders (id, buyer_id, product_id, amount_htg, status)
  values ('00000000-0000-0000-0000-0000000c00b1',
          '00000000-0000-0000-0000-0000000c0002',
          '00000000-0000-0000-0000-0000000c00a1', 1000, 'paid');
insert into product_reviews (product_id, buyer_id, order_id, rating, comment)
  values ('00000000-0000-0000-0000-0000000c00a1',
          '00000000-0000-0000-0000-0000000c0002',
          '00000000-0000-0000-0000-0000000c00b1', 5, 'Bon fichier');
insert into zabelie_conversations (product_id, buyer_id, seller_id)
  values ('00000000-0000-0000-0000-0000000c00a1',
          '00000000-0000-0000-0000-0000000c0002',
          '00000000-0000-0000-0000-0000000c0001');

-- ── V1. anon : les marchands seulement ──────────────────────────────────────
do $$
declare v uuid[];
begin
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  select coalesce(array_agg(id order by id), '{}') into v from profiles
   where id in ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-0000000c0002',
                '00000000-0000-0000-0000-0000000c0003', '00000000-0000-0000-0000-0000000c0004');
  reset role;
  assert v = array['00000000-0000-0000-0000-0000000c0001']::uuid[],
    format('V1 KO : anon voit %s — seul le marchand devait sortir (ni acheteur, ni admin)', v);
  raise notice 'V1 OK — anon ne voit que le marchand';
end $$;

-- ── V2. L'acheteur : sa ligne et son interlocuteur ──────────────────────────
do $$
declare v uuid[];
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000c0002', true);
  set local role authenticated;
  select coalesce(array_agg(id order by id), '{}') into v from profiles
   where id in ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-0000000c0002',
                '00000000-0000-0000-0000-0000000c0003', '00000000-0000-0000-0000-0000000c0004');
  reset role;
  assert v = array['00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-0000000c0002']::uuid[],
    format('V2 KO : l''acheteur voit %s', v);
  raise notice 'V2 OK — l''acheteur voit sa ligne et le vendeur';
end $$;

-- ── V3. Le vendeur : sa ligne et l'acheteur avec qui il converse ────────────
do $$
declare v uuid[];
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000c0001', true);
  set local role authenticated;
  select coalesce(array_agg(id order by id), '{}') into v from profiles
   where id in ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-0000000c0002',
                '00000000-0000-0000-0000-0000000c0003', '00000000-0000-0000-0000-0000000c0004');
  reset role;
  assert v = array['00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-0000000c0002']::uuid[],
    format('V3 KO : le vendeur voit %s — l''acheteur de la conversation devait sortir, pas le tiers ni l''admin', v);
  raise notice 'V3 OK — le vendeur voit son interlocuteur, et lui seul';
end $$;

-- ── V4. Connu-négatif : un tiers connecté ───────────────────────────────────
do $$
declare v uuid[];
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000c0003', true);
  set local role authenticated;
  select coalesce(array_agg(id order by id), '{}') into v from profiles
   where id in ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-0000000c0002',
                '00000000-0000-0000-0000-0000000c0003', '00000000-0000-0000-0000-0000000c0004');
  reset role;
  assert v = array['00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-0000000c0003']::uuid[],
    format('V4 KO : un tiers voit %s — ni l''acheteur ni l''admin ne devaient sortir', v);
  raise notice 'V4 OK — un tiers ne voit ni les acheteurs ni l''admin';
end $$;

-- ── V5. buyer_id et order_id refusés aux rôles client ───────────────────────
do $$
declare v_role text; v_col text; v_refus integer := 0;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    foreach v_col in array array['buyer_id', 'order_id'] loop
      begin
        perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000c0002', true);
        execute format('set local role %I', v_role);
        execute format('select %I from product_reviews limit 1', v_col);
        reset role;
        raise exception 'V5 KO : % lit product_reviews.% en direct', v_role, v_col;
      exception when insufficient_privilege then
        v_refus := v_refus + 1;
      end;
      reset role;
    end loop;
  end loop;
  assert v_refus = 4, format('V5 KO : %s refus sur 4', v_refus);
  raise notice 'V5 OK — buyer_id et order_id refusés à anon et à authenticated';
end $$;

-- ── V6. La note reste lisible en direct ────────────────────────────────────
do $$
declare v integer;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  select count(*) into v from product_reviews
   where product_id = '00000000-0000-0000-0000-0000000c00a1' and rating = 5;
  reset role;
  assert v = 1, format('V6 KO : anon ne lit plus la note (%s ligne) — l''API publique v1 casserait', v);
  raise notice 'V6 OK — id, note, commentaire et date restent publics';
end $$;

-- ── V7. Prénom + initiale par la fonction, jamais le nom complet ───────────
do $$
declare v_auteur text; v_n integer;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  select count(*), max(auteur) into v_n, v_auteur
    from zabelie_avis_produit('00000000-0000-0000-0000-0000000c00a1');
  reset role;
  assert v_n = 1, format('V7 KO : %s avis rendus au lieu de 1', v_n);
  assert v_auteur = 'Marie J.', format('V7 KO : auteur « %s » au lieu de « Marie J. »', v_auteur);
  assert position('Joseph' in v_auteur) = 0, 'V7 KO : le nom complet est sorti';
  raise notice 'V7 OK — « Marie J. », le nom complet reste en base';
end $$;

-- ── V8. Produit non publié : aucun avis par la fonction ─────────────────────
update products set status = 'draft' where id = '00000000-0000-0000-0000-0000000c00a1';
do $$
declare v_n integer;
begin
  set local role anon;
  select count(*) into v_n from zabelie_avis_produit('00000000-0000-0000-0000-0000000c00a1');
  reset role;
  assert v_n = 0, format('V8 KO : %s avis rendus pour un brouillon', v_n);
  raise notice 'V8 OK — un brouillon ne rend aucun avis';
end $$;

rollback;
