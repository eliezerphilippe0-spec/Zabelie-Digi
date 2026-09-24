-- Studio Créatif : images payantes, prélevées au retrait (0119, docs/62 §10).
-- Usage : psql "$DATABASE_URL" -f supabase/tests/studio_facturation.test.sql
--
--   F1. Gratuite : jamais facturée, même avec un prix consenti.
--   F2. Au-delà du gratuit : sans consentement ou à un prix périmé → refus
--       `studio_paiement_requis` ; au prix exact → inscrite.
--   F3. On ne paie que le livré : generating et failed ne créent aucune dette ;
--       completed en crée UNE, liée à la génération.
--   F4. Le garde ZB071 protège le motif et la référence.
--   F5. Le retrait existant (0079) prélève la dette Studio, sans modification.
--   F6. Valeurs par défaut posées par 0119.

begin;

-- F6 d'abord, avant que le test ne touche la configuration.
do $$
declare c zabelie_studio_config%rowtype;
begin
  select * into c from zabelie_studio_config;
  assert c.gratuit_jour = 3 and c.prix_image_htg = 10 and c.quota_vendeur_jour = 20 and c.quota_global_jour = 200,
    format('F6: défauts inattendus %s', row_to_json(c));
end $$;

insert into auth.users(id, email) values ('11900000-0000-4000-8000-000000000001', 'studio-paye@test.local');
update profiles set role = 'creator' where id = '11900000-0000-4000-8000-000000000001';
insert into products(id, seller_id, slug, title, kind, price_htg, status) values
 ('11900000-0000-4000-8000-000000000010', '11900000-0000-4000-8000-000000000001', 'studio-paye', 'Studio payé', 'physical', 1000, 'published');
insert into wallets (id, owner_id, balance_htg) values
 ('11900000-0000-4000-8000-0000000000d1', '11900000-0000-4000-8000-000000000001', 1000);
insert into wallet_transactions (wallet_id, type, amount_htg, idempotency_key, reference) values
 ('11900000-0000-4000-8000-0000000000d1', 'credit', 1000, 'seed:studio-paye', 'seed');

-- Une gratuite par jour, 10 HTG ensuite.
update zabelie_studio_config set gratuit_jour = 1, prix_image_htg = 10, quota_vendeur_jour = 5, quota_global_jour = 100;

do $$
declare
  s uuid := '11900000-0000-4000-8000-000000000001';
  p uuid := '11900000-0000-4000-8000-000000000010';
  g_free uuid; g_paid uuid; g_fail uuid;
  v_prix integer;
  n bigint;
  v_res jsonb;
