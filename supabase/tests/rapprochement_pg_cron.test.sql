-- Tests du déclencheur pg_cron du rapprochement (0170). Transaction annulée à la fin.
--
-- Postgres nu n'a ni pg_net ni Vault : le test les SIMULE (schémas `net` et
-- `vault` créés ici, annulés au rollback) pour éprouver l'appel lui-même.
--
--   R1. Sans pg_net : issue `pg_net_absent`, aucune erreur, passage noté.
--   R2. pg_net présent, Vault absent : `vault_absent`, aucun appel.
--   R3. Vault présent, jeton absent ou trop court : `secret_absent`, aucun appel
--       (connu-NÉGATIF du fail-closed).
--   R4. Connu-POSITIF : jeton posé → UN appel, POST vers <site_url>/api/reconcile,
--       en-tête Bearer exact, délai de la config ; issue `appel_envoye` et
--       numéro de requête noté. Le jeton n'apparaît ni dans le retour ni en config.
--   R5. Aucun client ne peut appeler le déclencheur ni lire la config.
--   R6. La config refuse une origine non https et un délai hors bornes.
begin;

do $$
declare v text; c zabelie_rapprochement_config;
begin
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is not null then
    raise notice 'R1 sauté — pg_net réellement présent sur cette base';
    return;
  end if;
  v := zabelie_rapprochement_declencher();
  select * into c from zabelie_rapprochement_config where id;
  if v <> 'pg_net_absent' or c.derniere_issue <> 'pg_net_absent' or c.dernier_passage is null then
    raise exception 'R1 KO : issue %, config % / %', v, c.derniere_issue, c.dernier_passage;
  end if;
  raise notice 'R1 OK — sans pg_net, rien n''est appelé et le passage est noté';
end $$;

-- Simulation de pg_net : la fonction note ses arguments au lieu d'appeler.
create schema if not exists net;
create table net.appels_simules (url text, body jsonb, params jsonb, headers jsonb, delai integer);
create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
                              headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000)
returns bigint language plpgsql set search_path = net as $$
begin
  insert into net.appels_simules values (url, body, params, headers, timeout_milliseconds);
  return 4242;
end $$;

do $$
declare v text; n integer;
begin
  v := zabelie_rapprochement_declencher();
  select count(*) into n from net.appels_simules;
  if v <> 'vault_absent' or n <> 0 then
    raise exception 'R2 KO : issue %, % appel(s)', v, n;
  end if;
  raise notice 'R2 OK — sans Vault, aucun appel';
end $$;

-- Simulation de Vault (la vraie est une vue ; une table suffit au test).
create schema if not exists vault;
create table vault.decrypted_secrets (name text, decrypted_secret text);

do $$
declare v text; n integer;
begin
  v := zabelie_rapprochement_declencher();
  select count(*) into n from net.appels_simules;
  if v <> 'secret_absent' or n <> 0 then
    raise exception 'R3 KO (jeton absent) : issue %, % appel(s)', v, n;
  end if;
  insert into vault.decrypted_secrets values ('zabelie_reconcile_secret', 'trop-court');
  v := zabelie_rapprochement_declencher();
  select count(*) into n from net.appels_simules;
  if v <> 'secret_absent' or n <> 0 then
    raise exception 'R3 KO (jeton court) : issue %, % appel(s)', v, n;
  end if;
  insert into vault.decrypted_secrets values ('un_autre_secret', 'jeton-qui-nest-pas-le-bon-0123456789');
  delete from vault.decrypted_secrets where name = 'zabelie_reconcile_secret';
  v := zabelie_rapprochement_declencher();
  select count(*) into n from net.appels_simules;
  if v <> 'secret_absent' or n <> 0 then
    raise exception 'R3 KO (autre nom) : issue %, % appel(s)', v, n;
  end if;
  raise notice 'R3 OK — jeton absent, trop court ou mal nommé : aucun appel';
end $$;

do $$
declare v text; a net.appels_simules; n integer; c zabelie_rapprochement_config;
  jeton constant text := 'jeton-de-test-rapprochement-0123456789';
begin
  insert into vault.decrypted_secrets values ('zabelie_reconcile_secret', jeton);
  update zabelie_rapprochement_config set site_url = 'https://zabelie.example', delai_ms = 123456 where id;
  v := zabelie_rapprochement_declencher();
  select count(*) into n from net.appels_simules;
  select * into a from net.appels_simules limit 1;
  select * into c from zabelie_rapprochement_config where id;
  if v <> 'appel_envoye' or n <> 1 then
    raise exception 'R4 KO : issue %, % appel(s)', v, n;
  end if;
  if a.url <> 'https://zabelie.example/api/reconcile'
     or a.headers ->> 'Authorization' <> 'Bearer ' || jeton
     or a.headers ->> 'Content-Type' <> 'application/json'
     or a.delai <> 123456 then
    raise exception 'R4 KO : appel % / délai %', a.url, a.delai;
  end if;
  if c.derniere_issue <> 'appel_envoye' or c.derniere_requete <> 4242 then
    raise exception 'R4 KO : config % / %', c.derniere_issue, c.derniere_requete;
  end if;
  if v like '%' || jeton || '%' or row_to_json(c)::text like '%' || jeton || '%' then
    raise exception 'R4 KO : le jeton a fui hors de l''appel';
  end if;
  raise notice 'R4 OK — un appel POST, Bearer exact, délai de la config, jeton confiné';
end $$;

do $$
begin
  begin
    set local role anon;
    perform zabelie_rapprochement_declencher();
    raise exception 'R5 KO : anon a appelé le déclencheur';
  exception when insufficient_privilege then null;
  end;
  begin
    set local role authenticated;
    perform zabelie_rapprochement_declencher();
    raise exception 'R5 KO : authenticated a appelé le déclencheur';
  exception when insufficient_privilege then null;
  end;
  begin
    set local role authenticated;
    perform 1 from zabelie_rapprochement_config;
    raise exception 'R5 KO : authenticated a lu la config';
  exception when insufficient_privilege then null;
  end;
  raise notice 'R5 OK — aucun client n''appelle ni ne lit';
end $$;

do $$
begin
  begin
    update zabelie_rapprochement_config set site_url = 'http://zabelie.com' where id;
    raise exception 'R6 KO : origine http acceptée';
  exception when check_violation then null;
  end;
  begin
    update zabelie_rapprochement_config set site_url = 'https://evil.example/x?y' where id;
    raise exception 'R6 KO : origine avec chemin acceptée';
  exception when check_violation then null;
  end;
  begin
    update zabelie_rapprochement_config set delai_ms = 600000 where id;
    raise exception 'R6 KO : délai au-delà du maxDuration accepté';
  exception when check_violation then null;
  end;
  raise notice 'R6 OK — origine https nue et délai borné';
end $$;

rollback;
