-- Tests des pixels vendeur (0123). Transaction annulée à la fin.
--
--   X1. Connu-POSITIF : le vendeur enregistre puis modifie SES identifiants.
--   X2. Injection : tout identifiant hors format est refusé EN BASE.
--   X3. RLS : un autre vendeur ne lit ni ne modifie ; anon ne lit rien ;
--       personne ne supprime en direct.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a1001', 'p.vande@test.local'),
  ('00000000-0000-0000-0000-0000000a1002', 'p.lot@test.local');
insert into profiles (id, display_name) values
  ('00000000-0000-0000-0000-0000000a1001', 'Vandè Pixel'),
  ('00000000-0000-0000-0000-0000000a1002', 'Lòt')
on conflict (id) do nothing;

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000a1001';
  insert into zabelie_seller_pixels (seller_id, meta_pixel_id, google_tag_id, tiktok_pixel_id)
  values ('00000000-0000-0000-0000-0000000a1001', '123456789012345', 'G-AB12CD34EF', 'C4ABCDEF0123456789AB');
  update zabelie_seller_pixels set google_tag_id = 'AW-1234567890' where seller_id = '00000000-0000-0000-0000-0000000a1001';
  if (select google_tag_id from zabelie_seller_pixels) <> 'AW-1234567890' then
    raise exception 'X1 KO : mise à jour non appliquée';
  end if;
  reset role;
  raise notice 'X1 OK — le vendeur enregistre et modifie ses identifiants';
end $$;

do $$
declare essai text[]; v text;
begin
  foreach v in array array['123;alert(1)', '12345678</script>', '1234567'] loop
    begin
      update zabelie_seller_pixels set meta_pixel_id = v where seller_id = '00000000-0000-0000-0000-0000000a1001';
      raise exception 'X2 KO : meta % accepté', v;
    exception when check_violation then null;
    end;
  end loop;
  foreach v in array array['G-ab12cd34ef', 'G-AB12"+x+"', 'UA-123456-1', 'GTM-ABCDEF'] loop
    begin
      update zabelie_seller_pixels set google_tag_id = v where seller_id = '00000000-0000-0000-0000-0000000a1001';
      raise exception 'X2 KO : google % accepté', v;
    exception when check_violation then null;
    end;
  end loop;
  foreach v in array array['c4abcdef0123456789ab', 'C4ABC''); fetch(x)//', 'SHORT'] loop
    begin
      update zabelie_seller_pixels set tiktok_pixel_id = v where seller_id = '00000000-0000-0000-0000-0000000a1001';
      raise exception 'X2 KO : tiktok % accepté', v;
    exception when check_violation then null;
    end;
  end loop;
  raise notice 'X2 OK — aucun identifiant hors format n''entre en base';
end $$;

do $$
declare n integer;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000a1002';
  select count(*) into n from zabelie_seller_pixels;
  if n <> 0 then raise exception 'X3 KO : un autre vendeur lit % ligne(s)', n; end if;
  update zabelie_seller_pixels set meta_pixel_id = '99999999' where seller_id = '00000000-0000-0000-0000-0000000a1001';
  begin
    insert into zabelie_seller_pixels (seller_id, meta_pixel_id) values ('00000000-0000-0000-0000-0000000a1001', '88888888');
    raise exception 'X3 KO : insertion au nom d''un autre vendeur';
  exception when insufficient_privilege or unique_violation then null;
  end;
  reset role;
  if (select meta_pixel_id from zabelie_seller_pixels where seller_id = '00000000-0000-0000-0000-0000000a1001') <> '123456789012345' then
    raise exception 'X3 KO : un autre vendeur a modifié le pixel';
  end if;

  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000a1001';
  begin
    delete from zabelie_seller_pixels;
    raise exception 'X3 KO : suppression directe acceptée';
  exception when insufficient_privilege then null;
  end;
  reset role;

  set local role anon;
  begin
    select count(*) into n from zabelie_seller_pixels;
    raise exception 'X3 KO : anon lit les pixels';
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'X3 OK — cloisonné par vendeur, anon exclu, pas de suppression directe';
end $$;

rollback;