begin
  -- F1 : la première est gratuite, même si le client a envoyé un prix.
  insert into zabelie_creative_generations(seller_id, product_id, idempotency_key, brief_index, format, prompt, rule_version, provider, prix_htg)
  values (s, p, gen_random_uuid(), 0, '1:1', 'p', 'R-STUDIO-01', 'higgsfield', 10) returning id, prix_htg into g_free, v_prix;
  assert v_prix = 0, format('F1: gratuite facturée %s', v_prix);
  insert into zabelie_creative_events(generation_id, etat, provider_ref) values (g_free, 'generating', 'r_free');
  insert into zabelie_creative_events(generation_id, etat, image_url) values (g_free, 'completed', 'https://cdn.test/free.png');
  select count(*) into n from zabelie_ai_surplus where seller_id = s;
  assert n = 0, format('F1: %s dette(s) pour une gratuite', n);

  -- F2 : sans consentement, puis à un prix périmé → refus nommé.
  begin
    insert into zabelie_creative_generations(seller_id, product_id, idempotency_key, brief_index, format, prompt, rule_version, provider)
    values (s, p, gen_random_uuid(), 1, '3:4', 'p', 'R-STUDIO-01', 'higgsfield');
    raise exception 'F2a: payante sans consentement acceptée';
  exception when raise_exception then
    assert sqlerrm = 'studio_paiement_requis', 'F2a: ' || sqlerrm;
  end;
  begin
    insert into zabelie_creative_generations(seller_id, product_id, idempotency_key, brief_index, format, prompt, rule_version, provider, prix_htg)
    values (s, p, gen_random_uuid(), 1, '3:4', 'p', 'R-STUDIO-01', 'higgsfield', 5);
    raise exception 'F2b: prix périmé accepté';
  exception when raise_exception then
    assert sqlerrm = 'studio_paiement_requis', 'F2b: ' || sqlerrm;
  end;
  insert into zabelie_creative_generations(seller_id, product_id, idempotency_key, brief_index, format, prompt, rule_version, provider, prix_htg)
  values (s, p, gen_random_uuid(), 1, '3:4', 'p', 'R-STUDIO-01', 'higgsfield', 10) returning id, prix_htg into g_paid, v_prix;
  assert v_prix = 10, format('F2c: prix figé %s', v_prix);

  -- F3 : generating ne facture pas ; completed facture une fois.
  insert into zabelie_creative_events(generation_id, etat, provider_ref) values (g_paid, 'generating', 'r_paid');
  select count(*) into n from zabelie_ai_surplus where seller_id = s;
  assert n = 0, 'F3a: dette née avant la livraison';
  insert into zabelie_creative_events(generation_id, etat, image_url) values (g_paid, 'completed', 'https://cdn.test/paid.png');
  select count(*) into n from zabelie_ai_surplus
   where seller_id = s and motif = 'studio_image' and objet_ref = g_paid and prix_htg = 10 and settled_at is null;
  assert n = 1, format('F3b: %s dette(s) studio pour la livraison', n);
  begin
    insert into zabelie_creative_events(generation_id, etat, detail) values (g_paid, 'failed', 'apres_coup');
    raise exception 'F3c: second état final accepté';
  exception when unique_violation then null; end;
  -- Une payante qui échoue ne coûte rien.
  insert into zabelie_creative_generations(seller_id, product_id, idempotency_key, brief_index, format, prompt, rule_version, provider, prix_htg)
  values (s, p, gen_random_uuid(), 2, '9:16', 'p', 'R-STUDIO-01', 'higgsfield', 10) returning id into g_fail;
  insert into zabelie_creative_events(generation_id, etat, provider_ref) values (g_fail, 'generating', 'r_fail');
  insert into zabelie_creative_events(generation_id, etat, detail) values (g_fail, 'failed', 'http_422');
  select count(*) into n from zabelie_ai_surplus where seller_id = s;
  assert n = 1, format('F3d: %s dette(s), une seule attendue', n);
  -- Une dette studio en double pour la même génération est refusée.
  begin
    insert into zabelie_ai_surplus(seller_id, prix_htg, motif, objet_ref) values (s, 10, 'studio_image', g_paid);
    raise exception 'F3e: double facturation acceptée';
  exception when unique_violation then null; end;

  -- F4 : le motif et la référence ne se réécrivent pas. Chaque tentative
  -- porte AUSSI un règlement valide : sans lui, la dernière règle de ZB071
  -- (« seul le règlement est permis ») refuserait tout, et le test passerait
  -- sans que le contrôle du motif ou de la référence n'ait joué.
  begin
    -- Le motif SEUL : sa réécriture est refusée deux fois, par ZB071 puis
    -- par la contrainte motif/référence. La mutation qui retire la garde du
    -- motif tombe donc sur la contrainte, et ce test rougit par elle.
    update zabelie_ai_surplus set motif = 'ia_description',
           settled_at = now(), settlement_ref = 'test' where objet_ref = g_paid;
    raise exception 'F4a: motif réécrit';
  exception when raise_exception then
    assert sqlerrm like 'ZB071%', 'F4a: ' || sqlerrm;
  end;
  begin
    update zabelie_ai_surplus set objet_ref = g_free,
           settled_at = now(), settlement_ref = 'test' where objet_ref = g_paid;
    raise exception 'F4b: référence réécrite';
  exception when raise_exception then
    assert sqlerrm like 'ZB071%', 'F4b: ' || sqlerrm;
  end;

  -- F5 : le retrait prélève la dette Studio.
  v_res := zabelie_request_payout(s, 500);
  assert (v_res->>'ok')::boolean, format('F5: retrait refusé %s', v_res);
  assert (v_res->>'frais_ia_regles_htg')::int = 10, format('F5: frais réglés %s', v_res);
  assert (select balance_htg from wallets where owner_id = s) = 1000 - 500 - 10, 'F5: solde';
  assert exists (select 1 from zabelie_ai_surplus where objet_ref = g_paid and settled_at is not null
                   and settlement_ref = 'payout:' || (v_res->>'payout_id')), 'F5: dette non réglée';

  raise notice 'OK — F1 gratuite ; F2 consentement au prix exact ; F3 facturé à la livraison, une fois ; F4 ZB071 ; F5 prélevé au retrait ; F6 défauts';
end $$;

rollback;
