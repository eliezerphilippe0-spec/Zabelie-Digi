-- ============================================================================
-- Isolation RLS des commandes — ce que l'API v1 peut et ne peut pas déléguer
-- ============================================================================
-- Exigence §5.2 du brief API v1 : `get_order` et `get_user_orders` ne rendent
-- que les commandes de l'appelant. Ce test établit CE QUE LA RLS FAIT vraiment,
-- et surtout ce qu'elle NE FAIT PAS — parce que c'est cette seconde partie qui
-- dicte du code dans le handler.
--
-- LE CONSTAT QUI A MOTIVÉ CE FICHIER (lu dans `pg_policies` de la production,
-- le 2026-08-02) : `orders` porte DEUX policies de lecture.
--
--   orders_buyer_read   → auth.uid() = buyer_id
--   orders_seller_read  → exists (select 1 from products p
--                                  where p.id = orders.product_id
--                                    and p.seller_id = auth.uid())
--
-- La seconde est légitime — un vendeur doit voir ce qu'on lui a acheté. Mais
-- elle signifie que **la RLS seule ne suffit pas** à honorer « mes commandes » :
-- un vendeur qui appelle `get_user_orders` recevrait ses VENTES, dans une
-- sortie qui annonce ses ACHATS. Le handler doit donc filtrer
-- `buyer_id = auth.uid()` EN PLUS de la RLS. Le cas 4 ci-dessous est la preuve
-- que ce filtre est nécessaire : il constate que la RLS laisse passer.
--
-- ⚠️ CE QUE CE TEST N'EST PAS — à lire avant de le citer comme conformité.
-- Il tourne sur un Postgres local, avec un `auth.uid()` STUBBÉ qui lit un
-- réglage de session (`_bootstrap.sql`). Aucun JWT n'est émis, signé ni
-- vérifié ; aucun GoTrue n'intervient. Ce qui est exercé, c'est le MOTEUR DE
-- POLICIES avec une identité choisie — pas la chaîne complète
-- « jeton → PostgREST → policy ». L'écart est nommé dans `docs/24-API-V1.md`
-- et sa fermeture est inscrite comme CONDITION D'OUVERTURE dans `OPS_TODO.md`,
-- pas comme tâche flottante.
--
-- Ce fichier n'utilise AUCUN objet de `0043`/`0044` : elles ne sont pas
-- appliquées en production, et un test qui en dépendrait décrirait un schéma
-- que personne n'exécute.
-- ============================================================================

begin;

-- ─────────────────────────── Jeu d'essai ────────────────────────────────────
-- Trois identités : deux acheteurs et un vendeur. Le vendeur est celui de
-- l'unique produit, donc `orders_seller_read` s'appliquera à lui.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000aaaa'),  -- acheteur A
  ('00000000-0000-0000-0000-00000000bbbb'),  -- acheteur B
  ('00000000-0000-0000-0000-000000005e11')   -- vendeur S
on conflict (id) do nothing;

insert into profiles (id, role, display_name) values
  ('00000000-0000-0000-0000-00000000aaaa', 'buyer',   'Acheteur A'),
  ('00000000-0000-0000-0000-00000000bbbb', 'buyer',   'Acheteur B'),
  ('00000000-0000-0000-0000-000000005e11', 'creator', 'Vendeur S')
on conflict (id) do update set display_name = excluded.display_name;

insert into products (id, seller_id, slug, title, kind, price_htg, status)
values ('00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-000000005e11',
        'rls-produit', 'Produit du vendeur S', 'physical', 1000, 'published');

insert into orders (id, buyer_id, product_id, amount_htg, status) values
  ('00000000-0000-0000-0000-00000000001a',
   '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000d1', 1000, 'paid'),
  ('00000000-0000-0000-0000-00000000001b',
   '00000000-0000-0000-0000-00000000bbbb',
   '00000000-0000-0000-0000-0000000000d1', 1000, 'paid');

