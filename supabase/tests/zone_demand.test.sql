-- Tests du compteur de demande par zone (0162). Transaction annulée.
--
--   D1. Connu-POSITIF : deux enregistrements d'une zone ouverte le même jour
--       donnent UNE ligne à deux clics ; une autre zone a sa propre ligne.
--   D2. Connus-NÉGATIFS : zone nulle, inconnue, FERMÉE → false, et AUCUNE ligne
--       n'est créée. Sans eux, D1 pourrait être vert parce que la fonction
--       accepte tout.
--   D3. Aucun accès client : ni lecture, ni écriture, ni exécution de la fonction
--       `security definer` par anon ou authenticated.
--   D4. Un autre jour = une autre ligne ; le compteur ne descend jamais sous zéro.
--   D5. Cascade : supprimer la zone emporte son compteur.
begin;

insert into zabelie_zones (parent_id, level, slug, label_kr, label_fr)
select id, 'komin', 'komin-test-zd-a', 'Komin Tès ZD A', 'Commune Test ZD A'
  from zabelie_zones where code = 'HT-OU';
insert into zabelie_zones (parent_id, level, slug, label_kr, label_fr)
select id, 'komin', 'komin-test-zd-b', 'Komin Tès ZD B', 'Commune Test ZD B'
  from zabelie_zones where code = 'HT-OU';
insert into zabelie_zones (parent_id, level, slug, label_kr, label_fr, is_active)
select id, 'komin', 'komin-ferme-zd', 'Komin Fèmen ZD', 'Commune Fermee ZD', false
  from zabelie_zones where code = 'HT-OU';

-- ── D1 — le connu-positif ───────────────────────────────────────────────────
do $$
declare
  a uuid := (select id from zabelie_zones where slug = 'komin-test-zd-a');
  b uuid := (select id from zabelie_zones where slug = 'komin-test-zd-b');
begin
  if not zabelie_record_zone_demand(a) or not zabelie_record_zone_demand(a) then
    raise exception 'D1: une zone ouverte doit etre enregistree';
  end if;
  if (select count(*) from zabelie_zone_demand where zone_id = a) <> 1 then
    raise exception 'D1: une seule ligne par zone et par jour (%)', (select count(*) from zabelie_zone_demand where zone_id = a);
  end if;
  if (select hits from zabelie_zone_demand where zone_id = a) <> 2 then
    raise exception 'D1: deux clics = hits 2 (%)', (select hits from zabelie_zone_demand where zone_id = a);
  end if;
  if not zabelie_record_zone_demand(b) then raise exception 'D1: la zone B doit etre enregistree'; end if;
  if (select hits from zabelie_zone_demand where zone_id = b) <> 1 then
    raise exception 'D1: la zone B a son propre compteur';
  end if;
end $$;

-- ── D2 — les connus-négatifs ────────────────────────────────────────────────
do $$
declare
  ferme uuid := (select id from zabelie_zones where slug = 'komin-ferme-zd');
  avant bigint := (select count(*) from zabelie_zone_demand);
begin
  if zabelie_record_zone_demand(null) then raise exception 'D2: zone nulle acceptee'; end if;
  if zabelie_record_zone_demand('00000000-0000-0000-0000-00000000dead') then
    raise exception 'D2: zone inconnue acceptee';
  end if;
  if zabelie_record_zone_demand(ferme) then raise exception 'D2: zone FERMEE acceptee'; end if;
  if (select count(*) from zabelie_zone_demand) <> avant then
    raise exception 'D2: un refus a laisse une ligne';
  end if;
end $$;

-- ── D3 — aucun accès client ─────────────────────────────────────────────────
do $$
declare a uuid := (select id from zabelie_zones where slug = 'komin-test-zd-a');
begin
  if has_table_privilege('anon', 'zabelie_zone_demand', 'select')
     or has_table_privilege('authenticated', 'zabelie_zone_demand', 'select')
     or has_table_privilege('anon', 'zabelie_zone_demand', 'insert')
     or has_table_privilege('authenticated', 'zabelie_zone_demand', 'insert')
     or has_table_privilege('authenticated', 'zabelie_zone_demand', 'update')
     or has_table_privilege('authenticated', 'zabelie_zone_demand', 'delete') then
    raise exception 'D3: un role client a un droit sur le compteur';
  end if;
  if has_function_privilege('anon', 'zabelie_record_zone_demand(uuid)', 'execute')
     or has_function_privilege('authenticated', 'zabelie_record_zone_demand(uuid)', 'execute') then
    raise exception 'D3: la fonction est executable par un role client';
  end if;
  set local role authenticated;
  begin
    perform zabelie_record_zone_demand(a);
    raise exception 'D3: un utilisateur authentifie a incremente le compteur';
  exception when insufficient_privilege then null; end;
  reset role;
  set local role anon;
  begin
    perform zabelie_record_zone_demand(a);
    raise exception 'D3: anon a incremente le compteur';
  exception when insufficient_privilege then null; end;
  reset role;
end $$;

-- ── D4 — un autre jour, et jamais négatif ───────────────────────────────────
do $$
declare a uuid := (select id from zabelie_zones where slug = 'komin-test-zd-a');
begin
  insert into zabelie_zone_demand (zone_id, day, hits)
  values (a, (now() at time zone 'America/Port-au-Prince')::date - 1, 5);
  if (select count(*) from zabelie_zone_demand where zone_id = a) <> 2 then
    raise exception 'D4: un autre jour doit etre une autre ligne';
  end if;
  begin
    insert into zabelie_zone_demand (zone_id, day, hits)
    values (a, (now() at time zone 'America/Port-au-Prince')::date - 2, -1);
    raise exception 'D4: un compteur negatif a ete accepte';
  exception when check_violation then null; end;
end $$;

-- ── D5 — la cascade ─────────────────────────────────────────────────────────
do $$
declare b uuid := (select id from zabelie_zones where slug = 'komin-test-zd-b');
begin
  delete from zabelie_zones where id = b;
  if exists (select 1 from zabelie_zone_demand where zone_id = b) then
    raise exception 'D5: le compteur survit a sa zone';
  end if;
end $$;

rollback;
