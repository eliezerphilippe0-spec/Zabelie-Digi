begin;
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000a10201','collections-buyer@test.local'),
 ('00000000-0000-0000-0000-000000a10202','collections-seller@test.local'),
 ('00000000-0000-0000-0000-000000a10203','collections-other@test.local');
insert into profiles(id,display_name) values
 ('00000000-0000-0000-0000-000000a10201','Buyer'),
 ('00000000-0000-0000-0000-000000a10202','Seller'),
 ('00000000-0000-0000-0000-000000a10203','Other') on conflict(id) do nothing;
insert into products(id,seller_id,slug,title,kind,price_htg,status) values
 ('00000000-0000-0000-0000-000000a10210','00000000-0000-0000-0000-000000a10202','collections-object-test','Object','physical',100,'published'),
 ('00000000-0000-0000-0000-000000a10211','00000000-0000-0000-0000-000000a10202','collections-file-test','File','fichier',100,'draft');
insert into orders(id,buyer_id,product_id,amount_htg,status) values
 ('00000000-0000-0000-0000-000000a10220','00000000-0000-0000-0000-000000a10201','00000000-0000-0000-0000-000000a10210',100,'pending'),
 ('00000000-0000-0000-0000-000000a10221','00000000-0000-0000-0000-000000a10201','00000000-0000-0000-0000-000000a10211',100,'pending');
insert into zabelie_order_recipients(order_id,full_name,phone,locality) values
 ('00000000-0000-0000-0000-000000a10220','Marie Test','34123456','Jacmel');
do $$ begin
 begin
  insert into zabelie_order_recipients(order_id,full_name,phone,locality) values
   ('00000000-0000-0000-0000-000000a10221','Marie Test','34123456','Jacmel');
  raise exception 'digital recipient accepted';
 exception when check_violation then null; end;
 if has_table_privilege('anon','zabelie_favorites','SELECT') or has_table_privilege('anon','zabelie_shop_follows','SELECT') or has_table_privilege('anon','zabelie_order_recipients','SELECT') then raise exception 'anonymous collection access'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000a10201',true);
insert into zabelie_favorites(user_id,product_id) values('00000000-0000-0000-0000-000000a10201','00000000-0000-0000-0000-000000a10210') on conflict do nothing;
insert into zabelie_favorites(user_id,product_id) values('00000000-0000-0000-0000-000000a10201','00000000-0000-0000-0000-000000a10210') on conflict do nothing;
insert into zabelie_shop_follows(user_id,seller_id) values('00000000-0000-0000-0000-000000a10201','00000000-0000-0000-0000-000000a10202') on conflict do nothing;
do $$ begin
 if (select count(*) from zabelie_favorites) <> 1 then raise exception 'favorite is not idempotent/visible'; end if;
 if (select count(*) from zabelie_shop_follows) <> 1 then raise exception 'follow not visible'; end if;
 if (select count(*) from zabelie_order_recipients) <> 1 then raise exception 'buyer cannot read own recipient'; end if;
 begin
  insert into zabelie_favorites(user_id,product_id) values('00000000-0000-0000-0000-000000a10203','00000000-0000-0000-0000-000000a10210');
  raise exception 'forged user accepted';
 exception when insufficient_privilege then null; end;
 begin
  insert into zabelie_favorites(user_id,product_id) values('00000000-0000-0000-0000-000000a10201','00000000-0000-0000-0000-000000a10211');
  raise exception 'draft favorite accepted';
 exception when insufficient_privilege then null; end;
 begin
  update zabelie_order_recipients set phone='40765432';
  raise exception 'buyer mutated recipient';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000a10203',true);
do $$ begin
 if (select count(*) from zabelie_favorites) <> 0 or (select count(*) from zabelie_shop_follows) <> 0 or (select count(*) from zabelie_order_recipients) <> 0 then raise exception 'other user can see private data'; end if;
 delete from zabelie_favorites;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000a10202',true);
do $$ begin
 if (select count(*) from zabelie_order_recipients) <> 0 then raise exception 'seller saw recipient before payment'; end if;
 begin
  insert into zabelie_shop_follows(user_id,seller_id) values('00000000-0000-0000-0000-000000a10202','00000000-0000-0000-0000-000000a10202');
  raise exception 'self-follow accepted';
 exception when insufficient_privilege or check_violation then null; end;
end $$;
reset role;
update orders set status='paid' where id='00000000-0000-0000-0000-000000a10220';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000a10202',true);
do $$ begin
 if (select count(*) from zabelie_order_recipients) <> 1 then raise exception 'seller cannot read paid recipient'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000a10201',true);
do $$ begin
 if (select count(*) from zabelie_favorites) <> 1 then raise exception 'other user deleted favorite'; end if;
 delete from zabelie_favorites;
 delete from zabelie_shop_follows;
 if (select count(*) from zabelie_favorites) <> 0 or (select count(*) from zabelie_shop_follows) <> 0 then raise exception 'own removal failed'; end if;
end $$;
reset role;
rollback;
