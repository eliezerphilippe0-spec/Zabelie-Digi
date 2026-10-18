-- Studio de création éditoriale — suppression d'un projet et purge des comptes
-- fermés (0149 ; tâche 5.3 ; PRD T21 ; docs/70 §7.6). Transaction annulée.
-- Rôles réels ; chaque refus attendu est un connu-négatif, chaque acceptation
-- un connu-positif.
--
--   RT1 B ne supprime pas le projet de A ; anon n'appelle rien ;
--   RT2 un projet actif ne se supprime pas (archivage d'abord) ;
--   RT3 un projet qui a servi aujourd'hui attend demain ; une demande annulée avant l'envoi ne compte pas ;
--   RT4 la vérification rend les chemins des PDF et ne supprime rien ;
--   RT5 T21 : la suppression emporte révisions, opérations et exports ; la fiche, son fichier,
--       sa version publiée et le droit de l'acheteur restent ; le lien passe à null ;
--   RT6 la purge ne voit que les comptes fermés, attend demain pour un projet servi aujourd'hui,
--       et revérifie tout au moment de supprimer ;
--   RT7 la purge reste au service role.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a1901', 'retention-a@test.local'),
  ('00000000-0000-0000-0000-0000000a1902', 'retention-b@test.local'),
  ('00000000-0000-0000-0000-0000000a1903', 'retention-acheteur@test.local')
  on conflict do nothing;
delete from profiles where id in ('00000000-0000-0000-0000-0000000a1901', '00000000-0000-0000-0000-0000000a1902', '00000000-0000-0000-0000-0000000a1903');
insert into profiles (id, role, display_name) values
  ('00000000-0000-0000-0000-0000000a1901', 'creator', 'Auteur retention A'),
  ('00000000-0000-0000-0000-0000000a1902', 'creator', 'Auteur retention B'),
  ('00000000-0000-0000-0000-0000000a1903', 'buyer', 'Acheteur retention');

-- A : f1 (archivé, vendu), f2 (actif), f3 (archivé, servi aujourd'hui), f5 (archivé, demande annulée).
-- B : f4 (rien aujourd'hui), f6 (servi aujourd'hui).
insert into zabelie_authoring_projects (id, seller_id, titre, langue, public_vise) values
  ('00000000-0000-0000-0000-0000000a19f1', '00000000-0000-0000-0000-0000000a1901', 'Gid vandi', 'ht', 'haiti'),
  ('00000000-0000-0000-0000-0000000a19f2', '00000000-0000-0000-0000-0000000a1901', 'Gid aktif', 'ht', 'haiti'),
  ('00000000-0000-0000-0000-0000000a19f3', '00000000-0000-0000-0000-0000000a1901', 'Gid jodi a', 'ht', 'haiti'),
  ('00000000-0000-0000-0000-0000000a19f5', '00000000-0000-0000-0000-0000000a1901', 'Gid anile', 'ht', 'haiti'),
  ('00000000-0000-0000-0000-0000000a19f4', '00000000-0000-0000-0000-0000000a1902', 'Gid B', 'fr', 'haiti'),
  ('00000000-0000-0000-0000-0000000a19f6', '00000000-0000-0000-0000-0000000a1902', 'Gid B jodi a', 'fr', 'haiti');

-- Une révision par projet (instantané interne, comme le font les fonctions de 0142).
do $$
declare v uuid;
begin
  foreach v in array array['00000000-0000-0000-0000-0000000a19f1', '00000000-0000-0000-0000-0000000a19f3',
                           '00000000-0000-0000-0000-0000000a19f5', '00000000-0000-0000-0000-0000000a19f6']::uuid[] loop
    perform zabelie_authoring_instantane(v);
  end loop;
end $$;

-- Opérations : une en attente (f3, f6 : servis aujourd'hui), une annulée avant l'envoi (f5 : quota rendu).
insert into zabelie_authoring_operations (seller_id, project_id, revision_id, type, idempotency_key, empreinte)
select r.seller_id, r.project_id, r.id, 'plan', gen_random_uuid(), repeat('1', 64)
  from zabelie_authoring_revisions r
 where r.project_id in ('00000000-0000-0000-0000-0000000a19f1', '00000000-0000-0000-0000-0000000a19f3',
                        '00000000-0000-0000-0000-0000000a19f5', '00000000-0000-0000-0000-0000000a19f6');
-- f1 : son opération est d'avant-hier et terminée ; f5 : annulée avant l'envoi.
update zabelie_authoring_operations set etat = 'cancelled', code_erreur = 'annule_par_vendeur'
 where project_id in ('00000000-0000-0000-0000-0000000a19f1', '00000000-0000-0000-0000-0000000a19f5');
alter table zabelie_authoring_operations disable trigger user;
update zabelie_authoring_operations set created_at = now() - interval '2 days'
 where project_id = '00000000-0000-0000-0000-0000000a19f1';
alter table zabelie_authoring_operations enable trigger user;

-- Exports (le propriétaire de la base écrit ici ce que la fonction du service role écrit en vrai).
insert into zabelie_authoring_exports (project_id, seller_id, revision, moteur, chemin, empreinte, taille, pages,
                                       extrait_chemin, extrait_empreinte, extrait_taille, extrait_pages) values
  ('00000000-0000-0000-0000-0000000a19f1', '00000000-0000-0000-0000-0000000a1901', 1, 'zabelie-pdf-1',
   '00000000-0000-0000-0000-0000000a1901/00000000-0000-0000-0000-0000000a19f1/a.pdf', repeat('a', 64), 1000, 10,
   '00000000-0000-0000-0000-0000000a1901/00000000-0000-0000-0000-0000000a19f1/a-extrait.pdf', repeat('b', 64), 300, 3),
  ('00000000-0000-0000-0000-0000000a19f4', '00000000-0000-0000-0000-0000000a1902', 1, 'zabelie-pdf-1',
   '00000000-0000-0000-0000-0000000a1902/00000000-0000-0000-0000-0000000a19f4/c.pdf', repeat('c', 64), 1000, 10,
   '00000000-0000-0000-0000-0000000a1902/00000000-0000-0000-0000-0000000a19f4/c-extrait.pdf', repeat('d', 64), 300, 3);

-- La fiche de f1, mise en vente, et un acheteur (T21) : version publiée et droit épinglé.
insert into products (id, seller_id, slug, title, kind, price_htg, status, zabelie_authoring_project_id) values
  ('00000000-0000-0000-0000-0000000a1991', '00000000-0000-0000-0000-0000000a1901', 'gid-vandi-retention', 'Gid vandi', 'fichier', 500, 'draft',
   '00000000-0000-0000-0000-0000000a19f1');
insert into product_assets (id, product_id, storage_path, file_name, size_bytes) values
  ('00000000-0000-0000-0000-0000000a1992', '00000000-0000-0000-0000-0000000a1991',
   '00000000-0000-0000-0000-0000000a1901/00000000-0000-0000-0000-0000000a1991/liv-aaaaaaaa-aaaa-8aaa-aaaa-aaaaaaaaaaaa.pdf', 'Gid_vandi.pdf', 1000);
update products set status = 'published' where id = '00000000-0000-0000-0000-0000000a1991';
insert into orders (id, buyer_id, product_id, amount_htg, status) values
  ('00000000-0000-0000-0000-0000000a1993', '00000000-0000-0000-0000-0000000a1903', '00000000-0000-0000-0000-0000000a1991', 500, 'pending');

update zabelie_authoring_projects set archived_at = now()
 where id in ('00000000-0000-0000-0000-0000000a19f1', '00000000-0000-0000-0000-0000000a19f3',
              '00000000-0000-0000-0000-0000000a19f5', '00000000-0000-0000-0000-0000000a19f4', '00000000-0000-0000-0000-0000000a19f6');

-- Exécute une instruction sous un rôle et une session ; rend 'ok' ou le code d'erreur.
create function pg_temp.essayer(p_role text, p_qui uuid, p_sql text)
returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_qui::text, ''), true);
  execute format('set local role %I', p_role);
  execute p_sql;
  reset role;
  return 'ok';
exception when others then
  reset role;
  return sqlstate || ' ' || sqlerrm;
end;
$$;

create function pg_temp.supprimer(p_projet uuid, p_executer boolean)
returns text language sql as $$
  select format('select * from zabelie_authoring_supprimer_projet(%L, %L)', p_projet, p_executer);
$$;

-- ── RT1. Ni B, ni anon ─────────────────────────────────────────────────────
do $$
declare v_r text;
begin
  v_r := pg_temp.essayer('authenticated', '00000000-0000-0000-0000-0000000a1902',
           pg_temp.supprimer('00000000-0000-0000-0000-0000000a19f1', true));
  assert v_r = '42501 authoring_projet_introuvable', 'RT1 KO B — ' || v_r;
  v_r := pg_temp.essayer('anon', null, pg_temp.supprimer('00000000-0000-0000-0000-0000000a19f1', true));
  assert v_r like '42501 %', 'RT1 KO anon — ' || v_r;
  assert exists (select 1 from zabelie_authoring_projects where id = '00000000-0000-0000-0000-0000000a19f1'), 'RT1 KO projet';
  raise notice 'RT1 OK — B et anon refuses';
end $$;

-- ── RT2. Archivage d'abord ─────────────────────────────────────────────────
do $$
declare v_r text;
begin
  v_r := pg_temp.essayer('authenticated', '00000000-0000-0000-0000-0000000a1901',
           pg_temp.supprimer('00000000-0000-0000-0000-0000000a19f2', true));
  assert v_r = 'P0001 authoring_archive_requis', 'RT2 KO — ' || v_r;
  raise notice 'RT2 OK — projet actif refuse';
end $$;

-- ── RT3. Servi aujourd'hui : demain ; annulé avant l'envoi : maintenant ────
do $$
declare v_r text;
begin
  v_r := pg_temp.essayer('authenticated', '00000000-0000-0000-0000-0000000a1901',
           pg_temp.supprimer('00000000-0000-0000-0000-0000000a19f3', true));
  assert v_r = 'P0001 authoring_suppression_demain', 'RT3 KO servi — ' || v_r;
  v_r := pg_temp.essayer('authenticated', '00000000-0000-0000-0000-0000000a1901',
           pg_temp.supprimer('00000000-0000-0000-0000-0000000a19f5', true));
  assert v_r = 'ok', 'RT3 KO annule — ' || v_r;
  assert not exists (select 1 from zabelie_authoring_projects where id = '00000000-0000-0000-0000-0000000a19f5'), 'RT3 KO f5';
  assert exists (select 1 from zabelie_authoring_projects where id = '00000000-0000-0000-0000-0000000a19f3'), 'RT3 KO f3';
  raise notice 'RT3 OK — servi aujourd''hui refuse, annule supprime';
end $$;

-- ── RT4. La vérification seule ─────────────────────────────────────────────
do $$
declare v_n int;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a1901', true);
  set local role authenticated;
  select count(*) into v_n from zabelie_authoring_supprimer_projet('00000000-0000-0000-0000-0000000a19f1', false)
   where chemin like '00000000-0000-0000-0000-0000000a1901/00000000-0000-0000-0000-0000000a19f1/%';
  reset role;
  assert v_n = 2, 'RT4 KO chemins — ' || v_n;
  assert exists (select 1 from zabelie_authoring_projects where id = '00000000-0000-0000-0000-0000000a19f1'), 'RT4 KO supprime';
  assert (select count(*) from zabelie_authoring_exports where project_id = '00000000-0000-0000-0000-0000000a19f1') = 1, 'RT4 KO export';
  raise notice 'RT4 OK — deux chemins, rien de supprime';
end $$;

-- ── RT5. T21 : la suppression ne touche ni la fiche ni l'acheteur ──────────
do $$
declare
  v_r text;
  v_release uuid := (select release_id from zabelie_digital_entitlements where order_id = '00000000-0000-0000-0000-0000000a1993');
begin
  assert v_release is not null, 'RT5 KO preparation : aucun droit epingle';
  v_r := pg_temp.essayer('authenticated', '00000000-0000-0000-0000-0000000a1901',
           pg_temp.supprimer('00000000-0000-0000-0000-0000000a19f1', true));
  assert v_r = 'ok', 'RT5 KO — ' || v_r;
  assert not exists (select 1 from zabelie_authoring_projects where id = '00000000-0000-0000-0000-0000000a19f1'), 'RT5 KO projet';
  assert not exists (select 1 from zabelie_authoring_revisions where project_id = '00000000-0000-0000-0000-0000000a19f1'), 'RT5 KO revisions';
  assert not exists (select 1 from zabelie_authoring_operations where project_id = '00000000-0000-0000-0000-0000000a19f1'), 'RT5 KO operations';
  assert not exists (select 1 from zabelie_authoring_exports where project_id = '00000000-0000-0000-0000-0000000a19f1'), 'RT5 KO exports';
  assert exists (select 1 from products where id = '00000000-0000-0000-0000-0000000a1991'
                   and status = 'published' and zabelie_authoring_project_id is null), 'RT5 KO fiche';
  assert exists (select 1 from product_assets where id = '00000000-0000-0000-0000-0000000a1992'), 'RT5 KO fichier vendu';
  assert exists (select 1 from zabelie_digital_releases where id = v_release), 'RT5 KO version';
  assert (select release_id from zabelie_digital_entitlements where order_id = '00000000-0000-0000-0000-0000000a1993') = v_release, 'RT5 KO droit';
  raise notice 'RT5 OK — guide supprime, fiche, fichier, version et droit intacts';
end $$;

-- ── RT6. Purge des comptes fermés ──────────────────────────────────────────
update profiles set suspended_at = now(), suspended_reason = 'account_closed'
 where id = '00000000-0000-0000-0000-0000000a1902';
do $$
declare
  v_ids uuid[];
  v_chemins text[];
  v_n int;
begin
  set local role service_role;
  select array_agg(project_id order by project_id) into v_ids
    from zabelie_authoring_purge_candidats(200)
   -- Bornée aux projets de ce test (d'autres scripts de la CI laissent leurs lignes) ;
   -- aucune lecture de table sous le rôle : seulement la fonction.
   where project_id = any(array['00000000-0000-0000-0000-0000000a19f2', '00000000-0000-0000-0000-0000000a19f3',
                                '00000000-0000-0000-0000-0000000a19f4', '00000000-0000-0000-0000-0000000a19f6']::uuid[]);
  select chemins into v_chemins from zabelie_authoring_purge_candidats(200)
   where project_id = '00000000-0000-0000-0000-0000000a19f4';
  reset role;
  -- Seul f4 : f6 a servi aujourd'hui, les projets de A appartiennent à un compte ouvert.
  assert v_ids = array['00000000-0000-0000-0000-0000000a19f4']::uuid[], 'RT6 KO candidats — ' || coalesce(v_ids::text, 'aucun');
  assert v_chemins = array['00000000-0000-0000-0000-0000000a1902/00000000-0000-0000-0000-0000000a19f4/c-extrait.pdf',
                           '00000000-0000-0000-0000-0000000a1902/00000000-0000-0000-0000-0000000a19f4/c.pdf'], 'RT6 KO chemins';
  -- La suppression revérifie : f6 (servi) et f2 (compte ouvert) restent, même nommés.
  set local role service_role;
  v_n := zabelie_authoring_purge_comptes_fermes(array['00000000-0000-0000-0000-0000000a19f4', '00000000-0000-0000-0000-0000000a19f6',
                                                      '00000000-0000-0000-0000-0000000a19f2']::uuid[]);
  reset role;
  assert v_n = 1, 'RT6 KO suppression — ' || v_n;
  assert not exists (select 1 from zabelie_authoring_projects where id = '00000000-0000-0000-0000-0000000a19f4'), 'RT6 KO f4';
  assert (select count(*) from zabelie_authoring_projects
           where id in ('00000000-0000-0000-0000-0000000a19f6', '00000000-0000-0000-0000-0000000a19f2')) = 2, 'RT6 KO restes';
  raise notice 'RT6 OK — un projet purge, deux gardes';
end $$;

-- ── RT7. La purge reste au service role ────────────────────────────────────
do $$
declare v_r text;
begin
  v_r := pg_temp.essayer('authenticated', '00000000-0000-0000-0000-0000000a1901',
           'select zabelie_authoring_purge_comptes_fermes(array[''00000000-0000-0000-0000-0000000a19f3'']::uuid[])');
  assert v_r like '42501 %', 'RT7 KO purge — ' || v_r;
  v_r := pg_temp.essayer('authenticated', '00000000-0000-0000-0000-0000000a1901', 'select * from zabelie_authoring_purge_candidats(10)');
  assert v_r like '42501 %', 'RT7 KO candidats — ' || v_r;
  v_r := pg_temp.essayer('authenticated', '00000000-0000-0000-0000-0000000a1901',
           'select zabelie_authoring_projet_utilise(''00000000-0000-0000-0000-0000000a19f3'')');
  assert v_r like '42501 %', 'RT7 KO regle interne — ' || v_r;
  raise notice 'RT7 OK — purge et regle interne fermees aux clients';
end $$;

rollback;
