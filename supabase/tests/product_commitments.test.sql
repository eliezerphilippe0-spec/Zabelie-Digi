begin;
insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000a10701','commitments@test.local');
insert into profiles(id,display_name) values ('00000000-0000-0000-0000-000000a10701','Seller') on conflict do nothing;
insert into products(id,seller_id,slug,title,kind,price_htg,status) values
 ('00000000-0000-0000-0000-000000a10710','00000000-0000-0000-0000-000000a10701','commitment-test','Delivery test','physical',100,'draft'),
 ('00000000-0000-0000-0000-000000a10711','00000000-0000-0000-0000-000000a10701','commitment-file','File test','fichier',100,'draft');
select * from zabelie_save_product_commitment('00000000-0000-0000-0000-000000a10710','00000000-0000-0000-0000-000000a10701','Delmas','Boutique',2,'included',null,false);
do $$ begin
 if (select availability_confirmed_at from zabelie_product_commitments where product_id='00000000-0000-0000-0000-000000a10710') is not null then raise exception 'unconfirmed marked confirmed'; end if;
 begin
  perform zabelie_save_product_commitment('00000000-0000-0000-0000-000000a10710','00000000-0000-0000-0000-000000a10702','','',2,'quote',null,true);
  raise exception 'wrong owner accepted';
 exception when insufficient_privilege then null; end;
 begin
  insert into zabelie_product_commitments(product_id) values ('00000000-0000-0000-0000-000000a10711');
  raise exception 'file accepted';
 exception when check_violation then null; end;
 begin
  update zabelie_product_commitments set delivery_days=-1;
  raise exception 'negative days accepted';
 exception when check_violation then null; end;
 if has_table_privilege('authenticated','zabelie_product_commitments','UPDATE') or has_table_privilege('anon','zabelie_product_commitments','INSERT') then raise exception 'direct writes allowed'; end if;
 if has_function_privilege('authenticated','zabelie_save_product_commitment(uuid,uuid,text,text,integer,text,date,boolean)','EXECUTE') then raise exception 'public RPC bypass allowed'; end if;
end $$;
set local role anon;
do $$ begin
 if exists(select 1 from zabelie_product_commitments) then raise exception 'draft leaked'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000a10701',true);
do $$ begin
 if (select count(*) from zabelie_product_commitments) <> 1 then raise exception 'owner cannot read'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000a10702',true);
do $$ begin
 if exists(select 1 from zabelie_product_commitments) then raise exception 'other user sees draft'; end if;
end $$;
reset role;
select * from zabelie_save_product_commitment('00000000-0000-0000-0000-000000a10710','00000000-0000-0000-0000-000000a10701','Delmas','Boutique',2,'included',null,true);
do $$ begin
 if (select availability_confirmed_at from zabelie_product_commitments) is null then raise exception 'confirmation missing'; end if;
end $$;
update products set status='published' where id='00000000-0000-0000-0000-000000a10710';
set local role anon;
do $$ begin
 if (select count(*) from zabelie_product_commitments) <> 1 then raise exception 'published details inaccessible'; end if;
end $$;
reset role;
rollback;
