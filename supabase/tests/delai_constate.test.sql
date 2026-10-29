-- Tests du délai constaté (0165). Transaction annulée à la fin.
--
--   E1. Sous le seuil (config), la médiane est NULL : le nombre de commandes sort,
--       le délai non. Le seuil vient de la config, pas du code.
--   E2. Au seuil, la médiane est celle des réceptions CONFIRMÉES ; avec un nombre
--       pair, elle s'interpole ; elle est arrondie à l'heure, jamais à zéro.
--   E3. Une réception AUTOMATIQUE n'est pas comptée (elle mesure la plateforme, pas
--       le vendeur) ; une commande pas encore reçue non plus.
--   E4. La fenêtre vient de la config : une réception de 200 jours est ignorée à
--       180 jours et reprise à 365.
--   E5. Les commandes d'un AUTRE vendeur ne comptent pas ; un vendeur sans vente
--       rend 0 commande et NULL.
--   E6. Une horloge qui recule (réception avant le paiement) n'est pas un délai.
--   E7. Aucun droit client sur la fonction ; elle est en lecture seule (`stable`) ;
--       le seuil et la fenêtre sont en config.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000c6501', 'e.vendeur@test.local'),
  ('00000000-0000-0000-0000-0000000c6502', 'e.acheteur@test.local'),
  ('00000000-0000-0000-0000-0000000c6503', 'e.autre@test.local'),
  ('00000000-0000-0000-0000-0000000c6504', 'e.rapide@test.local');
delete from profiles where id in (select id from auth.users);
insert into profiles (id, display_name, role) values
  ('00000000-0000-0000-0000-0000000c6501', 'Vendeur E', 'creator'),
  ('00000000-0000-0000-0000-0000000c6502', 'Acheteur E', 'buyer'),
  ('00000000-0000-0000-0000-0000000c6503', 'Autre vendeur E', 'creator'),
  ('00000000-0000-0000-0000-0000000c6504', 'Vendeur rapide E', 'creator');

insert into products (id, seller_id, slug, title, price_htg, kind, status) values
  ('00000000-0000-0000-0000-0000000c6510', '00000000-0000-0000-0000-0000000c6501', 'filtre-e', 'Filtre E', 2000, 'physical', 'published'),
  ('00000000-0000-0000-0000-0000000c6511', '00000000-0000-0000-0000-0000000c6503', 'autre-e', 'Autre E', 2000, 'physical', 'published'),
  ('00000000-0000-0000-0000-0000000c6512', '00000000-0000-0000-0000-0000000c6504', 'rapide-e', 'Rapide E', 2000, 'physical', 'published');

do $$
declare
  v_seller uuid := '00000000-0000-0000-0000-0000000c6501';
  v_other  uuid := '00000000-0000-0000-0000-0000000c6503';
  v_fast   uuid := '00000000-0000-0000-0000-0000000c6504';
  v_buyer  uuid := '00000000-0000-0000-0000-0000000c6502';
  v_o      uuid;
  v_n      integer; v_med integer; v_seuil integer;
  i        integer;
  v_heures integer[] := array[10, 20, 30, 40];
