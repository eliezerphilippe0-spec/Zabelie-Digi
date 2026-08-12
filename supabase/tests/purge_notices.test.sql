-- Tests de la purge des avis envoyés (0056) — connu-positif ET connu-négatif.
-- Transaction annulée : rien ne persiste.
begin;

-- Décor minimal : une commande porteuse (via les stubs du bootstrap), trois
-- avis — un envoyé ANCIEN (purgeable), un envoyé RÉCENT (gardé), un JAMAIS
-- envoyé mais ancien (INTOUCHABLE : travail en cours, c'est le balayage qui
-- décide de son sort).
do $$
declare
  v_buyer uuid := gen_random_uuid();
  v_seller uuid := gen_random_uuid();
  v_product uuid;
  v_order uuid;
  v_restants integer;
  v_purges integer;
begin
  insert into auth.users (id) values (v_buyer), (v_seller);
  -- Le trigger d'inscription (0001) a déjà créé les profils : ne pas doubler.
  insert into profiles (id, display_name) values (v_buyer, 'Achtè'), (v_seller, 'Vandè')
  on conflict (id) do nothing;
  insert into products (id, seller_id, slug, title, price_htg, kind, status)
  values (gen_random_uuid(), v_seller, 'pwodui-tes-purge', 'Pwodui tès', 100, 'physical', 'published')
  returning id into v_product;
  insert into orders (id, buyer_id, product_id, amount_htg, status)
  values (gen_random_uuid(), v_buyer, v_product, 100, 'paid')
  returning id into v_order;

  insert into zabelie_fulfillment_notices (order_id, kind, due_at, sent_at) values
    (v_order, 'shipped_buyer',  now() - interval '200 days', now() - interval '200 days'),
    (v_order, 'reminder_buyer', now() - interval '10 days',  now() - interval '10 days'),
    (v_order, 'auto_received',  now() - interval '200 days', null);

  -- PN1 — connu-positif : l'ancien envoyé part, et lui seul.
  select zabelie_purge_sent_notices(90) into v_purges;
  if v_purges <> 1 then
    raise exception 'PN1: % ligne(s) purgée(s), 1 attendue', v_purges;
  end if;
  select count(*) into v_restants from zabelie_fulfillment_notices where order_id = v_order;
  if v_restants <> 2 then
    raise exception 'PN1: % ligne(s) restante(s), 2 attendues', v_restants;
  end if;
  raise notice 'OK — PN1 seul l''avis envoyé ancien est purgé';

  -- PN2 — connu-négatif : le non-envoyé ancien est toujours là.
  select count(*) into v_restants
  from zabelie_fulfillment_notices
  where order_id = v_order and sent_at is null;
  if v_restants <> 1 then
    raise exception 'PN2: l''avis jamais envoyé a été touché';
  end if;
  raise notice 'OK — PN2 un avis non parti est intouchable par la purge';

  -- PN3 — rejouer ne trouve plus rien : la purge est idempotente.
  select zabelie_purge_sent_notices(90) into v_purges;
  if v_purges <> 0 then
    raise exception 'PN3: rejeu a purgé % ligne(s), 0 attendue', v_purges;
  end if;
  raise notice 'OK — PN3 rejeu à zéro';
end;
$$;

-- PN4 — le plancher est une garde, pas une convention : 7 jours → ZB056.
do $$
begin
  perform zabelie_purge_sent_notices(7);
  raise exception 'PN4: le délai sous plancher aurait du etre refusé';
exception
  when sqlstate 'ZB056' then
    raise notice 'OK — PN4 délai sous 30 j refusé (ZB056)';
end;
$$;

-- PN5 — la fonction est fermée aux clients.
do $$
declare v_droits integer;
begin
  select count(*) into v_droits
  from information_schema.routine_privileges
  where routine_name = 'zabelie_purge_sent_notices'
    and grantee in ('anon', 'authenticated', 'PUBLIC');
  if v_droits > 0 then
    raise exception 'PN5: % droit(s) client sur la purge', v_droits;
  end if;
  raise notice 'OK — PN5 purge réservée au service';
end;
$$;

rollback;
