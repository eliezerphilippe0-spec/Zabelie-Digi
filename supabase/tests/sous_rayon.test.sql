-- Tests du sous-rayon pour tout produit (0098).
-- Usage : psql "$DATABASE_URL" -f supabase/tests/sous_rayon.test.sql
--
--   SR1. Un SERVICE peut porter un sous-rayon de niveau 3 (Recharge Digicel).
--   SR2. Connu-NÉGATIF : un category_id qui n'existe pas est refusé (FK).
--   SR3. Connu-NÉGATIF : supprimer un rayon encore référencé est refusé
--        (on delete restrict) — un rangement ne se perd pas par mégarde.
--   SR4. Les trois rayons de recharge sont ACTIFS après 0098, et le premier-
--        party reste fermé : aucune ligne de topup n'est créée par la migration.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a501'::uuid, 'sr.seller@test.local');
delete from profiles where id in (select id from auth.users where email = 'sr.seller@test.local');
insert into profiles (id, display_name, role, tier) values
  ('00000000-0000-0000-0000-00000000a501'::uuid, 'Vendeur SR', 'creator', 'standard');

do $$
declare
  v_seller  uuid := '00000000-0000-0000-0000-00000000a501';
  v_digicel uuid;
  v_prod    uuid := '00000000-0000-0000-0000-00000000a502';
  v_lu      uuid;
  v_actifs  integer;
begin
  select id into v_digicel from zabelie_categories where slug = 'rechaj-digicel';
  if v_digicel is null then
    raise exception 'SR0 KO: rechaj-digicel absent — 0097 non appliquee dans ce harnais';
  end if;

  -- SR1 : un service rangé au niveau 3.
  insert into products (id, seller_id, slug, title, kind, category, category_id, price_htg, status)
  values (v_prod, v_seller, 'rechaj-100-sr', 'Rechaj Digicel 100 HTG', 'service',
          'Digital & services', v_digicel, 100, 'published');
  select category_id into v_lu from products where id = v_prod;
  if v_lu <> v_digicel then
    raise exception 'SR1 KO: category_id non conserve sur un service';
  end if;

  -- SR2 : connu-négatif, identifiant inexistant.
  begin
    insert into products (id, seller_id, slug, title, kind, category, category_id, price_htg, status)
    values ('00000000-0000-0000-0000-00000000a503', v_seller, 'faux-sr', 'Faux', 'service',
            'Digital & services', '00000000-0000-0000-0000-00000000dead', 100, 'draft');
    raise exception 'SR2 KO: un category_id inexistant a ete accepte';
  exception
    when foreign_key_violation then null; -- attendu
  end;

  -- SR3 : connu-négatif, suppression d'un rayon référencé.
  begin
    delete from zabelie_categories where id = v_digicel;
    raise exception 'SR3 KO: un rayon encore reference a pu etre supprime';
  exception
    when foreign_key_violation then null; -- attendu : on delete restrict
  end;

  -- SR4 : l'ouverture est effective, et rien d'autre ne s'est ouvert.
  select count(*) into v_actifs
    from zabelie_categories
   where slug in ('rechaj-telefon', 'rechaj-digicel', 'rechaj-natcom') and active;
  if v_actifs <> 3 then
    raise exception 'SR4 KO: % rayon(s) de recharge actif(s), 3 attendus', v_actifs;
  end if;
  if (select count(*) from zabelie_topup_orders) <> 0 then
    raise exception 'SR4 KO: la migration a cree des commandes de recharge first-party';
  end if;

  raise notice 'sous_rayon: SR1–SR4 OK';
end $$;

rollback;
