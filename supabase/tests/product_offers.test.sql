begin;
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000110001','offers-seller@test.local'),
 ('00000000-0000-0000-0000-000000110002','offers-other@test.local'),
 ('00000000-0000-0000-0000-000000110003','offers-buyer@test.local');
insert into profiles(id,display_name) select id,'Offres test' from auth.users where id in
 ('00000000-0000-0000-0000-000000110001','00000000-0000-0000-0000-000000110002','00000000-0000-0000-0000-000000110003') on conflict(id) do nothing;
insert into products(id,seller_id,slug,title,kind,price_htg,status) values
 ('00000000-0000-0000-0000-000000110010','00000000-0000-0000-0000-000000110001','offers-source','Guide','fichier',1000,'published'),
 ('00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110001','offers-up','Formation','fichier',2000,'published'),
 ('00000000-0000-0000-0000-000000110012','00000000-0000-0000-0000-000000110001','offers-cross','Accompagnement','service',1500,'published'),
 ('00000000-0000-0000-0000-000000110013','00000000-0000-0000-0000-000000110001','offers-down','Fiche pratique','fichier',500,'published'),
 ('00000000-0000-0000-0000-000000110014','00000000-0000-0000-0000-000000110002','offers-other','Autre vendeur','fichier',3000,'published'),
 ('00000000-0000-0000-0000-000000110015','00000000-0000-0000-0000-000000110001','offers-draft','Brouillon','fichier',3000,'draft');
do $$
declare seller uuid:='00000000-0000-0000-0000-000000110001'; src uuid:='00000000-0000-0000-0000-000000110010';
 targets jsonb:='{"upsell":"00000000-0000-0000-0000-000000110011","cross_sell":"00000000-0000-0000-0000-000000110012","downsell":"00000000-0000-0000-0000-000000110013"}';
 result jsonb; up_id uuid; down_id uuid; n bigint;
