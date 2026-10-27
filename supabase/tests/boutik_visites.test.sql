-- Tests des visites de vitrine (0155). Transaction annulée à la fin.
--
--   W1. Connu-POSITIF : le service compte deux vues → une ligne du jour à 2.
--   W2. Seul le service écrit : anon et authenticated ne peuvent ni appeler
--       la fonction, ni insérer, ni modifier, ni supprimer en direct.
--   W3. RLS : le vendeur lit SES lignes ; un autre vendeur et anon, rien.
--   W4. Rien n'est compté pour un vendeur suspendu ou inconnu, et rien ne lève.
--   W5. Rétention : au-delà de 400 jours, la ligne du vendeur part à
--       l'incrément suivant ; celle d'un AUTRE vendeur reste.
--   W6. Aucune valeur négative n'entre en base.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000b5501', 'v.vitrin@test.local'),
  ('00000000-0000-0000-0000-0000000b5502', 'v.lot@test.local'),
  ('00000000-0000-0000-0000-0000000b5503', 'v.sispann@test.local');
insert into profiles (id, display_name) values
  ('00000000-0000-0000-0000-0000000b5501', 'Vitrin A'),
  ('00000000-0000-0000-0000-0000000b5502', 'Vitrin B'),
  ('00000000-0000-0000-0000-0000000b5503', 'Vitrin sispann')
on conflict (id) do nothing;
update profiles set suspended_at = now() where id = '00000000-0000-0000-0000-0000000b5503';

do $$
declare v integer; n integer; jour_haiti date := (now() at time zone 'America/Port-au-Prince')::date;
begin
  set local role service_role;
  perform zabelie_boutik_visite('00000000-0000-0000-0000-0000000b5501');
  perform zabelie_boutik_visite('00000000-0000-0000-0000-0000000b5501');
  perform zabelie_boutik_visite('00000000-0000-0000-0000-0000000b5502');
  reset role;
  select vues into v from zabelie_boutik_visites
   where seller_id = '00000000-0000-0000-0000-0000000b5501' and jour = jour_haiti;
  select count(*) into n from zabelie_boutik_visites where seller_id = '00000000-0000-0000-0000-0000000b5501';
  if v is distinct from 2 or n <> 1 then
    raise exception 'W1 KO : % vue(s) sur % ligne(s), attendu 2 sur 1 (jour d''Haïti %)', v, n, jour_haiti;
  end if;
  raise notice 'W1 OK — deux vues du jour, une seule ligne';
end $$;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if has_function_privilege(r, 'public.zabelie_boutik_visite(uuid)', 'execute') then
      raise exception 'W2 KO : % peut appeler zabelie_boutik_visite', r;
    end if;
  end loop;

  set local role anon;
  begin
    perform zabelie_boutik_visite('00000000-0000-0000-0000-0000000b5501');
    raise exception 'W2 KO : anon a compté une vue';
  exception when insufficient_privilege then null;
  end;
  reset role;

  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000b5501';
  begin
    perform zabelie_boutik_visite('00000000-0000-0000-0000-0000000b5501');
    raise exception 'W2 KO : le vendeur a gonflé son propre compteur';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into zabelie_boutik_visites (seller_id, jour, vues) values ('00000000-0000-0000-0000-0000000b5501', current_date + 1, 999);
    raise exception 'W2 KO : insertion directe acceptée';
  exception when insufficient_privilege then null;
  end;
  begin
    update zabelie_boutik_visites set vues = 999 where seller_id = '00000000-0000-0000-0000-0000000b5501';
    raise exception 'W2 KO : modification directe acceptée';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from zabelie_boutik_visites where seller_id = '00000000-0000-0000-0000-0000000b5501';
    raise exception 'W2 KO : suppression directe acceptée';
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'W2 OK — seul le service écrit';
end $$;

do $$
declare n integer;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000b5501';
  select count(*) into n from zabelie_boutik_visites;
  if n <> 1 then raise exception 'W3 KO : le vendeur A lit % ligne(s), attendu 1 (la sienne)', n; end if;
  select count(*) into n from zabelie_boutik_visites where seller_id = '00000000-0000-0000-0000-0000000b5502';
  if n <> 0 then raise exception 'W3 KO : le vendeur A lit les visites de B'; end if;
  reset role;

  set local role anon;
  begin
    select count(*) into n from zabelie_boutik_visites;
    raise exception 'W3 KO : anon lit % ligne(s)', n;
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'W3 OK — chacun ses lignes, anon rien';
end $$;

do $$
declare n integer;
begin
  set local role service_role;
  perform zabelie_boutik_visite('00000000-0000-0000-0000-0000000b5503');
  perform zabelie_boutik_visite('00000000-0000-0000-0000-0000000b55ff');
  perform zabelie_boutik_visite(null);
  reset role;
  select count(*) into n from zabelie_boutik_visites
   where seller_id in ('00000000-0000-0000-0000-0000000b5503', '00000000-0000-0000-0000-0000000b55ff');
  if n <> 0 then raise exception 'W4 KO : % ligne(s) pour un suspendu ou un inconnu', n; end if;
  raise notice 'W4 OK — suspendu, inconnu et null ne comptent pas, sans lever';
end $$;

do $$
declare n integer; jour_haiti date := (now() at time zone 'America/Port-au-Prince')::date;
begin
  insert into zabelie_boutik_visites (seller_id, jour, vues) values
    ('00000000-0000-0000-0000-0000000b5501', jour_haiti - 401, 7),
    ('00000000-0000-0000-0000-0000000b5501', jour_haiti - 400, 8),
    ('00000000-0000-0000-0000-0000000b5502', jour_haiti - 401, 9);
  set local role service_role;
  perform zabelie_boutik_visite('00000000-0000-0000-0000-0000000b5501');
  reset role;
  select count(*) into n from zabelie_boutik_visites
   where seller_id = '00000000-0000-0000-0000-0000000b5501' and jour = jour_haiti - 401;
  if n <> 0 then raise exception 'W5 KO : la ligne de 401 jours est restée'; end if;
  select count(*) into n from zabelie_boutik_visites
   where seller_id = '00000000-0000-0000-0000-0000000b5501' and jour = jour_haiti - 400;
  if n <> 1 then raise exception 'W5 KO : la ligne de 400 jours est partie trop tôt'; end if;
  select count(*) into n from zabelie_boutik_visites
   where seller_id = '00000000-0000-0000-0000-0000000b5502' and jour = jour_haiti - 401;
  if n <> 1 then raise exception 'W5 KO : la purge a touché un autre vendeur'; end if;
  raise notice 'W5 OK — 400 jours glissants, par vendeur';
end $$;

do $$
begin
  begin
    insert into zabelie_boutik_visites (seller_id, jour, vues) values ('00000000-0000-0000-0000-0000000b5502', current_date - 3, -1);
    raise exception 'W6 KO : valeur négative acceptée';
  exception when check_violation then null;
  end;
  raise notice 'W6 OK — aucune valeur négative';
end $$;

rollback;
