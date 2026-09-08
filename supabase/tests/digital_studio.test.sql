begin;
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000a10401','studio-seller@test.local'),
 ('00000000-0000-0000-0000-000000a10402','studio-buyer@test.local');
insert into public.profiles(id,display_name) values
 ('00000000-0000-0000-0000-000000a10401','Studio seller'),
 ('00000000-0000-0000-0000-000000a10402','Studio buyer') on conflict do nothing;
insert into public.products(id,seller_id,slug,title,kind,price_htg,status) values
 ('00000000-0000-0000-0000-000000a10410','00000000-0000-0000-0000-000000a10401','studio-test','Course v1','fichier',100,'draft');
insert into public.product_assets(id,product_id,storage_path,file_name,size_bytes) values
 ('00000000-0000-0000-0000-000000a10420','00000000-0000-0000-0000-000000a10410','studio-test/original.pdf','original.pdf',1024);
insert into public.zabelie_digital_details(product_id,license,formats) values
 ('00000000-0000-0000-0000-000000a10410','Original personal license','PDF');
insert into public.zabelie_digital_studio(product_id,mode,preview,include_updates,lessons) values
 ('00000000-0000-0000-0000-000000a10410','course','Public sample',true,
 '[{"id":"00000000-0000-0000-0000-000000a10430","title":"Private lesson","chapter":"Chapter one","body":"PRIVATE_SECRET","assetId":"00000000-0000-0000-0000-000000a10420","free":false},{"id":"00000000-0000-0000-0000-000000a10431","title":"Free lesson","chapter":"Chapter one","body":"FREE_SAMPLE","assetId":"","free":true}]');
update public.products set status='published' where id='00000000-0000-0000-0000-000000a10410';
insert into public.orders(id,buyer_id,product_id,amount_htg,status) values
 ('00000000-0000-0000-0000-000000a10440','00000000-0000-0000-0000-000000a10402','00000000-0000-0000-0000-000000a10410',100,'pending');
do $$ declare r public.zabelie_digital_releases; begin
 select * into strict r from public.zabelie_digital_releases where product_id='00000000-0000-0000-0000-000000a10410';
 if r.version<>1 or r.manifest::text like '%PRIVATE_SECRET%' or r.manifest::text like '%storage_path%' or r.manifest::text like '%assetId%' then raise exception 'private material leaked into public manifest'; end if;
 if r.manifest::text not like '%FREE_SAMPLE%' or r.payload::text not like '%PRIVATE_SECRET%' then raise exception 'public/private lesson partition lost'; end if;
 if (select release_id from public.zabelie_digital_entitlements where order_id='00000000-0000-0000-0000-000000a10440')<>r.id then raise exception 'pending order not pinned'; end if;
 begin
  delete from public.product_assets where id='00000000-0000-0000-0000-000000a10420'; raise exception 'published file removed';
 exception when check_violation then null; end;
 begin
  update public.zabelie_digital_releases set title='Altered' where id=r.id; raise exception 'release rewritten';
 exception when check_violation then null; end;
 begin
  update public.zabelie_digital_studio set preview='Unreviewed' where product_id=r.product_id; raise exception 'published content edited';
 exception when check_violation then null; end;
end $$;
-- A new draft can replace files; previous payload, license and entitlement survive.
update public.products set status='draft' where id='00000000-0000-0000-0000-000000a10410';
delete from public.product_assets where id='00000000-0000-0000-0000-000000a10420';
insert into public.product_assets(id,product_id,storage_path,file_name,size_bytes) values
 ('00000000-0000-0000-0000-000000a10421','00000000-0000-0000-0000-000000a10410','studio-test/new.pdf','new.pdf',2048);
-- Publishing with a stale course resource is rejected in the database.
do $$ begin
 begin
  update public.products set status='published' where id='00000000-0000-0000-0000-000000a10410'; raise exception 'missing lesson resource accepted';
 exception when check_violation then null; end;
end $$;
update public.zabelie_digital_studio set include_updates=false,
 lessons=jsonb_set(lessons,'{0,assetId}','"00000000-0000-0000-0000-000000a10421"')
 where product_id='00000000-0000-0000-0000-000000a10410';
update public.zabelie_digital_details set license='New restricted license' where product_id='00000000-0000-0000-0000-000000a10410';
update public.products set title='Course v2',status='published' where id='00000000-0000-0000-0000-000000a10410';
insert into public.orders(id,buyer_id,product_id,amount_htg,status) values
 ('00000000-0000-0000-0000-000000a10441','00000000-0000-0000-0000-000000a10402','00000000-0000-0000-0000-000000a10410',100,'pending');
