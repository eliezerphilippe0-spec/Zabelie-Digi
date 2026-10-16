-- Date d'inscription figée côté client (0144). Transaction annulée.
-- Éprouvé sous le rôle réel `authenticated` ; le superuser sert seulement à
-- poser le décor et à relire.
--
--   F1  un client qui réécrit sa date d'inscription garde la date d'origine,
--       et le reste de sa modification (nom affiché) passe bien ;
--   F2  un profil créé par le client lui-même prend la date du jour, pas celle
--       qu'il propose ;
--   F3  le rôle reste figé, comme avant 0144 (non-régression).
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000f0001', 'fige141a@test.local'),
  ('00000000-0000-0000-0000-0000000f0002', 'fige141b@test.local')
  on conflict do nothing;
delete from profiles where id in ('00000000-0000-0000-0000-0000000f0001', '00000000-0000-0000-0000-0000000f0002');
insert into profiles (id, role, display_name, created_at)
  values ('00000000-0000-0000-0000-0000000f0001', 'buyer', 'Avant', '2026-01-01 00:00:00+00');

-- ── F1 + F3. Mise à jour du client sur sa propre ligne ──────────────────────
do $$
declare v_cree timestamptz; v_nom text; v_role text;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f0001', true);
  set local role authenticated;
  update profiles
     set created_at = '2019-01-01 00:00:00+00', display_name = 'Apres', role = 'admin'
   where id = '00000000-0000-0000-0000-0000000f0001';
  reset role;
  select created_at, display_name, role::text into v_cree, v_nom, v_role
    from profiles where id = '00000000-0000-0000-0000-0000000f0001';
  assert v_nom = 'Apres', format('F1 KO : la modification n''a pas eu lieu (nom « %s »), le test ne prouve rien', v_nom);
  assert v_cree = '2026-01-01 00:00:00+00'::timestamptz, format('F1 KO : date d''inscription réécrite en %s', v_cree);
  assert v_role = 'buyer', format('F3 KO : rôle devenu %s', v_role);
  raise notice 'F1/F3 OK — date d''inscription et rôle figés, le reste passe';
end $$;

-- ── F2. Profil créé par le client ───────────────────────────────────────────
do $$
declare v_cree timestamptz;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f0002', true);
  set local role authenticated;
  insert into profiles (id, display_name, created_at)
    values ('00000000-0000-0000-0000-0000000f0002', 'Nouveau', '2019-01-01 00:00:00+00');
  reset role;
  select created_at into v_cree from profiles where id = '00000000-0000-0000-0000-0000000f0002';
  assert v_cree = now(), format('F2 KO : date d''inscription choisie par le client (%s)', v_cree);
  raise notice 'F2 OK — un profil créé côté client prend la date du jour';
end $$;

rollback;
