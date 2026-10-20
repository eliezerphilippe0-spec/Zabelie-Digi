-- Mesure du pilote d'essayage (supabase/analyses/essayage_mesure.sql ; tâche 6.2).
-- La requête d'analyse tourne sur les tables de 0150 et sur les commandes, et
-- rend les chiffres attendus d'un cas construit à la main. Transaction annulée.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000e5001', 'mesure-vendeur@test.local'),
  ('00000000-0000-0000-0000-0000000e5002', 'mesure-a@test.local'),
  ('00000000-0000-0000-0000-0000000e5003', 'mesure-b@test.local'),
  ('00000000-0000-0000-0000-0000000e5004', 'mesure-c@test.local'),
  ('00000000-0000-0000-0000-0000000e5005', 'mesure-d@test.local')
  on conflict do nothing;
insert into profiles (id, display_name) values
  ('00000000-0000-0000-0000-0000000e5001', 'Vandè mezi'),
  ('00000000-0000-0000-0000-0000000e5002', 'Achtè A'),
  ('00000000-0000-0000-0000-0000000e5003', 'Achtè B'),
  ('00000000-0000-0000-0000-0000000e5004', 'Achtè C'),
  ('00000000-0000-0000-0000-0000000e5005', 'Achtè D')
on conflict (id) do nothing;
insert into products (id, seller_id, slug, title, kind, price_htg, status, category_id, cover_url) values
  ('00000000-0000-0000-0000-0000000e5101', '00000000-0000-0000-0000-0000000e5001', 'mesure-wob', 'Wòb', 'physical', 1500, 'published',
   (select id from zabelie_categories where slug = 'wob'), 'https://exemple/wob.jpg'),
  ('00000000-0000-0000-0000-0000000e5102', '00000000-0000-0000-0000-0000000e5001', 'mesure-jip', 'Jip', 'physical', 1200, 'published',
   (select id from zabelie_categories where slug = 'jip'), 'https://exemple/jip.jpg');

-- Essai : A sur la robe (vue hier puis aujourd'hui, essayée, livrée), B sur la jupe (au panier, rien payé).
-- Témoin : C sur la robe (remboursée), D sur la jupe (une payée, une en litige).
insert into zabelie_essayage_expositions (acheteur_id, produit_id, groupe, jour) values
  ('00000000-0000-0000-0000-0000000e5002', '00000000-0000-0000-0000-0000000e5101', 'essai', (now() at time zone 'America/Port-au-Prince')::date - 1),
  ('00000000-0000-0000-0000-0000000e5002', '00000000-0000-0000-0000-0000000e5101', 'essai', (now() at time zone 'America/Port-au-Prince')::date),
  ('00000000-0000-0000-0000-0000000e5003', '00000000-0000-0000-0000-0000000e5102', 'essai', (now() at time zone 'America/Port-au-Prince')::date),
  ('00000000-0000-0000-0000-0000000e5004', '00000000-0000-0000-0000-0000000e5101', 'temoin', (now() at time zone 'America/Port-au-Prince')::date),
  ('00000000-0000-0000-0000-0000000e5005', '00000000-0000-0000-0000-0000000e5102', 'temoin', (now() at time zone 'America/Port-au-Prince')::date);
insert into zabelie_essayage_essais (acheteur_id, produit_id, vendeur_id, fournisseur, statut, cree_le, termine_le) values
  ('00000000-0000-0000-0000-0000000e5002', '00000000-0000-0000-0000-0000000e5101', '00000000-0000-0000-0000-0000000e5001', 'genlook', 'reussi', now(), now());
insert into zabelie_carts (id, buyer_id) values ('00000000-0000-0000-0000-0000000e5201', '00000000-0000-0000-0000-0000000e5003');
insert into zabelie_cart_items (cart_id, product_id) values ('00000000-0000-0000-0000-0000000e5201', '00000000-0000-0000-0000-0000000e5102');
insert into orders (buyer_id, product_id, amount_htg, status, created_at) values
  ('00000000-0000-0000-0000-0000000e5002', '00000000-0000-0000-0000-0000000e5101', 1500, 'delivered', now()),
  -- Avant la première exposition de A : hors mesure.
  ('00000000-0000-0000-0000-0000000e5002', '00000000-0000-0000-0000-0000000e5101', 1500, 'delivered', now() - interval '5 days'),
  -- A sur une fiche qu'il n'a pas vue : hors mesure.
  ('00000000-0000-0000-0000-0000000e5002', '00000000-0000-0000-0000-0000000e5102', 1200, 'paid', now()),
  ('00000000-0000-0000-0000-0000000e5004', '00000000-0000-0000-0000-0000000e5101', 1500, 'refunded', now()),
  ('00000000-0000-0000-0000-0000000e5005', '00000000-0000-0000-0000-0000000e5102', 1200, 'paid', now()),
  ('00000000-0000-0000-0000-0000000e5005', '00000000-0000-0000-0000-0000000e5102', 1200, 'disputed', now()),
  -- Ni payée ni remise : ne compte pas.
  ('00000000-0000-0000-0000-0000000e5005', '00000000-0000-0000-0000-0000000e5102', 1200, 'pending', now());

\ir ../analyses/essayage_mesure.sql

do $$
declare
  v_essai record;
  v_temoin record;
begin
  select * into v_essai from essayage_mesure where groupe = 'essai';
  select * into v_temoin from essayage_mesure where groupe = 'temoin';
  assert (select count(*) from essayage_mesure) = 2, 'M1 KO deux groupes';
  assert (v_essai.paires, v_essai.essayees, v_essai.au_panier, v_essai.commandes_payees, v_essai.livrees, v_essai.remboursees, v_essai.litiges)
       = (2, 1, 1, 1, 1, 0, 0), 'M2 KO essai — ' || row(v_essai.*)::text;
  assert v_essai.taux_achat_pct = 50.0 and v_essai.taux_retour_pct = 0.0, 'M3 KO taux essai — ' || row(v_essai.*)::text;
  assert (v_temoin.paires, v_temoin.essayees, v_temoin.au_panier, v_temoin.commandes_payees, v_temoin.livrees, v_temoin.remboursees, v_temoin.litiges)
       = (2, 0, 0, 3, 0, 1, 1), 'M4 KO témoin — ' || row(v_temoin.*)::text;
  assert v_temoin.taux_achat_pct = 100.0 and v_temoin.taux_retour_pct = 66.7, 'M5 KO taux témoin — ' || row(v_temoin.*)::text;
end;
$$;

rollback;