update public.orders set status='paid' where id='00000000-0000-0000-0000-000000a10440';
do $$ declare r public.zabelie_digital_releases; v_metrics jsonb; begin
 select r0.* into strict r from public.zabelie_digital_releases r0 join public.zabelie_digital_entitlements e on e.release_id=r0.id where e.order_id='00000000-0000-0000-0000-000000a10440';
 if r.version<>1 or r.title<>'Course v1' or r.details->>'license'<>'Original personal license' or r.payload::text not like '%studio-test/original.pdf%' or not (r.manifest->>'include_updates')::boolean then raise exception 'old purchase changed with publication'; end if;
 if (select r0.version from public.zabelie_digital_releases r0 join public.zabelie_digital_entitlements e on e.release_id=r0.id where e.order_id='00000000-0000-0000-0000-000000a10441')<>2 then raise exception 'new order did not acquire v2'; end if;
 insert into public.zabelie_digital_accesses(order_id,release_id,asset_id) values('00000000-0000-0000-0000-000000a10440',r.id,'00000000-0000-0000-0000-000000a10420');
 insert into public.zabelie_digital_accesses(order_id,release_id,asset_id) values('00000000-0000-0000-0000-000000a10440',r.id,'00000000-0000-0000-0000-000000a10420') on conflict do nothing;
 v_metrics := public.zabelie_digital_metrics('00000000-0000-0000-0000-000000a10401');
 if (v_metrics->>'started')::int<>2 or (v_metrics->>'confirmed')::int<>1 or (v_metrics->>'accessed')::int<>1 or (v_metrics->>'gross_htg')::int<>100 then raise exception 'metrics overcounted or included pending money'; end if;
 if (public.zabelie_digital_metrics('00000000-0000-0000-0000-000000a10402')->>'started')::int<>0 then raise exception 'seller metrics crossed accounts'; end if;
end $$;
-- Public/other users cannot obtain payloads, entitlements, progress or metrics.
do $$ declare table_name text; begin
 foreach table_name in array array['zabelie_digital_releases','zabelie_digital_entitlements','zabelie_digital_progress','zabelie_digital_accesses'] loop
  if has_table_privilege('anon',table_name,'SELECT') or has_table_privilege('authenticated',table_name,'SELECT') or has_table_privilege('authenticated',table_name,'INSERT') then raise exception 'private table accessible: %',table_name; end if;
 end loop;
 if has_function_privilege('authenticated','zabelie_digital_metrics(uuid)','EXECUTE') or has_function_privilege('anon','zabelie_digital_publish(uuid)','EXECUTE') then raise exception 'service function exposed'; end if;
 if has_table_privilege('authenticated','product_assets','DELETE') then raise exception 'direct asset deletion allowed'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000a10402',true);
do $$ begin if exists(select 1 from public.zabelie_digital_studio where product_id='00000000-0000-0000-0000-000000a10410') then raise exception 'buyer can see seller draft'; end if; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000a10401',true);
do $$ begin if not exists(select 1 from public.zabelie_digital_studio where product_id='00000000-0000-0000-0000-000000a10410') then raise exception 'seller cannot see own studio'; end if; end $$;
reset role;
-- New guards must not prevent deletion of an unsold product/account.
insert into public.products(id,seller_id,slug,title,kind,price_htg,status) values
 ('00000000-0000-0000-0000-000000a10411','00000000-0000-0000-0000-000000a10401','studio-unsold-test','Unsold','fichier',100,'draft');
insert into public.product_assets(id,product_id,storage_path,file_name,size_bytes) values
 ('00000000-0000-0000-0000-000000a10422','00000000-0000-0000-0000-000000a10411','studio-test/unsold.pdf','unsold.pdf',1024);
update public.products set status='published' where id='00000000-0000-0000-0000-000000a10411';
delete from public.products where id='00000000-0000-0000-0000-000000a10411';
do $$ begin
 if exists(select 1 from public.zabelie_digital_releases where product_id='00000000-0000-0000-0000-000000a10411') then raise exception 'unsold product cannot be removed'; end if;
 begin
  delete from public.products where id='00000000-0000-0000-0000-000000a10410'; raise exception 'purchased product was removed';
 exception when foreign_key_violation then null; end;
end $$;
rollback;