begin
  -- Quatre réceptions confirmées du vendeur : 10, 20, 30, 40 heures après le paiement.
  for i in 1..4 loop
    v_o := ('00000000-0000-0000-0000-0000000c65' || lpad((20 + i)::text, 2, '0'))::uuid;
    insert into orders (id, buyer_id, product_id, amount_htg, status)
      values (v_o, v_buyer, '00000000-0000-0000-0000-0000000c6510', 2000, 'paid');
    perform zabelie_open_fulfillment(v_o);
    update zabelie_fulfillment
       set status = 'received', shipped_at = now() - interval '5 days',
           created_at = now() - interval '5 days',
           received_at = now() - interval '5 days' + make_interval(hours => v_heures[i]),
           auto_received = false, received_by = v_buyer
     where order_id = v_o;
  end loop;

  -- ── E1 — sous le seuil (5 par défaut) : le nombre sort, le délai non ────────
  select d.nb, d.mediane_heures into v_n, v_med from zabelie_delai_constate(v_seller) d;
  if v_n <> 4 then raise exception 'E1: nb attendu 4, lu %', v_n; end if;
  if v_med is not null then raise exception 'E1: une médiane est sortie sous le seuil (%)', v_med; end if;
  select d.seuil into v_seuil from zabelie_delai_constate(v_seller) d;
  if v_seuil <> 5 then raise exception 'E1: le seuil rendu doit être celui de la config (5), lu %', v_seuil; end if;

  -- Le seuil est en CONFIG : à 4, la même donnée donne une médiane (10,20,30,40 → 25).
  update zabelie_fulfillment_limits set value = 4 where key = 'delay_min_samples';
  select d.nb, d.mediane_heures into v_n, v_med from zabelie_delai_constate(v_seller) d;
  if v_med is distinct from 25 then raise exception 'E1/E2: médiane paire attendue 25 (interpolée), lue %', v_med; end if;
  select d.seuil into v_seuil from zabelie_delai_constate(v_seller) d;
  if v_seuil <> 4 then raise exception 'E1: le seuil rendu ne suit pas la config (4), lu %', v_seuil; end if;
  update zabelie_fulfillment_limits set value = 5 where key = 'delay_min_samples';

  -- ── E2 — au seuil : cinquième réception, 50 h → médiane 30 ────────────────
  v_o := '00000000-0000-0000-0000-0000000c6525';
  insert into orders (id, buyer_id, product_id, amount_htg, status)
    values (v_o, v_buyer, '00000000-0000-0000-0000-0000000c6510', 2000, 'paid');
  perform zabelie_open_fulfillment(v_o);
  update zabelie_fulfillment
     set status = 'received', shipped_at = now() - interval '5 days', created_at = now() - interval '5 days',
         received_at = now() - interval '5 days' + interval '50 hours', auto_received = false, received_by = v_buyer
   where order_id = v_o;
  select d.nb, d.mediane_heures into v_n, v_med from zabelie_delai_constate(v_seller) d;
  if v_n <> 5 or v_med is distinct from 30 then raise exception 'E2: attendu (5, 30), lu (%, %)', v_n, v_med; end if;

  -- ── E3 — une réception AUTOMATIQUE ne compte pas ; une commande non reçue non plus ──
  v_o := '00000000-0000-0000-0000-0000000c6526';
  insert into orders (id, buyer_id, product_id, amount_htg, status)
    values (v_o, v_buyer, '00000000-0000-0000-0000-0000000c6510', 2000, 'paid');
  perform zabelie_open_fulfillment(v_o);
  update zabelie_fulfillment
     set status = 'received', shipped_at = now() - interval '9 days', created_at = now() - interval '9 days',
         received_at = now() - interval '1 day', auto_received = true
   where order_id = v_o;
  v_o := '00000000-0000-0000-0000-0000000c6527';
  insert into orders (id, buyer_id, product_id, amount_htg, status)
    values (v_o, v_buyer, '00000000-0000-0000-0000-0000000c6510', 2000, 'paid');
  perform zabelie_open_fulfillment(v_o);
  perform zabelie_declare_shipment(v_o, v_seller, 'en route');
  select d.nb, d.mediane_heures into v_n, v_med from zabelie_delai_constate(v_seller) d;
  if v_n <> 5 or v_med is distinct from 30 then
    raise exception 'E3: la réception automatique ou la commande non reçue a été comptée (%, %)', v_n, v_med;
  end if;

  -- ── E4 — la fenêtre vient de la config ────────────────────────────────────
  v_o := '00000000-0000-0000-0000-0000000c6528';
  insert into orders (id, buyer_id, product_id, amount_htg, status)
    values (v_o, v_buyer, '00000000-0000-0000-0000-0000000c6510', 2000, 'paid');
  perform zabelie_open_fulfillment(v_o);
  update zabelie_fulfillment
     set status = 'received', shipped_at = now() - interval '201 days', created_at = now() - interval '201 days',
         received_at = now() - interval '200 days', auto_received = false, received_by = v_buyer
   where order_id = v_o;   -- 24 h de délai, il y a 200 jours
  select d.nb into v_n from zabelie_delai_constate(v_seller) d;
  if v_n <> 5 then raise exception 'E4: une réception de 200 jours a été prise à 180 jours (nb %)', v_n; end if;
  update zabelie_fulfillment_limits set value = 365 where key = 'delay_window_days';
  select d.nb into v_n from zabelie_delai_constate(v_seller) d;
  if v_n <> 6 then raise exception 'E4: la fenêtre de la config n''est pas lue (nb %)', v_n; end if;
  update zabelie_fulfillment_limits set value = 180 where key = 'delay_window_days';

  -- ── E5 — un autre vendeur ne pèse pas ; un vendeur sans vente rend 0 / NULL ──
  v_o := '00000000-0000-0000-0000-0000000c6530';
  insert into orders (id, buyer_id, product_id, amount_htg, status)
    values (v_o, v_buyer, '00000000-0000-0000-0000-0000000c6511', 2000, 'paid');
  perform zabelie_open_fulfillment(v_o);
  update zabelie_fulfillment
     set status = 'received', shipped_at = now() - interval '2 days', created_at = now() - interval '2 days',
         received_at = now() - interval '1 day', auto_received = false, received_by = v_buyer
   where order_id = v_o;
  select d.nb into v_n from zabelie_delai_constate(v_seller) d;
  if v_n <> 5 then raise exception 'E5: la vente d''un AUTRE vendeur a été comptée (nb %)', v_n; end if;
  select d.nb, d.mediane_heures into v_n, v_med from zabelie_delai_constate(v_other) d;
  if v_n <> 1 or v_med is not null then raise exception 'E5: un vendeur à une vente doit rendre (1, NULL), lu (%, %)', v_n, v_med; end if;
  select d.nb, d.mediane_heures into v_n, v_med from zabelie_delai_constate('00000000-0000-0000-0000-0000000c65ff') d;
  if v_n <> 0 or v_med is not null then raise exception 'E5: un vendeur inconnu doit rendre (0, NULL), lu (%, %)', v_n, v_med; end if;

  -- ── E2 (bis) — jamais zéro : cinq réceptions à six minutes → 1 heure ──────
  for i in 1..5 loop
    v_o := ('00000000-0000-0000-0000-0000000c65' || lpad((40 + i)::text, 2, '0'))::uuid;
    insert into orders (id, buyer_id, product_id, amount_htg, status)
      values (v_o, v_buyer, '00000000-0000-0000-0000-0000000c6512', 2000, 'paid');
    perform zabelie_open_fulfillment(v_o);
    update zabelie_fulfillment
       set status = 'received', shipped_at = now() - interval '1 day', created_at = now() - interval '1 day',
           received_at = now() - interval '1 day' + interval '6 minutes', auto_received = false, received_by = v_buyer
     where order_id = v_o;
  end loop;
  select d.mediane_heures into v_med from zabelie_delai_constate(v_fast) d;
  if v_med is distinct from 1 then raise exception 'E2bis: un délai de six minutes doit s''afficher 1 h, pas % ', v_med; end if;

  -- ── E6 — une horloge qui recule n'est pas un délai ────────────────────────
  v_o := '00000000-0000-0000-0000-0000000c6550';
  insert into orders (id, buyer_id, product_id, amount_htg, status)
    values (v_o, v_buyer, '00000000-0000-0000-0000-0000000c6512', 2000, 'paid');
  perform zabelie_open_fulfillment(v_o);
  update zabelie_fulfillment
     set status = 'received', shipped_at = now() - interval '1 day', created_at = now() - interval '1 day',
         received_at = now() - interval '3 days', auto_received = false, received_by = v_buyer
   where order_id = v_o;
  select d.nb into v_n from zabelie_delai_constate(v_fast) d;
  if v_n <> 5 then raise exception 'E6: une réception antérieure au paiement a été comptée (nb %)', v_n; end if;

  -- ── E7 — droits, lecture seule, config ────────────────────────────────────
  if has_function_privilege('anon', 'zabelie_delai_constate(uuid)', 'execute')
     or has_function_privilege('authenticated', 'zabelie_delai_constate(uuid)', 'execute') then
    raise exception 'E7: la fonction est exécutable par un rôle client';
  end if;
  if (select provolatile from pg_proc where oid = 'zabelie_delai_constate(uuid)'::regprocedure) <> 's' then
    raise exception 'E7: la fonction n''est pas en lecture seule (stable)';
  end if;
  if (select count(*) from zabelie_fulfillment_limits where key in ('delay_min_samples', 'delay_window_days')) <> 2 then
    raise exception 'E7: seuil et fenêtre absents de la config';
  end if;
end $$;

rollback;
