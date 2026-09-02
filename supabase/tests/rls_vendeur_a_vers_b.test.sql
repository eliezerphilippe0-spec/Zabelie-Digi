-- ============================================================================
-- C3.2 (docs/31) — UN VENDEUR NE VOIT NI NE TOUCHE LES DONNÉES D'UN AUTRE
-- ============================================================================
-- Ce que C3.1 (matrice RLS) et C3.4 (RLS partout) ne prouvent PAS : qu'une
-- policy présente fasse ce qu'on croit. Une policy `using (true)` est une
-- policy. Ici on se met À LA PLACE du vendeur T et on essaie d'atteindre ce
-- qui appartient au vendeur S — en lecture, en écriture, en insertion sous
-- son identité. Chaque tentative doit rendre ZÉRO ligne ou lever.
--
-- Le connu-POSITIF vient d'abord (S voit ses propres données), sans quoi
-- « zéro ligne » pour T pourrait vouloir dire « la requête est fausse ».
--
-- Même limite que `messagerie.test.sql` : `set local role` + claims est le
-- MOTEUR de policies sous une identité choisie, pas la chaîne GoTrue → PostgREST.
-- Transaction annulée : rien ne survit.
-- ============================================================================

begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000c3a1'),  -- acheteur
  ('00000000-0000-0000-0000-00000000c3e1'),  -- vendeur S
  ('00000000-0000-0000-0000-00000000c3e2')   -- vendeur T
on conflict (id) do nothing;

insert into profiles (id, role, display_name) values
  ('00000000-0000-0000-0000-00000000c3a1', 'buyer',   'Acheteur C3'),
  ('00000000-0000-0000-0000-00000000c3e1', 'creator', 'Vendeur S'),
  ('00000000-0000-0000-0000-00000000c3e2', 'creator', 'Vendeur T')
on conflict (id) do update set display_name = excluded.display_name;

insert into products (id, seller_id, slug, title, kind, price_htg, status) values
  ('00000000-0000-0000-0000-00000000c3d1', '00000000-0000-0000-0000-00000000c3e1',
   'c3-publie-s', 'Publié de S', 'physical', 1000, 'published'),
  ('00000000-0000-0000-0000-00000000c3d2', '00000000-0000-0000-0000-00000000c3e1',
   'c3-brouillon-s', 'Brouillon de S', 'physical', 1000, 'draft');

-- `owner_id` est UNIQUE et un portefeuille peut déjà avoir été créé par un
-- trigger de profil : le conflit se règle sur owner_id, pas sur id.
insert into wallets (id, owner_id, balance_htg) values
  ('00000000-0000-0000-0000-00000000c3f1', '00000000-0000-0000-0000-00000000c3e1', 5000)
on conflict (owner_id) do nothing;

insert into orders (id, buyer_id, product_id, amount_htg, status) values
  ('00000000-0000-0000-0000-00000000c3c1', '00000000-0000-0000-0000-00000000c3a1',
   '00000000-0000-0000-0000-00000000c3d1', 1000, 'paid');

-- Dossier KYC de S (métadonnées seulement, 0079) — le cas que C3.2 nommait
-- explicitement comme manquant.
insert into zabelie_kyc_submissions (user_id, status) values
  ('00000000-0000-0000-0000-00000000c3e1', 'pending')
on conflict (user_id) do nothing;

-- ───── 0. CONNU-POSITIF : S voit son brouillon, son portefeuille, sa vente ──
do $$
declare v_n integer;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000c3e1';

  select count(*) into v_n from products where id = '00000000-0000-0000-0000-00000000c3d2';
  if v_n <> 1 then raise exception 'C3.2-0 KO: S ne voit pas son propre brouillon (%)', v_n; end if;

  select count(*) into v_n from wallets where owner_id = '00000000-0000-0000-0000-00000000c3e1';
  if v_n <> 1 then raise exception 'C3.2-0 KO: S ne voit pas son portefeuille (%)', v_n; end if;

  reset role;
  raise notice 'C3.2-0 OK: le connu-positif tient — les requêtes voient bien quelque chose';
end $$;

-- ───── 1. T ne LIT pas le brouillon de S ────────────────────────────────────
do $$
declare v_n integer;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000c3e2';
  select count(*) into v_n from products where id = '00000000-0000-0000-0000-00000000c3d2';
  reset role;
  if v_n <> 0 then raise exception 'C3.2-1 KO: T lit le brouillon de S (%)', v_n; end if;
  raise notice 'C3.2-1 OK: brouillon invisible pour T';
