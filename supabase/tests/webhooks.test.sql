-- Tests des webhooks sortants (0122). Transaction annulée à la fin.
--
--   W1. Connu-POSITIF : paid → un envoi `sale.paid` complet ; refunded →
--       `sale.refunded` ; aucun doublon sur rejeu.
--   W2. Ciblage : autre vendeur, point désactivé, événement non souscrit,
--       statut sans événement → rien.
--   W3. Un échec d'enfilement ne bloque JAMAIS le paiement.
--   W4. Réclamation et résultat : bail, relances, `dead` à 6, désactivation
--       après 3 `dead` d'affilée, remise à zéro sur succès, test hors compte.
--   W5. Plafond de 3 points actifs ; adresse et secret immuables.
--   W6. RLS : le vendeur lit ses points et envois, JAMAIS le secret ; l'autre
--       vendeur ne voit rien ; anon et authenticated n'exécutent rien.
--   W7. Purge : seuls les envois clos de plus de 30 jours partent.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000d0001', 'w.vande@test.local'),
  ('00000000-0000-0000-0000-0000000d0002', 'w.acheteur@test.local'),
  ('00000000-0000-0000-0000-0000000d0003', 'w.lot@test.local');
insert into profiles (id, display_name) values
  ('00000000-0000-0000-0000-0000000d0001', 'Vandè Webhook'),
  ('00000000-0000-0000-0000-0000000d0002', 'Achtè'),
  ('00000000-0000-0000-0000-0000000d0003', 'Lòt Vandè')
on conflict (id) do nothing;
insert into products (id, seller_id, slug, title, description, price_htg, kind, status, category) values
  ('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-0000000d0001', 'wh-ebook', 'E-book', 'T', 1500, 'fichier', 'published', 'Design'),
  ('00000000-0000-0000-0000-0000000e0003', '00000000-0000-0000-0000-0000000d0003', 'wh-lot', 'Lòt', 'T', 900, 'fichier', 'published', 'Design');

insert into zabelie_webhook_endpoints (id, seller_id, url, secret) values
  ('00000000-0000-0000-0000-0000000f0001', '00000000-0000-0000-0000-0000000d0001', 'https://boutik.example/hooks/zabelie', 'whsec_' || repeat('a', 43));
insert into zabelie_webhook_endpoints (id, seller_id, url, secret, events) values
  ('00000000-0000-0000-0000-0000000f0002', '00000000-0000-0000-0000-0000000d0001', 'https://boutik.example/rembou', 'whsec_' || repeat('b', 43), array['sale.refunded']);

-- ── W1 ──────────────────────────────────────────────────────────────────────
do $$
declare v_order uuid; v_p jsonb; n integer;
begin
  insert into orders (buyer_id, product_id, amount_htg, status)
  values ('00000000-0000-0000-0000-0000000d0002', '00000000-0000-0000-0000-0000000e0001', 1500, 'pending')
  returning id into v_order;
  if exists (select 1 from zabelie_webhook_deliveries where order_id = v_order) then
    raise exception 'W1 KO : envoi créé pour une commande en attente';
  end if;

  update orders set status = 'paid' where id = v_order;
  select count(*) into n from zabelie_webhook_deliveries where order_id = v_order;
  if n <> 1 then raise exception 'W1 KO : % envoi(s) sur paid, attendu 1 (le point « remboursement seul » ne doit rien recevoir)', n; end if;
  select payload into v_p from zabelie_webhook_deliveries where order_id = v_order;
  if v_p->>'type' <> 'sale.paid' or (v_p->'data'->>'amount_htg')::int <> 1500 or v_p->'data'->>'currency' <> 'HTG'
     or v_p->'data'->>'order_ref' is null or (v_p->>'id') is null or v_p->'data' ? 'buyer_id' then
    raise exception 'W1 KO : charge utile inattendue %', v_p;
  end if;

  -- Rejeu : repasser par pending puis paid ne double pas l'événement.
  update orders set status = 'pending' where id = v_order;
  update orders set status = 'paid' where id = v_order;
  select count(*) into n from zabelie_webhook_deliveries where order_id = v_order and event_type = 'sale.paid';
  if n <> 1 then raise exception 'W1 KO : % sale.paid après rejeu', n; end if;

  update orders set status = 'refunded' where id = v_order;
  select count(*) into n from zabelie_webhook_deliveries where order_id = v_order and event_type = 'sale.refunded';
  if n <> 2 then raise exception 'W1 KO : % sale.refunded, attendu 2 (deux points souscrits)', n; end if;
  raise notice 'W1 OK — paid et refunded enfilés, sans doublon, sans donnée acheteur';
end $$;

