-- Essayage virtuel, pilote (0150 ; tasks/essayage-todo.md 3.1 et 3.2 ; docs/74).
-- Transaction annulée : rien ne persiste. Chaque refus attendu est un
-- connu-négatif, chaque acceptation un connu-positif.
--
--   E1  les quinze sous-rayons ouverts, au niveau 3, sous femme, homme, sport ; rien d'autre ;
--   E2  éligibilité : publiée, physique, avec photo, vendeur pilote actif, sous-rayon ouvert, pas la sienne ;
--   E3  réserver : refus « non_eligible », demande invalide, essai inscrit sans photo ;
--   E4  quota du jour : atteint, puis un échec ne compte pas ;
--   E5  le quota repart au jour haïtien suivant ;
--   E6  plafond du mois, pour tous ; un échec ne compte pas ;
--   E7  pause ;
--   E8  lancer : une fois, sur un essai en cours ;
--   E9  terminer : une fois ; raison exigée pour un échec, refusée pour un réussi ;
--   E10 exposer : une fois par jour, fiche éligible seulement, groupe connu ;
--   E11 ni anon ni authenticated ne lisent une table ni n'exécutent une fonction ;
--       le rôle service n'écrit les essais que par les fonctions ;
--   E12 un vendeur pilote désactivé ferme ses fiches ;
--   E13 aucune colonne ne peut tenir une photo, une URL ou un résultat ;
--   E14 le compteur du mois haïtien de l'administration suit la règle de la réservation.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000e0001', 'essayage-vendeur@test.local'),
  ('00000000-0000-0000-0000-0000000e0002', 'essayage-non-pilote@test.local'),
  ('00000000-0000-0000-0000-0000000e0003', 'essayage-acheteur-a@test.local'),
  ('00000000-0000-0000-0000-0000000e0004', 'essayage-acheteur-b@test.local'),
  ('00000000-0000-0000-0000-0000000e0005', 'essayage-pilote-inactif@test.local')
  on conflict do nothing;
insert into profiles (id, display_name) values
  ('00000000-0000-0000-0000-0000000e0001', 'Vandè pilòt'),
  ('00000000-0000-0000-0000-0000000e0002', 'Vandè pa pilòt'),
  ('00000000-0000-0000-0000-0000000e0003', 'Achtè A'),
  ('00000000-0000-0000-0000-0000000e0004', 'Achtè B'),
  ('00000000-0000-0000-0000-0000000e0005', 'Vandè pilòt inaktif')
on conflict (id) do nothing;

create function pg_temp.fiche(p_id text, p_vendeur text, p_slug_rayon text, p_kind text, p_statut text, p_cover text)
returns void language sql as $$
  insert into products (id, seller_id, slug, title, kind, price_htg, status, category_id, cover_url)
  select p_id::uuid, p_vendeur::uuid, 'essayage-' || right(p_id, 4), 'Fiche ' || right(p_id, 4), p_kind::product_kind, 1500,
         p_statut::product_status, (select id from zabelie_categories where slug = p_slug_rayon), p_cover;
$$;
--             fiche                                  vendeur                                 rayon        type        statut       photo
select pg_temp.fiche('00000000-0000-0000-0000-0000000e1001', '00000000-0000-0000-0000-0000000e0001', 'wob',      'physical', 'published', 'https://exemple/robe.jpg');  -- P1 éligible
select pg_temp.fiche('00000000-0000-0000-0000-0000000e1002', '00000000-0000-0000-0000-0000000e0001', 'lenjri',   'physical', 'published', 'https://exemple/l.jpg');     -- P2 lingerie
select pg_temp.fiche('00000000-0000-0000-0000-0000000e1003', '00000000-0000-0000-0000-0000000e0001', 'rad-fanm', 'physical', 'published', 'https://exemple/f.jpg');     -- P3 niveau 2 seul
select pg_temp.fiche('00000000-0000-0000-0000-0000000e1004', '00000000-0000-0000-0000-0000000e0001', 'wob',      'physical', 'draft',     'https://exemple/b.jpg');     -- P4 brouillon
select pg_temp.fiche('00000000-0000-0000-0000-0000000e1005', '00000000-0000-0000-0000-0000000e0002', 'wob',      'physical', 'published', 'https://exemple/n.jpg');     -- P5 non pilote
select pg_temp.fiche('00000000-0000-0000-0000-0000000e1006', '00000000-0000-0000-0000-0000000e0001', 'wob',      'physical', 'published', '  ');                         -- P6 sans photo
select pg_temp.fiche('00000000-0000-0000-0000-0000000e1007', '00000000-0000-0000-0000-0000000e0001', 'wob',      'fichier',  'published', 'https://exemple/g.jpg');     -- P7 fichier
select pg_temp.fiche('00000000-0000-0000-0000-0000000e1008', '00000000-0000-0000-0000-0000000e0005', 'chemiz',   'physical', 'published', 'https://exemple/c.jpg');     -- P8 pilote inactif
select pg_temp.fiche('00000000-0000-0000-0000-0000000e1009', '00000000-0000-0000-0000-0000000e0001', 'jip',      'physical', 'published', 'https://exemple/j.jpg');     -- P9 éligible
insert into zabelie_essayage_vendeurs (seller_id, actif) values
  ('00000000-0000-0000-0000-0000000e0001', true),
  ('00000000-0000-0000-0000-0000000e0005', false);

