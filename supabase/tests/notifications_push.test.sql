-- Tests de 0169 — abonnements aux notifications de vente. Transaction annulée.
--
--   P1. Aucun droit client : ni anon ni authenticated ne lisent, n'écrivent ni
--       ne suppriment, sur aucune des deux tables (connu-négatif sous le rôle réel).
--   P2. L'adresse : https seulement, bornée, UNIQUE (un appareil, une ligne).
--   P3. Une vente, un signal : la seconde réservation ne rend aucune ligne.
--   P4. La suppression du compte efface ses abonnements ; celle de la commande, sa réservation.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000c6901', 'p.vendeur@test.local'),
  ('00000000-0000-0000-0000-0000000c6902', 'p.acheteur@test.local');
delete from profiles where id in ('00000000-0000-0000-0000-0000000c6901', '00000000-0000-0000-0000-0000000c6902');
insert into profiles (id, display_name, role) values
  ('00000000-0000-0000-0000-0000000c6901', 'Vendeur P', 'creator'),
  ('00000000-0000-0000-0000-0000000c6902', 'Acheteur P', 'buyer');
insert into products (id, seller_id, slug, title, price_htg, kind, status) values
  ('00000000-0000-0000-0000-0000000c6910', '00000000-0000-0000-0000-0000000c6901', 'radio-p', 'Radio P', 1500, 'physical', 'published');
insert into orders (id, buyer_id, product_id, amount_htg, status) values
  ('00000000-0000-0000-0000-0000000c6920', '00000000-0000-0000-0000-0000000c6902', '00000000-0000-0000-0000-0000000c6910', 1500, 'paid');

-- Connu-positif (service) : l'inscription passe.
insert into zabelie_push_abonnements (user_id, endpoint)
  values ('00000000-0000-0000-0000-0000000c6901', 'https://fcm.googleapis.com/fcm/send/appareil-1');

-- ── P1 — aucun droit client, sous les rôles réels ──────────────────────────
do $$
declare
  v_role text;
  v_t text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    foreach v_t in array array['zabelie_push_abonnements', 'zabelie_push_ventes'] loop
      if has_table_privilege(v_role, 'public.' || v_t, 'SELECT') or has_table_privilege(v_role, 'public.' || v_t, 'INSERT')
         or has_table_privilege(v_role, 'public.' || v_t, 'UPDATE') or has_table_privilege(v_role, 'public.' || v_t, 'DELETE') then
        raise exception 'P1: % garde un droit sur %', v_role, v_t;
      end if;
    end loop;
  end loop;
end $$;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000c6901';
do $$ begin
  begin
    perform 1 from zabelie_push_abonnements;
    raise exception 'P1: un compte lit les abonnements, même les siens';
  exception when insufficient_privilege then null; end;
  begin
    insert into zabelie_push_abonnements (user_id, endpoint)
      values ('00000000-0000-0000-0000-0000000c6901', 'https://fcm.googleapis.com/fcm/send/direct');
    raise exception 'P1: un compte s''inscrit sans passer par la route';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin raise notice 'P1 OK — aucun droit client sur les deux tables'; end $$;

-- ── P2 — l'adresse ─────────────────────────────────────────────────────────
do $$
declare
  v_mauvaise text;
begin
  foreach v_mauvaise in array array['http://fcm.googleapis.com/x', 'ftp://exemple', 'https://' || repeat('a', 2050)] loop
    begin
      insert into zabelie_push_abonnements (user_id, endpoint) values ('00000000-0000-0000-0000-0000000c6901', v_mauvaise);
      raise exception 'P2: adresse acceptée : %', left(v_mauvaise, 40);
    exception when check_violation then null; end;
  end loop;
  begin
    insert into zabelie_push_abonnements (user_id, endpoint)
      values ('00000000-0000-0000-0000-0000000c6902', 'https://fcm.googleapis.com/fcm/send/appareil-1');
    raise exception 'P2: un même appareil inscrit deux fois';
  exception when unique_violation then null; end;
  raise notice 'P2 OK — https borné, un appareil une ligne';
end $$;

-- ── P3 — une vente, un signal ──────────────────────────────────────────────
do $$
declare
  v_n integer;
begin
  insert into zabelie_push_ventes (order_id) values ('00000000-0000-0000-0000-0000000c6920') on conflict (order_id) do nothing;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'P3: la première réservation n''a pas pris'; end if;
  insert into zabelie_push_ventes (order_id) values ('00000000-0000-0000-0000-0000000c6920') on conflict (order_id) do nothing;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'P3: un rejeu a réservé une seconde fois'; end if;
  raise notice 'P3 OK — la seconde réservation ne rend rien';
end $$;

-- ── P4 — effacements en cascade ────────────────────────────────────────────
do $$ begin
  delete from orders where id = '00000000-0000-0000-0000-0000000c6920';
  if exists (select 1 from zabelie_push_ventes where order_id = '00000000-0000-0000-0000-0000000c6920') then
    raise exception 'P4: la réservation survit à la commande';
  end if;
  delete from auth.users where id = '00000000-0000-0000-0000-0000000c6901';
  if exists (select 1 from zabelie_push_abonnements where user_id = '00000000-0000-0000-0000-0000000c6901') then
    raise exception 'P4: les abonnements survivent au compte';
  end if;
  raise notice 'P4 OK — compte et commande emportent leurs lignes';
end $$;

rollback;