-- ── W2 ──────────────────────────────────────────────────────────────────────
do $$
declare v_order uuid; v_autre uuid;
begin
  insert into orders (buyer_id, product_id, amount_htg, status)
  values ('00000000-0000-0000-0000-0000000d0002', '00000000-0000-0000-0000-0000000e0003', 900, 'pending')
  returning id into v_autre;
  update orders set status = 'paid' where id = v_autre;
  if exists (select 1 from zabelie_webhook_deliveries where order_id = v_autre) then
    raise exception 'W2 KO : la vente d''un autre vendeur est partie vers ce vendeur';
  end if;

  update zabelie_webhook_endpoints set disabled_at = now(), disabled_reason = 'seller'
   where id = '00000000-0000-0000-0000-0000000f0001';
  insert into orders (buyer_id, product_id, amount_htg, status)
  values ('00000000-0000-0000-0000-0000000d0002', '00000000-0000-0000-0000-0000000e0001', 1500, 'pending')
  returning id into v_order;
  update orders set status = 'paid' where id = v_order;
  update orders set status = 'disputed' where id = v_order;
  if exists (select 1 from zabelie_webhook_deliveries where order_id = v_order) then
    raise exception 'W2 KO : envoi vers un point désactivé, non souscrit, ou sur disputed';
  end if;
  raise notice 'W2 OK — ciblage par vendeur, état et souscription';
end $$;

-- ── W3 ──────────────────────────────────────────────────────────────────────
do $$
declare v_order uuid;
begin
  insert into zabelie_webhook_endpoints (seller_id, url, secret)
  values ('00000000-0000-0000-0000-0000000d0001', 'https://boutik.example/w3', 'whsec_' || repeat('c', 43));
  -- On force l'enfilement à échouer.
  alter table zabelie_webhook_deliveries add constraint w3_force_echec check (false) not valid;
  insert into orders (buyer_id, product_id, amount_htg, status)
  values ('00000000-0000-0000-0000-0000000d0002', '00000000-0000-0000-0000-0000000e0001', 1500, 'pending')
  returning id into v_order;
  update orders set status = 'paid' where id = v_order;
  if (select status from orders where id = v_order) <> 'paid' then
    raise exception 'W3 KO : la commande n''est pas payée';
  end if;
  alter table zabelie_webhook_deliveries drop constraint w3_force_echec;
  raise notice 'W3 OK — l''échec d''enfilement laisse passer le paiement';
end $$;

-- ── W4 ──────────────────────────────────────────────────────────────────────
do $$
declare v_ep uuid; v_d uuid; r record; i integer; v_res text;
begin
  insert into zabelie_webhook_endpoints (seller_id, url, secret)
  values ('00000000-0000-0000-0000-0000000d0003', 'https://lot.example/h', 'whsec_' || repeat('d', 43))
  returning id into v_ep;

  -- Trois événements qui vont mourir, un par un.
  for i in 1..3 loop
    insert into zabelie_webhook_deliveries (endpoint_id, event_id, event_type, payload)
    values (v_ep, gen_random_uuid(), 'sale.paid', '{}'::jsonb) returning id into v_d;

    select * into r from zabelie_webhook_claim(100) c where c.delivery_id = v_d;
    if r.delivery_id is null or r.url <> 'https://lot.example/h' or r.secret <> 'whsec_' || repeat('d', 43) or r.attempts <> 1 then
      raise exception 'W4 KO : réclamation inattendue %', r;
    end if;
    if exists (select 1 from zabelie_webhook_claim(100) c where c.delivery_id = v_d) then
      raise exception 'W4 KO : un envoi sous bail réclamé deux fois';
    end if;

    v_res := zabelie_webhook_record(v_d, false, 500, 'erreur serveur');
    if v_res <> 'pending' or (select next_attempt_at from zabelie_webhook_deliveries where id = v_d) < now() + interval '50 seconds' then
      raise exception 'W4 KO : première relance mal planifiée (%)', v_res;
    end if;
    loop
      update zabelie_webhook_deliveries set next_attempt_at = now() - interval '1 second' where id = v_d;
      perform 1 from zabelie_webhook_claim(100) c where c.delivery_id = v_d;
      v_res := zabelie_webhook_record(v_d, false, null, 'timeout');
      exit when v_res <> 'pending';
    end loop;
    if v_res <> 'dead' or (select attempts from zabelie_webhook_deliveries where id = v_d) <> 6 then
      raise exception 'W4 KO : mort après % tentatives (%)', (select attempts from zabelie_webhook_deliveries where id = v_d), v_res;
    end if;
  end loop;

  if (select disabled_reason from zabelie_webhook_endpoints where id = v_ep) is distinct from 'echecs' then
    raise exception 'W4 KO : point non désactivé après 3 morts d''affilée';
  end if;

  -- Un point sain : un succès remet le compteur à zéro.
  insert into zabelie_webhook_endpoints (seller_id, url, secret)
  values ('00000000-0000-0000-0000-0000000d0003', 'https://lot.example/ok', 'whsec_' || repeat('e', 43))
  returning id into v_ep;
  update zabelie_webhook_endpoints set consecutive_dead = 2 where id = v_ep;
  insert into zabelie_webhook_deliveries (endpoint_id, event_id, event_type, payload)
  values (v_ep, gen_random_uuid(), 'webhook.test', '{}'::jsonb) returning id into v_d;
  perform 1 from zabelie_webhook_claim(100) c where c.delivery_id = v_d;
  -- Deux instructions : dans un seul OR, Postgres ne garantit pas que l'appel
  -- passe AVANT la lecture du compteur.
  v_res := zabelie_webhook_record(v_d, true, 200, null);
  if v_res <> 'delivered' or (select consecutive_dead from zabelie_webhook_endpoints where id = v_ep) <> 0 then
    raise exception 'W4 KO : succès non enregistré ou compteur non remis à zéro';
  end if;
  raise notice 'W4 OK — bail, relances, mort à 6, désactivation à 3, remise à zéro';