-- Exécute une instruction sous un rôle ; rend 'ok' ou le code d'erreur.
create function pg_temp.essayer(p_role text, p_sql text)
returns text language plpgsql as $$
begin
  execute format('set local role %I', p_role);
  execute p_sql;
  reset role;
  return 'ok';
exception when others then
  reset role;
  return sqlstate || ' ' || sqlerrm;
end;
$$;
-- Réserve et rend 'essai' ou 'refus:<code>'.
create function pg_temp.reserver(p_acheteur text, p_produit text)
returns text language sql as $$
  select case when r.essai is not null then 'essai' else 'refus:' || r.refus end
    from zabelie_essayage_reserver(p_acheteur::uuid, p_produit::uuid, 'simulation') r;
$$;

do $$
declare
  v_A uuid := '00000000-0000-0000-0000-0000000e0003';
  v_B uuid := '00000000-0000-0000-0000-0000000e0004';
  v_S uuid := '00000000-0000-0000-0000-0000000e0001';
  v_P1 uuid := '00000000-0000-0000-0000-0000000e1001';
  v_r text;
  v_e1 uuid;
  v_e2 uuid;
  v_n integer;
  v_jour timestamptz := date_trunc('day', now() at time zone 'America/Port-au-Prince') at time zone 'America/Port-au-Prince';
  v_mois timestamptz := date_trunc('month', now() at time zone 'America/Port-au-Prince') at time zone 'America/Port-au-Prince';
  v_reussis integer;
  v_en_cours integer;
  v_echecs integer;