begin
 result:=zabelie_save_product_offers(seller,src,targets);
 if result->>'ok'<>'true' then raise exception 'configuration refusee %',result; end if;
 if (select count(*) from zabelie_offers_public(src,null))<>3 then raise exception 'trois offres attendues'; end if;
 select id into up_id from zabelie_product_offers where source_product_id=src and offer_kind='upsell';
 select id into down_id from zabelie_product_offers where source_product_id=src and offer_kind='downsell';
 perform zabelie_save_product_offers(seller,src,targets);
 if (select count(*) from zabelie_product_offers where source_product_id=src)<>3 then raise exception 'doublons apres rejeu'; end if;
 result:=zabelie_save_product_offers('00000000-0000-0000-0000-000000110002',src,targets);
 if result->>'reason'<>'not_owner' then raise exception 'autre vendeur autorise'; end if;
 for result in select value from jsonb_array_elements('[
  {"upsell":"00000000-0000-0000-0000-000000110010"},
  {"upsell":"00000000-0000-0000-0000-000000110014"},
  {"upsell":"00000000-0000-0000-0000-000000110015"},
  {"upsell":"00000000-0000-0000-0000-000000110013"},
  {"upsell":"00000000-0000-0000-0000-000000110012"},
  {"upsell":"00000000-0000-0000-0000-000000110011","cross_sell":"00000000-0000-0000-0000-000000110011"},
  {"unknown":"00000000-0000-0000-0000-000000110011"},
  {"upsell":"bad-id"}]'::jsonb) loop
   if (zabelie_save_product_offers(seller,src,result)->>'ok')::boolean then raise exception 'cible invalide acceptee %',result; end if;
 end loop;
 if (select count(*) from zabelie_offers_public(src,null))<>3 then raise exception 'refus a modifie les offres'; end if;
 update products set status='draft' where id='00000000-0000-0000-0000-000000110011';
 if exists(select 1 from zabelie_offers_public(src,null) where id=up_id) then raise exception 'brouillon visible'; end if;
 update products set status='published',price_htg=900 where id='00000000-0000-0000-0000-000000110011';
 if exists(select 1 from zabelie_offers_public(src,null) where id=up_id) then raise exception 'upsell moins cher visible'; end if;
 update products set price_htg=2000 where id='00000000-0000-0000-0000-000000110011';
 insert into zabelie_flash_sales(product_id,prix_flash_htg,fin) values(src,500,now()+interval '1 hour');
 if exists(select 1 from zabelie_offers_public(src,null)) then raise exception 'prix flash non masque'; end if;
 update zabelie_flash_sales set annulee_a=now() where product_id=src;
 insert into orders(id,buyer_id,product_id,amount_htg,status,zabelie_offer_id) values
 ('00000000-0000-0000-0000-000000110021','00000000-0000-0000-0000-000000110003','00000000-0000-0000-0000-000000110011',2000,'pending',up_id),
 ('00000000-0000-0000-0000-000000110022','00000000-0000-0000-0000-000000110003','00000000-0000-0000-0000-000000110013',500,'pending',up_id);
 if not exists(select 1 from orders where id='00000000-0000-0000-0000-000000110021' and zabelie_offer_id=up_id and amount_htg=2000) then raise exception 'attribution valide perdue'; end if;
 if exists(select 1 from orders where id='00000000-0000-0000-0000-000000110022' and zabelie_offer_id is not null) then raise exception 'attribution falsifiee acceptee'; end if;
 select confirmed into n from zabelie_offer_stats(seller) where offer_id=up_id;
 if n<>0 then raise exception 'commande en attente comptee'; end if;
 update orders set status='paid' where id='00000000-0000-0000-0000-000000110021';
 select confirmed into n from zabelie_offer_stats(seller) where offer_id=up_id;
 if n<>1 then raise exception 'vente confirmee absente'; end if;
 if exists(select 1 from zabelie_offers_public(src,'00000000-0000-0000-0000-000000110003') where id=up_id) then raise exception 'fichier deja achete repropose'; end if;
 update orders set status='refunded' where id='00000000-0000-0000-0000-000000110021';
 select confirmed into n from zabelie_offer_stats(seller) where offer_id=up_id;
 if n<>0 then raise exception 'remboursement compte'; end if;
 if exists(select 1 from zabelie_offer_stats('00000000-0000-0000-0000-000000110002')) then raise exception 'stats autre vendeur divulguees'; end if;
 if has_function_privilege('anon','zabelie_offers_public(uuid,uuid)','execute') or has_function_privilege('authenticated','zabelie_save_product_offers(uuid,uuid,jsonb)','execute')
 or has_table_privilege('authenticated','zabelie_product_offers','UPDATE') then raise exception 'ecriture directe autorisee'; end if;
 -- Une rupture de stock ne devient jamais une proposition achetable.
 insert into products(id,seller_id,slug,title,kind,price_htg,status) values
 ('00000000-0000-0000-0000-000000110016',seller,'offers-physical','Accessoire','physical',700,'published');
 insert into zabelie_product_variants(id,product_id,sku,price_htg) values
 ('00000000-0000-0000-0000-000000110017','00000000-0000-0000-0000-000000110016','OFFERS-STOCK',700);
 insert into zabelie_stock(variant_id,quantity_available) values('00000000-0000-0000-0000-000000110017',0);
 perform zabelie_save_product_offers(seller,src,targets||'{"cross_sell":"00000000-0000-0000-0000-000000110016"}'::jsonb);
 if exists(select 1 from zabelie_offers_public(src,null) where target_product_id='00000000-0000-0000-0000-000000110016') then raise exception 'rupture proposee'; end if;
 update zabelie_stock set quantity_available=2 where variant_id='00000000-0000-0000-0000-000000110017';
 if not exists(select 1 from zabelie_offers_public(src,null) where target_product_id='00000000-0000-0000-0000-000000110016') then raise exception 'stock disponible masque'; end if;
 perform zabelie_save_product_offers(seller,src,targets);
 update profiles set suspended_at=now() where id=seller;
 if exists(select 1 from zabelie_offers_public(src,null)) then raise exception 'vendeur suspendu visible'; end if;
 update profiles set suspended_at=null where id=seller;

 perform zabelie_save_product_offers(seller,src,'{}');
 if exists(select 1 from zabelie_offers_public(src,null)) then raise exception 'retrait non effectif'; end if;
 if (select count(*) from zabelie_product_offers where source_product_id=src)<>4 then raise exception 'historique detruit'; end if;
 raise notice 'offres: propriete, doublons, prix, visibilite, attribution et statistiques OK';
end;
$$;
-- Lecture du paramétrage réservée au propriétaire.
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000110002';
do $$ begin if exists(select 1 from zabelie_product_offers) then raise exception 'RLS vendeur tiers'; end if; end $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000110001';
do $$ begin if (select count(*) from zabelie_product_offers)<>4 then raise exception 'RLS proprietaire'; end if; end $$;
reset role;
rollback;
