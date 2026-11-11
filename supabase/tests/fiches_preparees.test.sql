-- Tests des fiches préparées par un assistant (0171). Transaction annulée à la fin.
--
--   F1. Connu-POSITIF : une fiche déposée (service role), expiration à 7 jours.
--   F2. Plafond : la 21ᵉ fiche EN ATTENTE est refusée ; reprendre en libère
--       une place ; le plafond est compté par vendeur.
--   F3. Contenu figé : titre, texte, prix, type, vendeur, échéance ne bougent
--       pas ; la reprise s'écrit une fois et ne se défait pas.
--   F4. Contraintes : titre vide, titre trop long, prix négatif — refusés.
--   F5. Ménage : les fiches EXPIRÉES du vendeur disparaissent à son dépôt
--       suivant, et ne comptent pas dans le plafond.
--   F6. Portée : `products:prepare` est admise sur une clé, une portée
--       inconnue reste refusée, et les portées par défaut n'ont pas bougé.
--   F7. RLS : le vendeur lit SES fiches seulement, n'écrit rien en direct ;
--       anon ne lit rien.
--   F8. Clé supprimée : la fiche reste, détachée de sa clé.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000f0001', 'f.vande@test.local'),
  ('00000000-0000-0000-0000-0000000f0002', 'f.lot@test.local');
insert into profiles (id, display_name) values
  ('00000000-0000-0000-0000-0000000f0001', 'Vandè Fich'),
  ('00000000-0000-0000-0000-0000000f0002', 'Lòt Vandè')
on conflict (id) do nothing;

-- ── F1 ──────────────────────────────────────────────────────────────────────
do $$
begin
  insert into zabelie_fiches_preparees (seller_id, kind, title, description, price_htg)
  values ('00000000-0000-0000-0000-0000000f0001', 'fichier', 'Gid pou vann sou entènèt', 'Yon PDF 40 paj.', 500);
  if not exists (select 1 from zabelie_fiches_preparees
                  where title = 'Gid pou vann sou entènèt' and reprise_at is null
                    and expires_at > now() + interval '6 days'
                    and expires_at <= now() + interval '7 days') then
    raise exception 'F1 KO : fiche nominale absente, déjà reprise ou échéance inattendue';
  end if;
  raise notice 'F1 OK — fiche déposée, en attente, échéance à 7 jours';
end $$;

-- ── F2 ──────────────────────────────────────────────────────────────────────
do $$
declare i integer;
begin
  for i in 2..20 loop
    insert into zabelie_fiches_preparees (seller_id, kind, title)
    values ('00000000-0000-0000-0000-0000000f0001', 'service', 'fiche ' || i);
  end loop;

  begin
    insert into zabelie_fiches_preparees (seller_id, kind, title)
    values ('00000000-0000-0000-0000-0000000f0001', 'service', 'fiche 21');
    raise exception 'F2 KO : 21ᵉ fiche en attente acceptée';
  exception when sqlstate 'ZB171' then null;
  end;

  update zabelie_fiches_preparees set reprise_at = now() where title = 'fiche 2';
  insert into zabelie_fiches_preparees (seller_id, kind, title)
  values ('00000000-0000-0000-0000-0000000f0001', 'service', 'fiche 21');

  -- L'autre vendeur n'est pas compté avec le premier.
  insert into zabelie_fiches_preparees (seller_id, kind, title, price_htg)
  values ('00000000-0000-0000-0000-0000000f0002', 'physical', 'Sandal kwi', 1500);
  raise notice 'F2 OK — plafond de 20 en attente, la reprise libère, compté par vendeur';
end $$;