begin
  -- E1
  assert (select count(*) from zabelie_essayage_rayons) = 15, 'E1 KO compte';
  assert not exists (
    select 1 from zabelie_essayage_rayons r join zabelie_categories c on c.id = r.category_id
      join zabelie_categories p on p.id = c.parent_id
     where c.level <> 3 or p.slug not in ('rad-fanm', 'rad-gason', 'rad-espo')), 'E1 KO niveau ou parent';
  assert not exists (
    select 1 from zabelie_essayage_rayons r join zabelie_categories c on c.id = r.category_id
     where c.slug in ('lenjri', 'mayo-beny', 'souvetman-gason', 'soulye-espo', 'akseswa-espo')
        or c.parent_id = (select id from zabelie_categories where slug = 'rad-timoun')), 'E1 KO rayon fermé ouvert';

  -- E2
  assert zabelie_essayage_eligible(v_P1, v_A), 'E2 KO P1';
  assert zabelie_essayage_eligible(v_P1), 'E2 KO P1 sans acheteur';
  assert not zabelie_essayage_eligible(v_P1, v_S), 'E2 KO sa propre fiche';
  assert not zabelie_essayage_eligible('00000000-0000-0000-0000-0000000e1002', v_A), 'E2 KO lingerie';
  assert not zabelie_essayage_eligible('00000000-0000-0000-0000-0000000e1003', v_A), 'E2 KO niveau 2 seul';
  assert not zabelie_essayage_eligible('00000000-0000-0000-0000-0000000e1004', v_A), 'E2 KO brouillon';
  assert not zabelie_essayage_eligible('00000000-0000-0000-0000-0000000e1005', v_A), 'E2 KO non pilote';
  assert not zabelie_essayage_eligible('00000000-0000-0000-0000-0000000e1006', v_A), 'E2 KO sans photo';
  assert not zabelie_essayage_eligible('00000000-0000-0000-0000-0000000e1007', v_A), 'E2 KO fichier';
  assert not zabelie_essayage_eligible('00000000-0000-0000-0000-0000000e1008', v_A), 'E2 KO pilote inactif';
  assert not zabelie_essayage_eligible('00000000-0000-0000-0000-0000000eeeee', v_A), 'E2 KO fiche inconnue';

  -- E3
  v_r := pg_temp.reserver(v_A::text, '00000000-0000-0000-0000-0000000e1002');
  assert v_r = 'refus:non_eligible', 'E3 KO lingerie — ' || v_r;
  v_r := pg_temp.reserver(v_S::text, v_P1::text);
  assert v_r = 'refus:non_eligible', 'E3 KO vendeur sur sa fiche — ' || v_r;
  v_r := pg_temp.essayer('service_role', format('select * from zabelie_essayage_reserver(%L, %L, %L)', v_A, v_P1, 'openai'));
  assert v_r = '22023 essayage_demande_invalide', 'E3 KO fournisseur — ' || v_r;
  v_r := pg_temp.essayer('service_role', format('select * from zabelie_essayage_reserver(null, %L, %L)', v_P1, 'genlook'));
  assert v_r = '22023 essayage_demande_invalide', 'E3 KO acheteur absent — ' || v_r;
  select essai into v_e1 from zabelie_essayage_reserver(v_A, v_P1, 'genlook');
  assert v_e1 is not null, 'E3 KO essai';
  assert (select statut = 'en_cours' and fournisseur = 'genlook' and vendeur_id = v_S and travail_id is null and termine_le is null
            from zabelie_essayage_essais where id = v_e1), 'E3 KO ligne';

  -- E4 : quota 2 ; A a déjà e1.
  update zabelie_essayage_config set quota_jour = 2 where id;
  select essai into v_e2 from zabelie_essayage_reserver(v_A, '00000000-0000-0000-0000-0000000e1009', 'genlook');
  assert v_e2 is not null, 'E4 KO deuxième';
  v_r := pg_temp.reserver(v_A::text, v_P1::text);
  assert v_r = 'refus:quota', 'E4 KO troisième — ' || v_r;
  assert zabelie_essayage_terminer(v_e2, 'echec', 'fournisseur'), 'E4 KO échec';
  v_r := pg_temp.reserver(v_A::text, v_P1::text);
  assert v_r = 'essai', 'E4 KO un échec ne compte pas — ' || v_r;
  v_r := pg_temp.reserver(v_A::text, v_P1::text);
  assert v_r = 'refus:quota', 'E4 KO quota de nouveau — ' || v_r;
  -- Un essai abandonné « en cours » compte (garantie 4) : e1 n'est pas clos et compte toujours.
  assert (select count(*) from zabelie_essayage_essais where acheteur_id = v_A and statut = 'en_cours') = 2, 'E4 KO en cours';

  -- E5 : deux essais réussis HIER (jour haïtien) pour B : ils ne comptent pas aujourd'hui.
  insert into zabelie_essayage_essais (acheteur_id, produit_id, vendeur_id, fournisseur, statut, cree_le, termine_le)
  values (v_B, v_P1, v_S, 'genlook', 'reussi', v_jour - interval '1 minute', v_jour - interval '1 minute'),
         (v_B, v_P1, v_S, 'genlook', 'reussi', v_jour - interval '2 minutes', v_jour - interval '2 minutes');
  v_r := pg_temp.reserver(v_B::text, v_P1::text);
  assert v_r = 'essai', 'E5 KO jour suivant — ' || v_r;

  -- E6 : plafond = essais du mois qui comptent ; puis tout le monde est refusé, un échec libère une place.
  update zabelie_essayage_config set quota_jour = 100 where id;
  select count(*) into v_n from zabelie_essayage_essais
   where cree_le >= date_trunc('month', now() at time zone 'America/Port-au-Prince') at time zone 'America/Port-au-Prince' and statut <> 'echec';
  update zabelie_essayage_config set plafond_mois = v_n where id;
  v_r := pg_temp.reserver(v_B::text, v_P1::text);
  assert v_r = 'refus:plafond', 'E6 KO B — ' || v_r;
  v_r := pg_temp.reserver(v_A::text, '00000000-0000-0000-0000-0000000e1009');
  assert v_r = 'refus:plafond', 'E6 KO A — ' || v_r;
  assert zabelie_essayage_terminer(v_e1, 'echec', 'delai'), 'E6 KO échec e1';
  v_r := pg_temp.reserver(v_B::text, v_P1::text);
  assert v_r = 'essai', 'E6 KO place libérée — ' || v_r;
  update zabelie_essayage_config set plafond_mois = 1000, quota_jour = 100 where id;

  -- E7
  update zabelie_essayage_config set en_pause = true where id;
  v_r := pg_temp.reserver(v_B::text, v_P1::text);
  assert v_r = 'refus:pause', 'E7 KO — ' || v_r;
  update zabelie_essayage_config set en_pause = false where id;

  -- E8 / E9 sur un essai neuf.
  select essai into v_e1 from zabelie_essayage_reserver(v_B, v_P1, 'fashn');
  assert zabelie_essayage_lancer(v_e1, 'prediction-123'), 'E8 KO lancer';
  assert not zabelie_essayage_lancer(v_e1, 'autre'), 'E8 KO deux fois';
  assert (select travail_id from zabelie_essayage_essais where id = v_e1) = 'prediction-123', 'E8 KO travail';
  v_r := pg_temp.essayer('service_role', format('select zabelie_essayage_lancer(%L, %L)', v_e1, ''));
  assert v_r = '22023 essayage_travail_invalide', 'E8 KO travail vide — ' || v_r;
  assert not zabelie_essayage_lancer(v_e2, 'tard'), 'E8 KO essai déjà clos';

  v_r := pg_temp.essayer('service_role', format('select zabelie_essayage_terminer(%L, %L)', v_e1, 'echec'));
  assert v_r = '22023 essayage_fin_invalide', 'E9 KO échec sans raison — ' || v_r;
  v_r := pg_temp.essayer('service_role', format('select zabelie_essayage_terminer(%L, %L, %L)', v_e1, 'reussi', 'delai'));
  assert v_r = '22023 essayage_fin_invalide', 'E9 KO réussi avec raison — ' || v_r;
  v_r := pg_temp.essayer('service_role', format('select zabelie_essayage_terminer(%L, %L, %L)', v_e1, 'echec', 'inconnue'));
  assert v_r = '22023 essayage_fin_invalide', 'E9 KO raison inconnue — ' || v_r;
  v_r := pg_temp.essayer('service_role', format('select zabelie_essayage_terminer(%L, %L)', v_e1, 'en_cours'));
  assert v_r = '22023 essayage_fin_invalide', 'E9 KO statut — ' || v_r;
  v_r := pg_temp.essayer('service_role', format('select zabelie_essayage_terminer(%L, null)', v_e1));
  assert v_r = '22023 essayage_fin_invalide', 'E9 KO statut null — ' || v_r;
  assert zabelie_essayage_terminer(v_e1, 'reussi'), 'E9 KO réussi';
  assert not zabelie_essayage_terminer(v_e1, 'echec', 'delai'), 'E9 KO deux fois';
  assert (select statut = 'reussi' and raison is null and termine_le is not null from zabelie_essayage_essais where id = v_e1), 'E9 KO ligne';

  -- E10
  perform zabelie_essayage_exposer(v_A, v_P1, 'essai');
  perform zabelie_essayage_exposer(v_A, v_P1, 'essai');
  perform zabelie_essayage_exposer(v_A, '00000000-0000-0000-0000-0000000e1002', 'essai');
  perform zabelie_essayage_exposer(v_S, v_P1, 'temoin');
  assert (select count(*) from zabelie_essayage_expositions where acheteur_id = v_A) = 1, 'E10 KO une par jour, éligible seulement';
  assert not exists (select 1 from zabelie_essayage_expositions where acheteur_id = v_S), 'E10 KO vendeur sur sa fiche';
  assert (select jour from zabelie_essayage_expositions where acheteur_id = v_A) = (now() at time zone 'America/Port-au-Prince')::date, 'E10 KO jour haïtien';
  v_r := pg_temp.essayer('service_role', format('select zabelie_essayage_exposer(%L, %L, %L)', v_A, v_P1, 'autre'));
  assert v_r = '22023 essayage_exposition_invalide', 'E10 KO groupe — ' || v_r;
  v_r := pg_temp.essayer('service_role', format('select zabelie_essayage_exposer(%L, %L, null)', v_A, v_P1));
  assert v_r = '22023 essayage_exposition_invalide', 'E10 KO groupe null — ' || v_r;

  -- E12
  update zabelie_essayage_vendeurs set actif = false where seller_id = v_S;
  assert not zabelie_essayage_eligible(v_P1, v_A), 'E12 KO désactivé';
  update zabelie_essayage_vendeurs set actif = true where seller_id = v_S;
  assert zabelie_essayage_eligible(v_P1, v_A), 'E12 KO réactivé';

  -- E14 : le compteur du mois suit la règle de la réservation ; un essai du mois passé n'y est pas.
  select count(*) filter (where statut = 'reussi')::integer, count(*) filter (where statut = 'en_cours')::integer,
         count(*) filter (where statut = 'echec')::integer
    into v_reussis, v_en_cours, v_echecs
    from zabelie_essayage_essais where cree_le >= v_mois;
  assert v_reussis > 0 and v_echecs > 0, 'E14 KO jeu de test';
  assert (select count(*) from zabelie_essayage_compteur()) = 1, 'E14 KO une seule ligne';
  assert (select reussis = v_reussis and en_cours = v_en_cours and echecs = v_echecs and plafond = 1000 and quota = 100 and not pause
            from zabelie_essayage_compteur()), 'E14 KO compteur';
  insert into zabelie_essayage_essais (acheteur_id, produit_id, vendeur_id, fournisseur, statut, cree_le, termine_le)
  values (v_B, v_P1, v_S, 'genlook', 'reussi', v_mois - interval '1 minute', v_mois - interval '1 minute');
  assert (select reussis = v_reussis from zabelie_essayage_compteur()), 'E14 KO mois passé compté';
  update zabelie_essayage_config set en_pause = true where id;
  assert (select pause from zabelie_essayage_compteur()), 'E14 KO pause';
  update zabelie_essayage_config set en_pause = false where id;
