-- Tests de `0088` — livraison le JOUR MÊME (delivery_days = 0).
-- Usage : psql "$DATABASE_URL" -f supabase/tests/livraison_jour_meme.test.sql
--
-- Couvre, et chaque cas positif a son négatif en face :
--   LJ1. service, 0 jour  → ACCEPTÉ   (le jour même)
--   LJ2. fichier, 0 jour  → ACCEPTÉ   (téléchargement immédiat)
--   LJ3. physical, 0 jour → REFUSÉ    (une remise ne se fait pas en 0 jour)
--   LJ4. délai NÉGATIF    → REFUSÉ    pour les trois kinds
--   LJ5. null             → ACCEPTÉ   (« à convenir », inchangé depuis 0020)
--   LJ6. > 365 n'est PAS gardé en base — le garde est côté route, et ce test
--        le dit plutôt que de laisser croire à une protection qui n'existe pas.

begin;

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-0000000e8801'::uuid, 'livraison@test.local');

-- 0045 crée le profil à l'inscription ; ces tests pilotent la ligne eux-mêmes.
delete from profiles where id = '00000000-0000-0000-0000-0000000e8801'::uuid;
insert into profiles (id, display_name, role)
values ('00000000-0000-0000-0000-0000000e8801'::uuid, 'Vendeur Livraison', 'creator');

do $$
declare
  v_seller uuid := '00000000-0000-0000-0000-0000000e8801';
  v_ok     boolean;
  v_n      integer;
begin
  -- ── LJ1 : service à 0 jour — le cas demandé ──────────────────────────────
  insert into products (id, seller_id, title, slug, price_htg, kind, delivery_days)
  values ('00000000-0000-0000-0000-0000000e8811', v_seller, 'Cours Zoom',
          'cours-zoom-lj1', 500, 'service', 0);
  select count(*) into v_n from products
   where id = '00000000-0000-0000-0000-0000000e8811' and delivery_days = 0;
  assert v_n = 1, 'LJ1 KO : un service a 0 jour a ete refuse';

  -- ── LJ2 : fichier à 0 jour ───────────────────────────────────────────────
  insert into products (id, seller_id, title, slug, price_htg, kind, delivery_days)
  values ('00000000-0000-0000-0000-0000000e8812', v_seller, 'Guide PDF',
          'guide-pdf-lj2', 500, 'fichier', 0);
  select count(*) into v_n from products
   where id = '00000000-0000-0000-0000-0000000e8812' and delivery_days = 0;
  assert v_n = 1, 'LJ2 KO : un fichier a 0 jour a ete refuse';

  -- ── LJ3 : physique à 0 jour — CONNU-NÉGATIF, et c'est le cas qui compte ──
  -- Sans lui, une contrainte qui accepterait TOUT passerait LJ1 et LJ2.
  v_ok := false;
  begin
    insert into products (id, seller_id, title, slug, price_htg, kind, delivery_days)
    values ('00000000-0000-0000-0000-0000000e8813', v_seller, 'Sac',
            'sac-lj3', 500, 'physical', 0);
  exception when check_violation then v_ok := true;
  end;
  assert v_ok,
    'LJ3 KO : un article LIVRABLE a ete accepte a 0 jour — la contrainte '
    'n''est plus bornee au numerique, et un vendeur promet une remise '
    'instantanee qu''il ne peut pas tenir';

  -- ── LJ4 : délai négatif — refusé pour les trois kinds ────────────────────
  v_ok := false;
  begin
    update products set delivery_days = -1
     where id = '00000000-0000-0000-0000-0000000e8811';
  exception when check_violation then v_ok := true;
  end;
  assert v_ok, 'LJ4 KO : un delai negatif a ete accepte sur un service';

  v_ok := false;
  begin
    insert into products (id, seller_id, title, slug, price_htg, kind, delivery_days)
    values ('00000000-0000-0000-0000-0000000e8814', v_seller, 'Sac 2',
            'sac-lj4', 500, 'physical', -3);
  exception when check_violation then v_ok := true;
  end;
  assert v_ok, 'LJ4 KO : un delai negatif a ete accepte sur un physique';

  -- ── LJ5 : null reste accepté — « a convenir », comportement de 0020 ──────
  insert into products (id, seller_id, title, slug, price_htg, kind, delivery_days)
  values ('00000000-0000-0000-0000-0000000e8815', v_seller, 'Sur mesure',
          'sur-mesure-lj5', 500, 'service', null);
  select count(*) into v_n from products
   where id = '00000000-0000-0000-0000-0000000e8815' and delivery_days is null;
  assert v_n = 1, 'LJ5 KO : un delai null a ete refuse — regression sur 0020';

  -- ── LJ6 : le plafond de 365 n'est PAS en base ────────────────────────────
  -- Il vit dans `app/api/products/route.ts`. Ce cas ne teste pas une
  -- protection : il DOCUMENTE son absence, pour qu'une session future ne croie
  -- pas la base plus stricte qu'elle n'est.
  insert into products (id, seller_id, title, slug, price_htg, kind, delivery_days)
  values ('00000000-0000-0000-0000-0000000e8816', v_seller, 'Tres long',
          'tres-long-lj6', 500, 'service', 9999);
  select count(*) into v_n from products
   where id = '00000000-0000-0000-0000-0000000e8816' and delivery_days = 9999;
  assert v_n = 1,
    'LJ6 : la base accepte 9999 — si ce cas ECHOUE, un plafond a ete ajoute en '
    'base et ce commentaire est perime, pas le test';

  raise notice 'OK — LJ1 service 0j ; LJ2 fichier 0j ; LJ3 physique 0j REFUSE ; '
               'LJ4 negatif refuse (service + physique) ; LJ5 null accepte ; '
               'LJ6 plafond 365 absent de la base, garde cote route';
end $$;

rollback;