end $$;

-- ───── 2. T ne LIT pas le portefeuille de S ─────────────────────────────────
do $$
declare v_n integer;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000c3e2';
  select count(*) into v_n from wallets where owner_id = '00000000-0000-0000-0000-00000000c3e1';
  reset role;
  if v_n <> 0 then raise exception 'C3.2-2 KO: T lit le portefeuille de S (%)', v_n; end if;
  raise notice 'C3.2-2 OK: portefeuille invisible pour T';
end $$;

-- ───── 3. T ne LIT pas la vente de S ────────────────────────────────────────
do $$
declare v_n integer;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000c3e2';
  select count(*) into v_n from orders where id = '00000000-0000-0000-0000-00000000c3c1';
  reset role;
  if v_n <> 0 then raise exception 'C3.2-3 KO: T lit une commande de S (%)', v_n; end if;
  raise notice 'C3.2-3 OK: commande invisible pour T';
end $$;

-- ───── 4. T ne MODIFIE pas le prix d'un produit PUBLIÉ de S ─────────────────
-- Le produit publié est LISIBLE par tous (c'est un catalogue) — c'est
-- précisément pour ça que l'écriture doit être éprouvée à part de la lecture.
do $$
declare v_n integer; v_prix integer;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000c3e2';
  begin
    update products set price_htg = 1 where id = '00000000-0000-0000-0000-00000000c3d1';
    get diagnostics v_n = row_count;
  exception when insufficient_privilege or check_violation then
    v_n := 0;
  end;
  reset role;
  select price_htg into v_prix from products where id = '00000000-0000-0000-0000-00000000c3d1';
  if v_n <> 0 or v_prix <> 1000 then
    raise exception 'C3.2-4 KO: T a modifié le prix d''un produit de S (lignes=%, prix=%)', v_n, v_prix;
  end if;
  raise notice 'C3.2-4 OK: le prix de S est intouchable pour T';
end $$;

-- ───── 5. T n'INSÈRE pas un produit sous l'identité de S ────────────────────
do $$
declare v_ok boolean := false;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000c3e2';
  begin
    insert into products (seller_id, slug, title, kind, price_htg, status) values
      ('00000000-0000-0000-0000-00000000c3e1', 'c3-usurpe', 'Usurpé', 'physical', 10, 'draft');
  exception when insufficient_privilege or check_violation or others then
    v_ok := true;
  end;
  reset role;
  if not v_ok then
    raise exception 'C3.2-5 KO: T a créé un produit au nom de S';
  end if;
  raise notice 'C3.2-5 OK: insertion sous l''identité de S refusée';
end $$;

-- ───── 6. T ne SUPPRIME pas un produit de S ─────────────────────────────────
do $$
declare v_n integer;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000c3e2';
  begin
    delete from products where id = '00000000-0000-0000-0000-00000000c3d1';
    get diagnostics v_n = row_count;
  exception when insufficient_privilege then
    v_n := 0;
  end;
  reset role;
  if v_n <> 0 then raise exception 'C3.2-6 KO: T a supprimé un produit de S'; end if;
  raise notice 'C3.2-6 OK: suppression refusée';
end $$;

-- ───── 7. T ne LIT pas le dossier KYC de S — et S lit bien le sien ──────────
-- Connu-positif et connu-négatif dans le même cas : sans le premier, un
-- « zéro » pour T pourrait signifier que la table est vide pour tout le monde.
do $$
declare v_s integer; v_t integer;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000c3e1';
  select count(*) into v_s from zabelie_kyc_submissions
   where user_id = '00000000-0000-0000-0000-00000000c3e1';
  reset role;

  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000c3e2';
  select count(*) into v_t from zabelie_kyc_submissions
   where user_id = '00000000-0000-0000-0000-00000000c3e1';
  reset role;

  if v_s <> 1 then raise exception 'C3.2-7 KO: S ne voit pas son propre dossier KYC (%)', v_s; end if;
  if v_t <> 0 then raise exception 'C3.2-7 KO: T lit le dossier KYC de S (%)', v_t; end if;
  raise notice 'C3.2-7 OK: le dossier KYC de S est visible de S seul';
end $$;

rollback;