-- ────────────── 1. Cas POSITIF : je vois ma commande ────────────────────────
do $$
declare v_n integer;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aaaa';
  select count(*) into v_n from orders
   where id = '00000000-0000-0000-0000-00000000001a';
  reset role;
  assert v_n = 1,
    format('CAS 1 : A ne voit pas sa propre commande (%s lignes)', v_n);
  raise notice 'OK — 1. l''acheteur voit SA commande';
end $$;

-- ────────── 2. Cas NÉGATIF : je ne vois pas celle d'un autre ────────────────
-- C'est l'assertion que le §5.2 exige explicitement.
do $$
declare v_n integer;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aaaa';
  select count(*) into v_n from orders
   where id = '00000000-0000-0000-0000-00000000001b';
  reset role;
  assert v_n = 0,
    format('CAS 2 : FUITE — A voit la commande de B (%s lignes)', v_n);
  raise notice 'OK — 2. l''acheteur ne voit PAS la commande d''un autre';
end $$;

-- ─────── 3. Un tiers sans lien ne voit rien, même en connaissant l'id ───────
do $$
declare v_n integer;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ffff';
  select count(*) into v_n from orders;
  reset role;
  assert v_n = 0,
    format('CAS 3 : un tiers voit %s commande(s)', v_n);
  raise notice 'OK — 3. un tiers sans lien ne voit aucune commande';
end $$;

-- ──── 4. LE CAS QUI DICTE DU CODE : le VENDEUR voit, la RLS le permet ───────
-- Ce n'est PAS un défaut de la RLS : `orders_seller_read` est voulue. C'est la
-- preuve que `get_user_orders` ne peut pas s'appuyer sur la RLS seule, sous
-- peine de rendre des VENTES sous l'étiquette « mes achats ».
do $$
declare v_n integer;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000005e11';
  select count(*) into v_n from orders;
  reset role;
  assert v_n = 2,
    format('CAS 4 : le vendeur voit %s commande(s), 2 attendues — si ce '
           'chiffre tombe à 0, `orders_seller_read` a disparu et le handler '
           'peut cesser de filtrer ; si personne ne le remarque, le filtre '
           'devient du code mort qu''on retirera un jour par erreur', v_n);
  raise notice 'OK — 4. le vendeur VOIT les 2 commandes : le handler DOIT filtrer buyer_id';
end $$;

-- ── 5. Le filtre applicatif attendu du handler donne bien le bon résultat ───
-- On simule ce que `get_user_orders` fera : RLS + `buyer_id = auth.uid()`.
do $$
declare v_n integer;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000005e11';
  select count(*) into v_n from orders where buyer_id = auth.uid();
  reset role;
  assert v_n = 0,
    format('CAS 5 : avec le filtre buyer_id, le vendeur devrait voir 0 achat, '
           'il en voit %s', v_n);
  raise notice 'OK — 5. RLS + filtre buyer_id : le vendeur ne voit AUCUN achat';
end $$;

-- ─────── 6. L'écriture reste fermée : aucune policy INSERT/UPDATE ──────────
do $$
declare v_denied integer := 0;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aaaa';
  begin
    update orders set amount_htg = 1
     where id = '00000000-0000-0000-0000-00000000001a';
    -- Sans policy UPDATE, RLS ne lève pas : elle ne trouve simplement aucune
    -- ligne modifiable. On compte donc les lignes touchées, pas l'exception.
    if not found then v_denied := v_denied + 1; end if;
  exception when insufficient_privilege then v_denied := v_denied + 1;
  end;
  begin
    insert into orders (buyer_id, product_id, amount_htg, status)
    values ('00000000-0000-0000-0000-00000000aaaa',
            '00000000-0000-0000-0000-0000000000d1', 1, 'paid');
  exception when insufficient_privilege or check_violation then
    v_denied := v_denied + 1;
  end;
  reset role;
  assert v_denied = 2,
    format('CAS 6 : %s écriture(s) refusée(s) sur 2 attendues', v_denied);
  raise notice 'OK — 6. aucune écriture possible sur orders sous rôle authenticated';
end $$;

rollback;