-- ── F3 ──────────────────────────────────────────────────────────────────────
do $$
begin
  begin
    update zabelie_fiches_preparees set title = 'autre titre' where title = 'fiche 3';
    raise exception 'F3 KO : titre modifié';
  exception when sqlstate 'ZB171' then null;
  end;
  begin
    update zabelie_fiches_preparees set description = 'réécrit' where title = 'fiche 3';
    raise exception 'F3 KO : description modifiée';
  exception when sqlstate 'ZB171' then null;
  end;
  begin
    update zabelie_fiches_preparees set price_htg = 1 where title = 'fiche 3';
    raise exception 'F3 KO : prix modifié';
  exception when sqlstate 'ZB171' then null;
  end;
  begin
    update zabelie_fiches_preparees set kind = 'physical' where title = 'fiche 3';
    raise exception 'F3 KO : type modifié';
  exception when sqlstate 'ZB171' then null;
  end;
  begin
    update zabelie_fiches_preparees set seller_id = '00000000-0000-0000-0000-0000000f0002' where title = 'fiche 3';
    raise exception 'F3 KO : fiche transférée à un autre vendeur';
  exception when sqlstate 'ZB171' then null;
  end;
  begin
    update zabelie_fiches_preparees set expires_at = now() + interval '1 year' where title = 'fiche 3';
    raise exception 'F3 KO : échéance repoussée';
  exception when sqlstate 'ZB171' then null;
  end;
  begin
    update zabelie_fiches_preparees set reprise_at = null where title = 'fiche 2';
    raise exception 'F3 KO : reprise défaite';
  exception when sqlstate 'ZB171' then null;
  end;
  update zabelie_fiches_preparees set reprise_at = now() where title = 'fiche 3';
  if not exists (select 1 from zabelie_fiches_preparees where title = 'fiche 3' and reprise_at is not null) then
    raise exception 'F3 KO : la reprise ne s''écrit pas';
  end if;
  raise notice 'F3 OK — contenu figé, reprise unique et définitive';
end $$;

-- ── F4 ──────────────────────────────────────────────────────────────────────
do $$
begin
  begin
    insert into zabelie_fiches_preparees (seller_id, kind, title)
    values ('00000000-0000-0000-0000-0000000f0002', 'fichier', '   ');
    raise exception 'F4 KO : titre vide accepté';
  exception when check_violation then null;
  end;
  begin
    insert into zabelie_fiches_preparees (seller_id, kind, title)
    values ('00000000-0000-0000-0000-0000000f0002', 'fichier', repeat('x', 141));
    raise exception 'F4 KO : titre de 141 caractères accepté';
  exception when check_violation then null;
  end;
  begin
    insert into zabelie_fiches_preparees (seller_id, kind, title, price_htg)
    values ('00000000-0000-0000-0000-0000000f0002', 'fichier', 'prix négatif', -1);
    raise exception 'F4 KO : prix négatif accepté';
  exception when check_violation then null;
  end;
  begin
    insert into zabelie_fiches_preparees (seller_id, kind, title, description)
    values ('00000000-0000-0000-0000-0000000f0002', 'fichier', 'texte trop long', repeat('x', 5001));
    raise exception 'F4 KO : description de 5001 caractères acceptée';
  exception when check_violation then null;
  end;
  raise notice 'F4 OK — titre, texte et prix bornés';
end $$;

-- ── F5 ──────────────────────────────────────────────────────────────────────
-- Le trigger fige l'échéance : on le coupe le temps de vieillir deux lignes,
-- comme le ferait le passage du temps, puis on le remet.
do $$
declare n integer;
begin
  alter table zabelie_fiches_preparees disable trigger zabelie_fiches_preparees_garde;
  update zabelie_fiches_preparees
     set created_at = now() - interval '9 days', expires_at = now() - interval '2 days'
   where title in ('fiche 4', 'fiche 5');
  alter table zabelie_fiches_preparees enable trigger zabelie_fiches_preparees_garde;

  -- 21 lignes pour le vendeur 1 : 2 reprises, 2 expirées, 17 en attente. Trois dépôts tiennent.
  insert into zabelie_fiches_preparees (seller_id, kind, title)
  values ('00000000-0000-0000-0000-0000000f0001', 'service', 'après ménage 1'),
         ('00000000-0000-0000-0000-0000000f0001', 'service', 'après ménage 2'),
         ('00000000-0000-0000-0000-0000000f0001', 'service', 'après ménage 3');
  select count(*) into n from zabelie_fiches_preparees where title in ('fiche 4', 'fiche 5');
  if n <> 0 then
    raise exception 'F5 KO : % fiche(s) expirée(s) encore là après un dépôt', n;
  end if;
  -- Les expirées de l'AUTRE vendeur ne sont pas touchées par ce dépôt.
  begin
    insert into zabelie_fiches_preparees (seller_id, kind, title)
    values ('00000000-0000-0000-0000-0000000f0001', 'service', 'après ménage 4');
    raise exception 'F5 KO : 21ᵉ en attente acceptée après ménage';
  exception when sqlstate 'ZB171' then null;
  end;
  raise notice 'F5 OK — les expirées partent au dépôt suivant et ne comptent pas';
