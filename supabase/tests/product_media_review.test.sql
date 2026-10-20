-- SEC-01 / 0152 : écritures de service réelles, transaction annulée.
-- Les courses entre deux connexions sont dans product_media_review_concurrent.sh.
begin;

insert into auth.users(id,email) values
 ('15200000-0000-4000-8000-000000000001','media-review-seller@test.local'),
 ('15200000-0000-4000-8000-000000000002','media-review-other@test.local');
insert into products(id,seller_id,slug,title,kind,price_htg,status,cover_url) values
 ('25200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000001','media-review-file','File','fichier',100,'draft','https://cdn.test/old-file.webp'),
 ('25200000-0000-4000-8000-000000000002','15200000-0000-4000-8000-000000000001','media-review-service','Service','service',100,'draft','https://cdn.test/old-service.webp'),
 ('25200000-0000-4000-8000-000000000003','15200000-0000-4000-8000-000000000001','media-review-physical','Physical','physical',100,'draft','https://cdn.test/old-physical.webp'),
 ('25200000-0000-4000-8000-000000000004','15200000-0000-4000-8000-000000000001','media-review-archived','Archived','physical',100,'draft',null),
 ('25200000-0000-4000-8000-000000000005','15200000-0000-4000-8000-000000000001','media-review-quota','Quota','physical',100,'draft',null);
insert into product_assets(product_id,storage_path,file_name,size_bytes) values
 ('25200000-0000-4000-8000-000000000001','media-review/digital.pdf','digital.pdf',100);
insert into zabelie_product_media(id,product_id,kind,storage_path) values
 ('35200000-0000-4000-8000-000000000004','25200000-0000-4000-8000-000000000004','image','media-review/archived.webp');
update products set status='archived' where id='25200000-0000-4000-8000-000000000004';

-- MR1 : chaque kind passe en brouillon avec sa nouvelle couverture. Les
-- versions digitales achetées restent des instantanés distincts et immuables.
do $$
declare p uuid; v_releases integer;
begin
  for p in select id from products where slug in ('media-review-file','media-review-service','media-review-physical') loop
    update products set status='published' where id=p;
    select count(*) into v_releases from zabelie_digital_releases where product_id=p;
    set local role service_role;
    update products set cover_url='https://cdn.test/new-'||p||'.webp' where id=p;
    reset role;
    assert (select status='draft' and cover_url='https://cdn.test/new-'||p||'.webp' from products where id=p), 'MR1: cover change stayed published';
    assert (select count(*)=v_releases from zabelie_digital_releases where product_id=p), 'MR1: cover revision rewrote digital releases';
    update products set status='published' where id=p;
    update products set cover_url=cover_url where id=p;
    assert (select status='published' from products where id=p), 'MR1: no-op cover unpublished listing';
  end loop;
end $$;

-- MR2 : insertion image/vidéo et retrait font partie de la même révision.
do $$
declare k text; m uuid;
begin
  foreach k in array array['image','video'] loop
    update products set status='published' where id='25200000-0000-4000-8000-000000000003';
    set local role service_role;
    insert into zabelie_product_media(product_id,kind,storage_path)
      values('25200000-0000-4000-8000-000000000003',k,'media-review/'||k) returning id into m;
    reset role;
    assert (select status='draft' from products where id='25200000-0000-4000-8000-000000000003'), 'MR2: inserted medium bypassed review';
    update products set status='published' where id='25200000-0000-4000-8000-000000000003';
    set local role service_role;
    delete from zabelie_product_media where id=m;
    reset role;
    assert (select status='draft' from products where id='25200000-0000-4000-8000-000000000003'), 'MR2: removed medium bypassed review';
    assert not exists(select 1 from zabelie_product_media where id=m), 'MR2: draft media removal failed';
  end loop;
end $$;

-- MR3 : identité, chemin et ordre non réécrits ; un échec ne dépublie rien.
insert into zabelie_product_media(id,product_id,kind,storage_path) values
 ('35200000-0000-4000-8000-000000000003','25200000-0000-4000-8000-000000000003','image','media-review/immutable.webp');
update products set status='published' where id='25200000-0000-4000-8000-000000000003';
do $$ begin
  begin
    update zabelie_product_media set product_id='25200000-0000-4000-8000-000000000002',kind='video',storage_path='changed',position=9
      where id='35200000-0000-4000-8000-000000000003';
    raise exception 'MR3: existing medium changed';
  exception when check_violation then
    if sqlerrm <> 'ZB152: media_immutable' then raise; end if;
  end;
  assert (select status='published' from products where id='25200000-0000-4000-8000-000000000003'), 'MR3: refused update unpublished product';
  assert (select storage_path='media-review/immutable.webp' and kind='image' and position=0
    from zabelie_product_media where id='35200000-0000-4000-8000-000000000003'), 'MR3: refused update changed media';
end $$;

