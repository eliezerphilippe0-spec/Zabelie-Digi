begin;
-- Données synthétiques, toujours annulées à la fin.
insert into auth.users(id,email) select ('10000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'recommend-'||i||'@test.local' from generate_series(1,22)i;
insert into profiles(id,display_name) select id,'Recommandations test' from auth.users where id::text like '10000000-%' on conflict(id) do nothing;
insert into products(id,seller_id,slug,title,kind,price_htg,status) values
('20000000-0000-0000-0000-000000000010','10000000-0000-0000-0000-000000000021','reco-source','Source','fichier',1000,'published'),
('20000000-0000-0000-0000-000000000011','10000000-0000-0000-0000-000000000021','reco-specific','Complément précis','fichier',500,'published'),
('20000000-0000-0000-0000-000000000012','10000000-0000-0000-0000-000000000021','reco-popular','Très populaire','service',700,'published'),
('20000000-0000-0000-0000-000000000013','10000000-0000-0000-0000-000000000021','reco-stock','Complément physique','physical',600,'published'),
('20000000-0000-0000-0000-000000000014','10000000-0000-0000-0000-000000000022','reco-foreign','Autre boutique','fichier',800,'published');
insert into zabelie_product_variants(id,product_id,sku,price_htg) values
('30000000-0000-0000-0000-000000000013','20000000-0000-0000-0000-000000000013','RECO-STOCK',600);
insert into zabelie_stock(variant_id,quantity_available) values('30000000-0000-0000-0000-000000000013',5);
do $$
declare src uuid:='20000000-0000-0000-0000-000000000010'; seller uuid:='10000000-0000-0000-0000-000000000021';
 b uuid:='20000000-0000-0000-0000-000000000011'; c uuid:='20000000-0000-0000-0000-000000000012';
 d uuid:='20000000-0000-0000-0000-000000000013'; other uuid:='20000000-0000-0000-0000-000000000014';
 buyer uuid; ord uuid; target uuid; b_order uuid; b_payment uuid; first_target uuid; new_order uuid; result jsonb; n bigint;
begin
 if exists(select 1 from zabelie_product_recommendations(src,null)) then raise exception 'suggestion sans historique'; end if;
 for i in 1..20 loop
  buyer:=('10000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid;
  for target in select x from unnest(array[
    case when i<=10 then src end, case when i<=5 then b end,
    case when i<=6 or i>10 then c end, case when i<=5 then d end, case when i<=5 then other end
  ]) x where x is not null loop
    insert into orders(buyer_id,product_id,amount_htg,status,zabelie_payment_is_live)
    values(buyer,target,500,'paid',true) returning id into ord;
    insert into payments(order_id,idempotency_key,status,confirmed_at) values(ord,ord::text,'confirmed',now()-interval '2 days')
    returning id into b_payment;
    if i=1 and target=b then b_order:=ord; end if;
  end loop;
 end loop;
 select id into b_payment from payments where order_id=b_order;
 if (select count(*) from zabelie_product_recommendations(src,null))<>3 then raise exception 'trois suggestions pertinentes attendues'; end if;
 select target_product_id into first_target from zabelie_product_recommendations(src,null) limit 1;
 if first_target<>b then raise exception 'simple best seller prioritaire'; end if;
 if exists(select 1 from zabelie_product_recommendations(src,null) where target_product_id=other) then raise exception 'autre vendeur'; end if;
 if exists(select 1 from zabelie_product_recommendations(src,'10000000-0000-0000-0000-000000000001') where target_product_id=b) then raise exception 'digital deja achete'; end if;

 -- Répétitions de paiement/achat par un seul compte : jamais cinq acheteurs.
 insert into payments(order_id,idempotency_key,status,confirmed_at) values(b_order,'repeat-confirm','confirmed',now());
 update orders set status='refunded' where id=b_order;
 if exists(select 1 from zabelie_product_recommendations(src,null) where target_product_id=b) then raise exception 'remboursement conserve ou paiement double compte'; end if;
 -- Dix achats supplémentaires par un seul acheteur ne remplacent pas le cinquième acheteur.
 for i in 1..10 loop
  insert into orders(buyer_id,product_id,amount_htg,status,zabelie_payment_is_live)
  values('10000000-0000-0000-0000-000000000002',b,500,'paid',true) returning id into ord;
  insert into payments(order_id,idempotency_key,status,confirmed_at) values(ord,ord::text,'confirmed',now()-interval '2 days');
 end loop;
 if exists(select 1 from zabelie_product_recommendations(src,null) where target_product_id=b) then raise exception 'achats repetes gonflent le seuil'; end if;
 for target in select unnest(array[src,b]) loop
  insert into orders(buyer_id,product_id,amount_htg,status,zabelie_payment_is_live)
  values(seller,target,500,'paid',true) returning id into ord;
  insert into payments(order_id,idempotency_key,status,confirmed_at) values(ord,ord::text,'confirmed',now()-interval '2 days');
 end loop;
 if exists(select 1 from zabelie_product_recommendations(src,null) where target_product_id=b) then raise exception 'auto achat vendeur utilise'; end if;
 update orders set status='paid',zabelie_payment_is_live=false where id=b_order;
 if exists(select 1 from zabelie_product_recommendations(src,null) where target_product_id=b) then raise exception 'sandbox utilise'; end if;
 update orders set zabelie_payment_is_live=true,amount_htg=0 where id=b_order;
 if exists(select 1 from zabelie_product_recommendations(src,null) where target_product_id=b) then raise exception 'gratuit utilise'; end if;
 update orders set amount_htg=500 where id=b_order;
 update payments set status='failed' where order_id=b_order;
 if exists(select 1 from zabelie_product_recommendations(src,null) where target_product_id=b) then raise exception 'statut sans paiement confirme'; end if;
 update payments set status='confirmed',confirmed_at=now()-interval '40 days' where order_id=b_order;
 if exists(select 1 from zabelie_product_recommendations(src,null) where target_product_id=b) then raise exception 'achats trop eloignes'; end if;
 update payments set confirmed_at=now()-interval '190 days' where order_id=b_order;
 if exists(select 1 from zabelie_product_recommendations(src,null) where target_product_id=b) then raise exception 'historique expire'; end if;
 update payments set confirmed_at=now()-interval '2 days' where order_id=b_order;
 update profiles set is_test=true where id='10000000-0000-0000-0000-000000000001';
 if exists(select 1 from zabelie_product_recommendations(src,null) where target_product_id=b) then raise exception 'compte test utilise'; end if;
 update profiles set is_test=false where id='10000000-0000-0000-0000-000000000001';
 update zabelie_recommendation_config set min_confidence_bps=6000;
 if exists(select 1 from zabelie_product_recommendations(src,null) where target_product_id=b) then raise exception 'confiance insuffisante'; end if;
 update zabelie_recommendation_config set min_confidence_bps=2000;

 result:=zabelie_configure_product_offers(seller,src,jsonb_build_object('cross_sell',b),true);
 if result->>'ok'<>'true' then raise exception 'choix vendeur refuse'; end if;
 if exists(select 1 from zabelie_product_recommendations(src,null) where target_product_id=b) then raise exception 'doublon manuel'; end if;
 if not exists(select 1 from zabelie_offers_public(src,null) where target_product_id=b) then raise exception 'offre manuelle perdue'; end if;
 perform zabelie_configure_product_offers(seller,src,jsonb_build_object('cross_sell',b),false);
 if exists(select 1 from zabelie_product_recommendations(src,null)) then raise exception 'opt out ignore'; end if;
 if not exists(select 1 from zabelie_offers_public(src,null)) then raise exception 'opt out a efface manuel'; end if;
 result:=zabelie_configure_product_offers('10000000-0000-0000-0000-000000000022',src,'{}',true);
 if result->>'reason'<>'not_owner' or (select zabelie_auto_recommendations from products where id=src) then raise exception 'preference autre vendeur autorisee'; end if;
 result:=zabelie_configure_product_offers(seller,src,jsonb_build_object('cross_sell',other),true);
 if result->>'ok'='true' or (select zabelie_auto_recommendations from products where id=src) then raise exception 'sauvegarde partielle'; end if;
 perform zabelie_configure_product_offers(seller,src,'{}',true);

 update zabelie_stock set quantity_available=0 where variant_id='30000000-0000-0000-0000-000000000013';
 if exists(select 1 from zabelie_product_recommendations(src,null) where target_product_id=d) then raise exception 'rupture'; end if;
 update zabelie_stock set quantity_available=5 where variant_id='30000000-0000-0000-0000-000000000013';
 update products set status='draft' where id=b;
 if exists(select 1 from zabelie_product_recommendations(src,null) where target_product_id=b) then raise exception 'brouillon'; end if;
 update products set status='published' where id=b;
 insert into zabelie_flash_sales(product_id,prix_flash_htg,fin) values(b,300,now()+interval '1 hour');
 if exists(select 1 from zabelie_product_recommendations(src,null) where target_product_id=b) then raise exception 'flash'; end if;
 update zabelie_flash_sales set annulee_a=now() where product_id=b;
 update profiles set suspended_at=now() where id=seller;
 if exists(select 1 from zabelie_product_recommendations(src,null)) then raise exception 'vendeur suspendu'; end if;
 update profiles set suspended_at=null where id=seller;

 buyer:='10000000-0000-0000-0000-000000000020';
 insert into orders(buyer_id,product_id,amount_htg,status,zabelie_payment_is_live,zabelie_recommendation_source_id)
 values(buyer,b,500,'pending',true,src) returning id into new_order;
 if (select zabelie_recommendation_source_id from orders where id=new_order) is distinct from src then raise exception 'attribution perdue'; end if;
 if exists(select 1 from zabelie_recommendation_stats(seller)) then raise exception 'pending compte'; end if;
 insert into payments(order_id,idempotency_key,status,confirmed_at) values(new_order,new_order::text,'confirmed',now());
 update orders set status='paid' where id=new_order;
 select confirmed into n from zabelie_recommendation_stats(seller) where product_id=src;
 if n is distinct from 1::bigint then raise exception 'compteur confirme incorrect'; end if;
 update orders set status='refunded' where id=new_order;
 if exists(select 1 from zabelie_recommendation_stats(seller)) then raise exception 'remboursement compte'; end if;
 insert into orders(buyer_id,product_id,amount_htg,status,zabelie_payment_is_live,zabelie_recommendation_source_id)
 values(buyer,other,800,'pending',true,src) returning id into ord;
 if (select zabelie_recommendation_source_id from orders where id=ord) is not null then raise exception 'attribution falsifiee'; end if;
 if (select amount_htg from orders where id=ord)<>800 then raise exception 'prix modifie par attribution'; end if;
 if exists(select 1 from zabelie_recommendation_stats('10000000-0000-0000-0000-000000000022')) then raise exception 'stats tierces'; end if;
 update zabelie_recommendation_config set enabled=false;
 if exists(select 1 from zabelie_product_recommendations(src,null)) then raise exception 'arret global ignore'; end if;
 if has_function_privilege('anon','zabelie_product_recommendations(uuid,uuid)','execute')
 or has_function_privilege('authenticated','zabelie_recommendation_stats(uuid)','execute')
 or has_function_privilege('authenticated','zabelie_configure_product_offers(uuid,uuid,jsonb,boolean)','execute')
 or has_table_privilege('anon','zabelie_recommendation_config','select') then raise exception 'acces public aux signaux internes'; end if;
 raise notice 'recommendations: seuils, paiements reels, classement, doublons, disponibilite, preference, attribution, statistiques et permissions OK';
end;
$$;
rollback;
