begin;
insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000a10301','digital-details@test.local');
insert into profiles(id,display_name) values ('00000000-0000-0000-0000-000000a10301','Digital seller') on conflict do nothing;
insert into products(id,seller_id,slug,title,kind,price_htg,status) values
 ('00000000-0000-0000-0000-000000a10310','00000000-0000-0000-0000-000000a10301','digital-details-test','Digital facts','fichier',100,'draft'),
 ('00000000-0000-0000-0000-000000a10311','00000000-0000-0000-0000-000000a10301','digital-details-object-test','Object facts','physical',100,'draft');
insert into zabelie_digital_details(product_id,formats,license) values ('00000000-0000-0000-0000-000000a10310','PDF','Personal use');
do $$ begin
 begin
  insert into zabelie_digital_details(product_id) values ('00000000-0000-0000-0000-000000a10311');
  raise exception 'physical details accepted';
 exception when check_violation then null; end;
 begin
  update zabelie_digital_details set formats=repeat('x',101);
  raise exception 'oversize details accepted';
 exception when check_violation then null; end;
 if has_table_privilege('anon','zabelie_digital_details','UPDATE') or has_table_privilege('authenticated','zabelie_digital_details','INSERT') then raise exception 'direct writes allowed'; end if;
end $$;
set local role anon;
do $$ begin
 if exists(select 1 from zabelie_digital_details) then raise exception 'draft details leaked'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000a10301',true);
do $$ begin
 if (select count(*) from zabelie_digital_details) <> 1 then raise exception 'owner cannot read draft'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000a10302',true);
do $$ begin
 if exists(select 1 from zabelie_digital_details) then raise exception 'other buyer saw draft'; end if;
end $$;
reset role;
update products set status='published' where id='00000000-0000-0000-0000-000000a10310';
do $$ begin
 begin
  update zabelie_digital_details set license='Changed after review';
  raise exception 'published facts changed without review';
 exception when check_violation then null; end;
end $$;
set local role anon;
do $$ begin
 if (select count(*) from zabelie_digital_details) <> 1 then raise exception 'published facts unavailable'; end if;
end $$;
reset role;
rollback;
