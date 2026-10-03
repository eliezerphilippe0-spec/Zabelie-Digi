-- Tests des clés d'API vendeur (0121). Transaction annulée à la fin.
--
--   K1. Connu-POSITIF : une clé insérée (service role) avec ses portées par défaut.
--   K2. Plafond : la 6ᵉ clé ACTIVE est refusée ; révoquer en libère une place.
--   K3. Immuabilité : empreinte, portées, vendeur ne bougent pas ; une clé
--       révoquée ne se réactive pas ; `last_used_at` bouge.
--   K4. Contraintes : empreinte hors format, préfixe hors format, portée
--       inconnue — refusés.
--   K5. RLS : le vendeur lit SES clés seulement, n'écrit rien en direct ;
--       anon ne lit rien.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000c0001', 'k.vande@test.local'),
  ('00000000-0000-0000-0000-0000000c0002', 'k.lot@test.local');
insert into profiles (id, display_name) values
  ('00000000-0000-0000-0000-0000000c0001', 'Vandè Kle'),
  ('00000000-0000-0000-0000-0000000c0002', 'Lòt Vandè')
on conflict (id) do nothing;

-- ── K1 ──────────────────────────────────────────────────────────────────────
do $$
begin
  insert into zabelie_api_keys (seller_id, name, prefix, key_hash)
  values ('00000000-0000-0000-0000-0000000c0001', 'Mon site', 'zb_live_abc123', repeat('a', 64));
  if not exists (select 1 from zabelie_api_keys
                  where prefix = 'zb_live_abc123'
                    and scopes = array['products:read', 'sales:read', 'links:write']
                    and revoked_at is null) then
    raise exception 'K1 KO : clé nominale absente ou portées inattendues';
  end if;
  raise notice 'K1 OK — clé créée, portées par défaut';
end $$;

-- ── K2 ──────────────────────────────────────────────────────────────────────
do $$
declare i integer;
begin
  for i in 2..5 loop
    insert into zabelie_api_keys (seller_id, name, prefix, key_hash)
    values ('00000000-0000-0000-0000-0000000c0001', 'k' || i, 'zb_live_abc12' || i, repeat(i::text, 64));
  end loop;

  begin
    insert into zabelie_api_keys (seller_id, name, prefix, key_hash)
    values ('00000000-0000-0000-0000-0000000c0001', 'k6', 'zb_live_abc126', repeat('6', 64));
    raise exception 'K2 KO : 6ᵉ clé active acceptée';
  exception when sqlstate 'ZB121' then null;
  end;

  update zabelie_api_keys set revoked_at = now() where key_hash = repeat('2', 64);
  insert into zabelie_api_keys (seller_id, name, prefix, key_hash)
  values ('00000000-0000-0000-0000-0000000c0001', 'k6', 'zb_live_abc126', repeat('6', 64));

  -- L'autre vendeur n'est pas compté avec le premier.
  insert into zabelie_api_keys (seller_id, name, prefix, key_hash)
  values ('00000000-0000-0000-0000-0000000c0002', 'autre', 'zb_live_zzz999', repeat('b', 64));
  raise notice 'K2 OK — plafond de 5 actives, révocation libère, compté par vendeur';
end $$;

-- ── K3 ──────────────────────────────────────────────────────────────────────
do $$
begin
  begin
    update zabelie_api_keys set key_hash = repeat('c', 64) where key_hash = repeat('a', 64);
    raise exception 'K3 KO : empreinte modifiée';
  exception when sqlstate 'ZB121' then null;
  end;
  begin
    update zabelie_api_keys set scopes = array['webhooks:manage'] where key_hash = repeat('a', 64);
    raise exception 'K3 KO : portées élargies après coup';
  exception when sqlstate 'ZB121' then null;
  end;
  begin
    update zabelie_api_keys set seller_id = '00000000-0000-0000-0000-0000000c0002' where key_hash = repeat('a', 64);
    raise exception 'K3 KO : clé transférée à un autre vendeur';
  exception when sqlstate 'ZB121' then null;
  end;
  begin
    update zabelie_api_keys set revoked_at = null where key_hash = repeat('2', 64);
    raise exception 'K3 KO : clé révoquée réactivée';
  exception when sqlstate 'ZB121' then null;
  end;
  update zabelie_api_keys set last_used_at = now() where key_hash = repeat('a', 64);
  if not exists (select 1 from zabelie_api_keys where key_hash = repeat('a', 64) and last_used_at is not null) then
    raise exception 'K3 KO : last_used_at ne bouge pas';
  end if;
  raise notice 'K3 OK — identité et portées figées, révocation définitive';
end $$;

-- ── K4 ──────────────────────────────────────────────────────────────────────
do $$
begin
  begin
    insert into zabelie_api_keys (seller_id, name, prefix, key_hash)
    values ('00000000-0000-0000-0000-0000000c0002', 'x', 'zb_live_xxxxxx', 'PAS-UNE-EMPREINTE');
    raise exception 'K4 KO : empreinte hors format acceptée';
  exception when check_violation then null;
  end;
  begin
    insert into zabelie_api_keys (seller_id, name, prefix, key_hash)
    values ('00000000-0000-0000-0000-0000000c0002', 'x', 'sk_live_xxxxxx', repeat('d', 64));
    raise exception 'K4 KO : préfixe hors format accepté';
  exception when check_violation then null;
  end;
  begin
    insert into zabelie_api_keys (seller_id, name, prefix, key_hash, scopes)
    values ('00000000-0000-0000-0000-0000000c0002', 'x', 'zb_live_xxxxxx', repeat('e', 64), array['payouts:write']);
    raise exception 'K4 KO : portée inconnue acceptée';
  exception when check_violation then null;
  end;
  raise notice 'K4 OK — formats et portées fermés';
end $$;

-- ── K5 ──────────────────────────────────────────────────────────────────────
do $$
declare n integer;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000c0002';
  select count(*) into n from zabelie_api_keys;
  if n <> 1 then
    raise exception 'K5 KO : le vendeur 2 voit % clé(s), attendu 1', n;
  end if;
  begin
    insert into zabelie_api_keys (seller_id, name, prefix, key_hash)
    values ('00000000-0000-0000-0000-0000000c0002', 'direct', 'zb_live_dir123', repeat('f', 64));
    raise exception 'K5 KO : insertion directe acceptée';
  exception when insufficient_privilege then null;
  end;
  begin
    update zabelie_api_keys set revoked_at = now();
    raise exception 'K5 KO : mise à jour directe acceptée';
  exception when insufficient_privilege then null;
  end;
  reset role;

  set local role anon;
  begin
    select count(*) into n from zabelie_api_keys;
    raise exception 'K5 KO : anon lit la table (% lignes)', n;
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'K5 OK — lecture des siennes seulement, aucune écriture directe, anon exclu';
end $$;

rollback;