end $$;

-- ── W5 ──────────────────────────────────────────────────────────────────────
do $$
begin
  -- Le vendeur 3 a UN point actif (`/ok`) ; deux de plus atteignent le plafond.
  insert into zabelie_webhook_endpoints (seller_id, url, secret) values
    ('00000000-0000-0000-0000-0000000d0003', 'https://lot.example/2', 'whsec_' || repeat('h', 43)),
    ('00000000-0000-0000-0000-0000000d0003', 'https://lot.example/3', 'whsec_' || repeat('i', 43));
  begin
    insert into zabelie_webhook_endpoints (seller_id, url, secret)
    values ('00000000-0000-0000-0000-0000000d0003', 'https://lot.example/trop', 'whsec_' || repeat('f', 43));
    raise exception 'W5 KO : 4ᵉ point actif accepté';
  exception when sqlstate 'ZB122' then null;
  end;
  begin
    update zabelie_webhook_endpoints set url = 'https://ailleurs.example/' where url = 'https://lot.example/ok';
    raise exception 'W5 KO : adresse modifiée';
  exception when sqlstate 'ZB122' then null;
  end;
  begin
    insert into zabelie_webhook_endpoints (seller_id, url, secret)
    values ('00000000-0000-0000-0000-0000000d0002', 'http://pas-tls.example/', 'whsec_' || repeat('g', 43));
    raise exception 'W5 KO : adresse http acceptée';
  exception when check_violation then null;
  end;
  begin
    insert into zabelie_webhook_endpoints (seller_id, url, secret)
    values ('00000000-0000-0000-0000-0000000d0002', 'https://user:pass@x.example/', 'whsec_' || repeat('g', 43));
    raise exception 'W5 KO : identifiants dans l''adresse acceptés';
  exception when check_violation then null;
  end;
  raise notice 'W5 OK — plafond, immuabilité, https seul';
end $$;

-- ── W6 ──────────────────────────────────────────────────────────────────────
do $$
declare n integer; s text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000d0001';
  select count(*) into n from zabelie_webhook_endpoints;
  if n <> 3 then raise exception 'W6 KO : le vendeur voit % point(s), attendu 3', n; end if;
  select count(*) into n from zabelie_webhook_deliveries;
  if n < 3 then raise exception 'W6 KO : le vendeur voit % envoi(s)', n; end if;
  begin
    select secret into s from zabelie_webhook_endpoints limit 1;
    raise exception 'W6 KO : le secret est lisible par le vendeur';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from zabelie_webhook_claim(1);
    raise exception 'W6 KO : authenticated exécute la réclamation';
  exception when insufficient_privilege then null;
  end;
  reset role;

  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000d0002';
  select count(*) into n from zabelie_webhook_deliveries;
  if n <> 0 then raise exception 'W6 KO : un tiers voit % envoi(s)', n; end if;
  reset role;

  set local role anon;
  begin
    select count(*) into n from zabelie_webhook_endpoints;
    raise exception 'W6 KO : anon lit les points';
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'W6 OK — lecture des siens sans secret, tiers et anon exclus';
end $$;

-- ── W7 ──────────────────────────────────────────────────────────────────────
do $$
declare v_ep uuid; n integer; v_total integer;
begin
  select id into v_ep from zabelie_webhook_endpoints where url = 'https://lot.example/ok';
  insert into zabelie_webhook_deliveries (endpoint_id, event_id, event_type, payload, status, created_at) values
    (v_ep, gen_random_uuid(), 'webhook.test', '{}', 'delivered', now() - interval '31 days'),
    (v_ep, gen_random_uuid(), 'webhook.test', '{}', 'dead',      now() - interval '31 days'),
    (v_ep, gen_random_uuid(), 'webhook.test', '{}', 'pending',   now() - interval '31 days'),
    (v_ep, gen_random_uuid(), 'webhook.test', '{}', 'delivered', now() - interval '29 days');
  select count(*) into v_total from zabelie_webhook_deliveries;
  n := zabelie_webhook_purge();
  if n <> 2 or (select count(*) from zabelie_webhook_deliveries) <> v_total - 2 then
    raise exception 'W7 KO : % supprimé(s), attendu 2 (clos et vieux de plus de 30 jours)', n;
  end if;
  raise notice 'W7 OK — purge bornée aux envois clos anciens';
end $$;

rollback;