end $$;

-- ── F6 ──────────────────────────────────────────────────────────────────────
do $$
begin
  insert into zabelie_api_keys (seller_id, name, prefix, key_hash, scopes)
  values ('00000000-0000-0000-0000-0000000f0001', 'Assistant', 'zb_live_fic001', repeat('1', 64),
          array['products:read', 'sales:read', 'links:write', 'products:prepare']);
  insert into zabelie_api_keys (seller_id, name, prefix, key_hash, scopes)
  values ('00000000-0000-0000-0000-0000000f0001', 'Tout', 'zb_live_fic002', repeat('2', 64),
          array['products:read', 'sales:read', 'links:write', 'webhooks:manage', 'products:prepare']);
  begin
    insert into zabelie_api_keys (seller_id, name, prefix, key_hash, scopes)
    values ('00000000-0000-0000-0000-0000000f0001', 'x', 'zb_live_fic003', repeat('3', 64), array['products:write']);
    raise exception 'F6 KO : portée inconnue acceptée';
  exception when check_violation then null;
  end;
  insert into zabelie_api_keys (seller_id, name, prefix, key_hash)
  values ('00000000-0000-0000-0000-0000000f0001', 'Défaut', 'zb_live_fic004', repeat('4', 64));
  if not exists (select 1 from zabelie_api_keys
                  where prefix = 'zb_live_fic004'
                    and scopes = array['products:read', 'sales:read', 'links:write']) then
    raise exception 'F6 KO : les portées par défaut ont bougé';
  end if;
  raise notice 'F6 OK — products:prepare admise, jamais par défaut, liste toujours fermée';
end $$;

-- ── F8 (avant F7, qui change de rôle) ───────────────────────────────────────
do $$
declare v_cle uuid;
begin
  select id into v_cle from zabelie_api_keys where prefix = 'zb_live_fic001';
  insert into zabelie_fiches_preparees (seller_id, api_key_id, kind, title)
  values ('00000000-0000-0000-0000-0000000f0002', v_cle, 'fichier', 'déposée par clé');
  begin
    update zabelie_fiches_preparees set api_key_id = (select id from zabelie_api_keys where prefix = 'zb_live_fic002')
     where title = 'déposée par clé';
    raise exception 'F8 KO : fiche rattachée à une autre clé';
  exception when sqlstate 'ZB171' then null;
  end;
  delete from zabelie_api_keys where id = v_cle;
  if not exists (select 1 from zabelie_fiches_preparees where title = 'déposée par clé' and api_key_id is null) then
    raise exception 'F8 KO : la fiche a disparu avec sa clé, ou y est restée attachée';
  end if;
  raise notice 'F8 OK — la fiche survit à sa clé, détachée';
end $$;

-- ── F7 ──────────────────────────────────────────────────────────────────────
do $$
declare n integer;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000f0002';
  select count(*) into n from zabelie_fiches_preparees;
  if n <> 2 then
    raise exception 'F7 KO : le vendeur 2 voit % fiche(s), attendu 2', n;
  end if;
  begin
    insert into zabelie_fiches_preparees (seller_id, kind, title)
    values ('00000000-0000-0000-0000-0000000f0002', 'fichier', 'direct');
    raise exception 'F7 KO : insertion directe acceptée';
  exception when insufficient_privilege then null;
  end;
  begin
    update zabelie_fiches_preparees set reprise_at = now();
    raise exception 'F7 KO : mise à jour directe acceptée';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from zabelie_fiches_preparees;
    raise exception 'F7 KO : suppression directe acceptée';
  exception when insufficient_privilege then null;
  end;
  reset role;

  set local role anon;
  begin
    select count(*) into n from zabelie_fiches_preparees;
    raise exception 'F7 KO : anon lit la table (% ligne(s))', n;
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'F7 OK — le vendeur lit les siennes, n''écrit rien ; anon ne lit rien';
end $$;

rollback;
