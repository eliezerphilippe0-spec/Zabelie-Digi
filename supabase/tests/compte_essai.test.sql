-- Tests du compte d'essai (0101). Transaction annulée à la fin.
--
--   E1. LE CŒUR, ET IL SE LIT DANS LES DEUX SENS : la fiche PUBLIÉE d'un
--       compte d'essai est invisible d'`anon` — et elle REDEVIENT visible dès
--       que la marque tombe. Sans la seconde moitié, on prouverait seulement
--       « anon ne voit rien », ce qui serait aussi vrai si la policy était
--       cassée, si le produit n'existait pas, ou si le rôle n'avait aucun
--       droit. Le témoin ordinaire, visible tout du long, ferme la porte.
--   E2. Le compte d'essai n'est PAS bridé : il publie, et il RELIT sa fiche.
--       C'est ce qui distingue « invisible du public » de « interdit de
--       publier » — et c'est tout l'objet du dessin.
--   E3. La marque est portée par le COMPTE : marquer le vendeur suffit à
--       masquer TOUTES ses fiches, sans toucher une seule ligne de `products`.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000e5501', 'e.essai@test.local'),
  ('00000000-0000-0000-0000-0000000e5502', 'e.ordinaire@test.local');
insert into profiles (id, display_name) values
  ('00000000-0000-0000-0000-0000000e5501', 'Vandè Esè'),
  ('00000000-0000-0000-0000-0000000e5502', 'Vandè Òdinè')
on conflict (id) do nothing;

-- Deux fiches PUBLIÉES, une par vendeur. Le vendeur ordinaire est le TÉMOIN :
-- s'il disparaissait lui aussi, ce ne serait pas la marque qui filtre.
insert into products (id, seller_id, slug, title, kind, price_htg, status) values
  ('00000000-0000-0000-0000-0000000e5510', '00000000-0000-0000-0000-0000000e5501',
   'fich-esè', 'Fich Esè', 'fichier', 500, 'published'),
  ('00000000-0000-0000-0000-0000000e5511', '00000000-0000-0000-0000-0000000e5501',
   'dezyem-esè', 'Dezyèm Esè', 'service', 700, 'published'),
  ('00000000-0000-0000-0000-0000000e5512', '00000000-0000-0000-0000-0000000e5502',
   'fich-òdinè', 'Fich Òdinè', 'fichier', 900, 'published');

-- ── E1 — invisible marqué, visible démarqué, témoin stable ──────────────────
do $$
declare v_essai int; v_temoin int;
begin
  -- (a) CONNU-NÉGATIF d'abord : AVANT toute marque, anon voit les deux
  --     vendeurs. Sans ce point de départ, un zéro plus bas ne voudrait rien
  --     dire — il pourrait venir d'un rôle sans droits ou d'un insert raté.
  set local role anon;
  select count(*) into v_essai  from products where seller_id = '00000000-0000-0000-0000-0000000e5501';
  select count(*) into v_temoin from products where seller_id = '00000000-0000-0000-0000-0000000e5502';
  if v_essai <> 2 or v_temoin <> 1 then
    raise exception 'E1 KO (depart) : anon devrait voir 2 et 1, il voit % et %', v_essai, v_temoin;
  end if;
  reset role;

  -- (b) On marque le vendeur. Aucune ligne de `products` n'est touchée.
  update profiles set is_test = true where id = '00000000-0000-0000-0000-0000000e5501';

  set local role anon;
  select count(*) into v_essai  from products where seller_id = '00000000-0000-0000-0000-0000000e5501';
  select count(*) into v_temoin from products where seller_id = '00000000-0000-0000-0000-0000000e5502';
  if v_essai <> 0 then
    raise exception 'E1 KO : anon voit encore % fiche(s) d''un compte d''essai', v_essai;
  end if;
  if v_temoin <> 1 then
    raise exception 'E1 KO : le TEMOIN a disparu (%) — ce n''est donc pas la marque qui filtre', v_temoin;
  end if;
  reset role;

  -- (c) La marque tombe : tout revient. C'est ce retour qui prouve que le
  --     masquage tenait bien à elle, et à rien d'autre.
  update profiles set is_test = false where id = '00000000-0000-0000-0000-0000000e5501';

  set local role anon;
  select count(*) into v_essai from products where seller_id = '00000000-0000-0000-0000-0000000e5501';
  if v_essai <> 2 then
    raise exception 'E1 KO : la marque retiree, anon devrait revoir 2 fiches, il en voit %', v_essai;
  end if;
  reset role;

  raise notice 'E1 OK — invisible marque, visible demarque, temoin intact';
end $$;

-- ── E2 — un compte d'essai n'est pas bridé ──────────────────────────────────
do $$
declare v_vues int; v_publie int;
begin
  update profiles set is_test = true where id = '00000000-0000-0000-0000-0000000e5501';

  -- Le vendeur d'essai, sous SA propre identité, relit ses fiches : la policy
  -- `products_seller_read_own` n'est pas touchée par 0101.
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000e5501';
  select count(*) into v_vues from products where seller_id = '00000000-0000-0000-0000-0000000e5501';
  if v_vues <> 2 then
    raise exception 'E2 KO : le vendeur d''essai ne voit que % de ses 2 fiches', v_vues;
  end if;
  reset role;

  -- Et rien ne l'empêche d'AVOIR publié : les deux fiches sont bien
  -- `published` en base. « Invisible du public » n'est pas « interdit de
  -- publier » — c'est la distinction que tout ce chantier existe pour poser.
  select count(*) into v_publie from products
   where seller_id = '00000000-0000-0000-0000-0000000e5501' and status = 'published';
  if v_publie <> 2 then
    raise exception 'E2 KO : % fiche(s) publiee(s), 2 attendues', v_publie;
  end if;

  raise notice 'E2 OK — publie, se relit, et reste invisible du public';
end $$;

-- ── E3 — la marque porte sur le compte, pas sur la fiche ────────────────────
do $$
declare v_touchees int;
begin
  -- Aucune fiche n'a été modifiée par le marquage : leur statut est intact.
  select count(*) into v_touchees from products
   where seller_id = '00000000-0000-0000-0000-0000000e5501' and status <> 'published';
  if v_touchees <> 0 then
    raise exception 'E3 KO : % fiche(s) ont change de statut — la marque a debord�e sur products', v_touchees;
  end if;

  -- Et la fonction, interrogée directement, distingue les deux vendeurs.
  if zabelie_vendeur_essai('00000000-0000-0000-0000-0000000e5501') is not true then
    raise exception 'E3 KO : le vendeur marque n''est pas reconnu';
  end if;
  if zabelie_vendeur_essai('00000000-0000-0000-0000-0000000e5502') is not false then
    raise exception 'E3 KO : un vendeur ordinaire est pris pour un compte d''essai';
  end if;

  raise notice 'E3 OK — la marque vit sur le compte, products intact';
end $$;

rollback;