end;
$$;

-- E11 : aucun accès client ; écritures des essais par les fonctions seulement.
do $$
declare
  v_role text;
  v_sql text;
  v_r text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    foreach v_sql in array array[
      'select * from zabelie_essayage_config',
      'select * from zabelie_essayage_vendeurs',
      'select * from zabelie_essayage_rayons',
      'select * from zabelie_essayage_essais',
      'select * from zabelie_essayage_expositions',
      'select zabelie_essayage_eligible(''00000000-0000-0000-0000-0000000e1001'')',
      'select * from zabelie_essayage_reserver(''00000000-0000-0000-0000-0000000e0003'', ''00000000-0000-0000-0000-0000000e1001'', ''simulation'')',
      'select zabelie_essayage_lancer(gen_random_uuid(), ''x'')',
      'select zabelie_essayage_terminer(gen_random_uuid(), ''reussi'')',
      'select zabelie_essayage_exposer(''00000000-0000-0000-0000-0000000e0003'', ''00000000-0000-0000-0000-0000000e1001'', ''essai'')',
      'select * from zabelie_essayage_compteur()'
    ] loop
      v_r := pg_temp.essayer(v_role, v_sql);
      assert v_r like '42501 %', 'E11 KO ' || v_role || ' — ' || v_sql || ' — ' || v_r;
    end loop;
  end loop;
  assert pg_temp.essayer('service_role', 'select * from zabelie_essayage_config') = 'ok', 'E11 KO service lit la config';
  assert pg_temp.essayer('service_role', 'update zabelie_essayage_config set quota_jour = quota_jour where id') = 'ok', 'E11 KO service règle';
  v_r := pg_temp.essayer('service_role',
    'insert into zabelie_essayage_essais (acheteur_id, produit_id, vendeur_id, fournisseur) values (''00000000-0000-0000-0000-0000000e0003'', ''00000000-0000-0000-0000-0000000e1001'', ''00000000-0000-0000-0000-0000000e0001'', ''genlook'')');
  assert v_r like '42501 %', 'E11 KO service écrit un essai directement — ' || v_r;
  v_r := pg_temp.essayer('service_role', 'update zabelie_essayage_essais set statut = ''echec'', raison = ''delai'', termine_le = now()');
  assert v_r like '42501 %', 'E11 KO service clôt un essai directement — ' || v_r;
  v_r := pg_temp.essayer('service_role', 'insert into zabelie_essayage_rayons select id from zabelie_categories where slug = ''lenjri''');
  assert v_r like '42501 %', 'E11 KO service ouvre un rayon — ' || v_r;

  -- E13
  assert not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name like 'zabelie_essayage_%'
       and (column_name ~ '(photo|image|url|resultat|base64)' or data_type = 'bytea')), 'E13 KO colonne photo ou résultat';
end;
$$;

rollback;