-- MR4 : archived ne revient jamais en vente ni en brouillon par un média.
do $$ begin
  begin
    update products set cover_url='https://cdn.test/archived-new.webp',status='draft' where id='25200000-0000-4000-8000-000000000004';
    raise exception 'MR4: archived cover accepted';
  exception when check_violation then
    if sqlerrm <> 'ZB152: cover_archived' then raise; end if;
  end;
  begin
    insert into zabelie_product_media(product_id,kind,storage_path)
      values('25200000-0000-4000-8000-000000000004','video','media-review/archived-new.mp4');
    raise exception 'MR4: archived insert accepted';
  exception when check_violation then
    if sqlerrm <> 'ZB152: media_archived' then raise; end if;
  end;
  begin
    delete from zabelie_product_media where id='35200000-0000-4000-8000-000000000004';
    raise exception 'MR4: archived delete accepted';
  exception when check_violation then
    if sqlerrm <> 'ZB152: media_archived' then raise; end if;
  end;
  update products set cover_url=cover_url where id='25200000-0000-4000-8000-000000000004';
  assert (select status='archived' and cover_url is null from products where id='25200000-0000-4000-8000-000000000004'), 'MR4: archived product changed';
  assert exists(select 1 from zabelie_product_media where id='35200000-0000-4000-8000-000000000004'), 'MR4: archived media changed';
end $$;

-- MR5 : quotas existants et rollback de la révision en cas de refus tardif.
insert into zabelie_product_media(product_id,kind,storage_path)
 select '25200000-0000-4000-8000-000000000005','image','media-review/quota-'||n from generate_series(1,6) n;
update products set status='published' where id='25200000-0000-4000-8000-000000000005';
do $$ begin
  begin
    insert into zabelie_product_media(product_id,kind,storage_path)
      values('25200000-0000-4000-8000-000000000005','image','media-review/seventh');
    raise exception 'MR5: seventh image accepted';
  exception when others then
    if sqlerrm not like 'ZB073%' then raise; end if;
  end;
  assert (select status='published' from products where id='25200000-0000-4000-8000-000000000005'), 'MR5: quota failure unpublished listing';
  begin
    insert into zabelie_product_media(product_id,kind,storage_path,position)
      values('25200000-0000-4000-8000-000000000005','video','media-review/bad-position',99);
    raise exception 'MR5: invalid position accepted';
  exception when check_violation then null;
  end;
  assert (select status='published' from products where id='25200000-0000-4000-8000-000000000005'), 'MR5: failed insert left partial revision';
end $$;

-- MR6 : RLS/grants existants restent la frontière : même le vendeur ne peut
-- pas écrire par REST direct. La dépublication retire aussitôt la lecture publique.
do $$
declare n integer;
begin
  set local role authenticated;
  set local request.jwt.claim.sub='15200000-0000-4000-8000-000000000001';
  begin
    update products set cover_url='https://cdn.test/client.webp' where id='25200000-0000-4000-8000-000000000003';
    raise exception 'MR6: client cover update accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into zabelie_product_media(product_id,kind,storage_path)
      values('25200000-0000-4000-8000-000000000003','image','media-review/client.webp');
    raise exception 'MR6: client gallery insert accepted';
  exception when insufficient_privilege then null;
  end;
  delete from zabelie_product_media where id='35200000-0000-4000-8000-000000000003';
  get diagnostics n = row_count;
  assert n=0, 'MR6: client gallery delete accepted';
  reset role;
  update products set cover_url='https://cdn.test/private-new.webp' where id='25200000-0000-4000-8000-000000000003';
  set local role anon;
  assert not exists(select 1 from products where id='25200000-0000-4000-8000-000000000003'), 'MR6: revised product stayed public';
  assert not exists(select 1 from zabelie_product_media where id='35200000-0000-4000-8000-000000000003'), 'MR6: revised media stayed public';
  reset role;
end $$;

-- MR7 : une cascade légitime reste possible, même pour une fiche archivée.
delete from products where id='25200000-0000-4000-8000-000000000004';
do $$ begin
  assert not exists(select 1 from zabelie_product_media where id='35200000-0000-4000-8000-000000000004'), 'MR7: product deletion blocked media cascade';
end $$;

-- MR8 : la sonde distingue l'ancien trigger INSERT seul, un trigger désactivé,
-- et la migration complète. Ces contrôles négatifs tuent un faux vert de nom.
do $$ begin
  assert (select count(*)=4 from zabelie_objets_requis() where present and objet in
    ('zabelie_product_cover_review_guard()','zabelie_product_cover_review','zabelie_product_media_guard()','zabelie_product_media_guard_trg')), 'MR8: complete review guards not attested';
end $$;
alter table products disable trigger zabelie_product_cover_review;
do $$ begin
  assert exists(select 1 from zabelie_objets_requis() where objet='zabelie_product_cover_review' and not present), 'MR8: disabled cover trigger reported healthy';
end $$;
alter table products enable trigger zabelie_product_cover_review;
alter table zabelie_product_media disable trigger zabelie_product_media_guard_trg;
do $$ begin
  assert exists(select 1 from zabelie_objets_requis() where objet='zabelie_product_media_guard_trg' and not present), 'MR8: disabled gallery trigger reported healthy';
end $$;
alter table zabelie_product_media enable trigger zabelie_product_media_guard_trg;
drop trigger zabelie_product_media_guard_trg on zabelie_product_media;
create trigger zabelie_product_media_guard_trg before insert on zabelie_product_media
  for each row execute function zabelie_product_media_guard();
do $$ begin
  assert exists(select 1 from zabelie_objets_requis() where objet='zabelie_product_media_guard_trg' and not present), 'MR8: legacy INSERT-only guard reported healthy';
  raise notice 'OK media review MR1-MR8: all kinds, insert/delete, immutability, archived, quotas/rollback, RLS, cascade, killed probe mutations';
end $$;
rollback;
