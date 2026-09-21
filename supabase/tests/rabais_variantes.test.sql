begin;
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-00000010e001','variante-vendeur@test.local'),
 ('00000000-0000-0000-0000-00000010e002','variante-autre@test.local');
insert into profiles(id,display_name) values
 ('00000000-0000-0000-0000-00000010e001','Vendeur variantes'),
 ('00000000-0000-0000-0000-00000010e002','Autre vendeur') on conflict(id) do nothing;
insert into products(id,seller_id,slug,title,kind,price_htg,status) values
 ('00000000-0000-0000-0000-00000010e010','00000000-0000-0000-0000-00000010e001','rabais-variantes-test','Produit variantes','physical',2000,'published'),
 ('00000000-0000-0000-0000-00000010e011','00000000-0000-0000-0000-00000010e002','rabais-autre-test','Autre produit','physical',2000,'published');
insert into zabelie_product_variants(id,product_id,sku,price_htg,active,position) values
 ('00000000-0000-0000-0000-00000010e021','00000000-0000-0000-0000-00000010e010','RABAIS-M',2000,true,0),
 ('00000000-0000-0000-0000-00000010e022','00000000-0000-0000-0000-00000010e010','RABAIS-L',2500,true,1),
 ('00000000-0000-0000-0000-00000010e023','00000000-0000-0000-0000-00000010e011','RABAIS-AUTRE',2000,true,0),
 ('00000000-0000-0000-0000-00000010e024','00000000-0000-0000-0000-00000010e010','RABAIS-INACTIF',1000,false,2);

do $$
declare
  seller uuid := '00000000-0000-0000-0000-00000010e001';
  product uuid := '00000000-0000-0000-0000-00000010e010';
  variant uuid := '00000000-0000-0000-0000-00000010e021';
  result jsonb;
begin
  result := zabelie_set_variant_discount(seller,product,variant,1500);
  if result->>'ok' <> 'true' or (result->>'ancien_htg')::bigint <> 2000 then raise exception 'rabais nominal: %',result; end if;
  if not exists(select 1 from products where id=product and price_htg=1500 and compare_at_htg is null) then raise exception 'minimum produit incorrect'; end if;
  if not exists(select 1 from zabelie_product_variants where id='00000000-0000-0000-0000-00000010e022' and price_htg=2500 and compare_at_htg is null) then raise exception 'autre variante modifiee'; end if;
  result := zabelie_set_variant_discount(seller,product,variant,1200);
  if (result->>'ancien_htg')::bigint <> 2000 then raise exception 'origine ecrasee'; end if;
  result := zabelie_set_variant_discount(seller,product,variant,1300);
  if result->>'reason' <> 'pas_une_baisse' then raise exception 'hausse acceptee'; end if;
  result := zabelie_set_variant_discount(seller,product,variant,0);
  if result->>'reason' <> 'prix_invalide' then raise exception 'zero accepte'; end if;
  result := zabelie_set_variant_discount(seller,product,variant,2147483648);
  if result->>'reason' <> 'prix_invalide' then raise exception 'debordement accepte'; end if;
  result := zabelie_set_variant_discount('00000000-0000-0000-0000-00000010e002',product,variant,1000);
  if result->>'reason' <> 'introuvable' then raise exception 'mauvais vendeur accepte'; end if;
  result := zabelie_set_variant_discount(seller,product,'00000000-0000-0000-0000-00000010e023',1000);
  if result->>'reason' <> 'introuvable' then raise exception 'variante autre produit acceptee'; end if;
  result := zabelie_set_variant_discount(seller,product,'00000000-0000-0000-0000-00000010e024',500);
  if result->>'reason' <> 'introuvable' then raise exception 'variante inactive acceptee'; end if;
  result := zabelie_clear_variant_discount('00000000-0000-0000-0000-00000010e002',product,variant);
  if result->>'reason' <> 'introuvable' then raise exception 'retrait par tiers accepte'; end if;
  insert into zabelie_flash_sales(product_id,prix_flash_htg,fin)
    values(product,600,now()+interval '1 hour');
  result := zabelie_set_variant_discount(seller,product,variant,500);
  if result->>'reason' <> 'flash_active' then raise exception 'rabais pose pendant une vente flash'; end if;
  update zabelie_flash_sales set annulee_a=now() where product_id=product;
  result := zabelie_clear_variant_discount(seller,product,variant);
  if not exists(select 1 from zabelie_product_variants where id=variant and price_htg=1200 and compare_at_htg is null) then raise exception 'retrait remonte le prix'; end if;
  begin
    update zabelie_product_variants set compare_at_htg=price_htg where id=variant;
    raise exception 'compare invalide accepte';
  exception when check_violation then null;
  end;
  if has_function_privilege('anon','zabelie_set_variant_discount(uuid,uuid,uuid,bigint)','execute')
    or has_function_privilege('authenticated','zabelie_clear_variant_discount(uuid,uuid,uuid)','execute') then
    raise exception 'RPC privilegiee accessible au navigateur';
  end if;
  -- Quand il ne reste qu'une variante, le rabais classique reste compatible.
  update zabelie_product_variants set active=false where id='00000000-0000-0000-0000-00000010e022';
  result := zabelie_set_discount(seller,product,1000);
  if not exists(select 1 from zabelie_product_variants where id=variant and price_htg=1000 and compare_at_htg=1200) then raise exception 'rabais classique non synchronise'; end if;
  perform zabelie_clear_discount(seller,product);
  if exists(select 1 from zabelie_product_variants where id=variant and compare_at_htg is not null) then raise exception 'retrait classique non synchronise'; end if;
  raise notice 'rabais variantes: nominal, origine, propriete, contraintes et compatibilite OK';
end;
$$;
rollback;
