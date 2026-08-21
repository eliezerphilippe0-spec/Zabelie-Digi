-- ============================================================================
-- 0086 — Tikè Lakay PR-T1 : le brouillon d'un organisateur n'est vu que par lui
-- ============================================================================
-- Critère d'acceptation de PR-T1 (`docs/40` §7) : « un organisateur ne voit pas
-- le brouillon d'un autre — connu-positif ET connu-négatif ».
--
-- Le connu-POSITIF seul ne prouverait rien : une policy qui laisse tout passer
-- rendrait « A voit son brouillon » vrai aussi. C'est E2 qui porte la valeur.
--
-- ⚠️ Comme `orders_rls_isolation`, ce fichier exerce le MOTEUR de policies avec
-- une identité choisie (`set local role` + `request.jwt.claim.sub`), pas la
-- chaîne « jeton → PostgREST → policy ». Aucun JWT n'est émis ni vérifié.
-- ============================================================================

begin;

-- ─────────────────────────── Jeu d'essai ────────────────────────────────────
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000e0a1', '{"display_name":"Òganizatè A"}'),
  ('00000000-0000-0000-0000-00000000e0b2', '{"display_name":"Òganizatè B"}'),
  ('00000000-0000-0000-0000-00000000e0c3', '{"display_name":"Vizitè"}');

update profiles set role = 'creator'
 where id in ('00000000-0000-0000-0000-00000000e0a1',
              '00000000-0000-0000-0000-00000000e0b2');

-- A : un brouillon et un événement publié. B : un brouillon.
insert into zabelie_events (id, organisateur, titre, statut, debut_a, fin_a) values
  ('00000000-0000-0000-0000-0000000ee001', '00000000-0000-0000-0000-00000000e0a1',
   'Konsè A — bouyon', 'bouyon', now() + interval '10 days', now() + interval '10 days 4 hours'),
  ('00000000-0000-0000-0000-0000000ee002', '00000000-0000-0000-0000-00000000e0a1',
   'Konsè A — pibliye', 'pibliye', now() + interval '20 days', now() + interval '20 days 4 hours'),
  ('00000000-0000-0000-0000-0000000ee003', '00000000-0000-0000-0000-00000000e0b2',
   'Konvansyon B — bouyon', 'bouyon', now() + interval '30 days', now() + interval '30 days 6 hours');

insert into zabelie_event_ticket_types (event_id, non, prix_htg, quota) values
  ('00000000-0000-0000-0000-0000000ee001', 'Gratis', 0, 100),
  ('00000000-0000-0000-0000-0000000ee002', 'Gratis', 0, 500);

-- ── E1. Connu-POSITIF — A voit son propre brouillon ────────────────────────
do $$
declare v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e0a1';
  select count(*) into v_n from zabelie_events
   where id = '00000000-0000-0000-0000-0000000ee001';
  reset role;
  assert v_n = 1, format('E1 KO : A ne voit pas son propre brouillon (%s)', v_n);
  raise notice 'E1 OK — l''organisateur voit son brouillon';
end $$;

-- ── E2. Connu-NÉGATIF — A ne voit PAS le brouillon de B ────────────────────
-- C'est l'assertion qui porte tout le test.
do $$
declare v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e0a1';
  select count(*) into v_n from zabelie_events
   where id = '00000000-0000-0000-0000-0000000ee003';
  reset role;
  assert v_n = 0,
    format('E2 KO : A voit le brouillon de B (%s ligne) — un evenement non publie fuite avant son annonce', v_n);
  raise notice 'E2 OK — le brouillon de B est invisible pour A';
end $$;

-- ⚠️ LE PIÈGE, ET IL A MORDU. `set local` est TRANSACTIONNEL, pas « par bloc » :
-- le `request.jwt.claim.sub` posé en E1 survit jusqu'à la fin du fichier. Un
-- bloc qui fait `set local role anon` SANS effacer la revendication incarne
-- donc encore l'utilisateur précédent — et `auth.uid()` rend son identité.
-- Première exécution : E3 a échoué en annonçant « anon voit 1 brouillon », ce
-- qui accusait la policy. La policy était juste ; le test se mentait.
-- D'où `set local request.jwt.claim.sub = ''` — `nullif(…, '')` du stub le
-- ramène à NULL, c'est-à-dire un visiteur sans jeton. Chaque bloc déclare son
-- identité en entier ; aucun n'hérite de celle du précédent.

-- ── E3. Le public voit le publié, et LUI SEUL ──────────────────────────────
do $$
declare v_pub int; v_brouillons int;
begin
  set local role anon;
  set local request.jwt.claim.sub = '';
  assert (select auth.uid()) is null,
    'E3 KO : auth.uid() n''est pas NULL — la revendication d''un bloc precedent a fuite, ce test ne mesure pas anon';
  select count(*) into v_pub from zabelie_events
   where id = '00000000-0000-0000-0000-0000000ee002';
  select count(*) into v_brouillons from zabelie_events
   where id in ('00000000-0000-0000-0000-0000000ee001','00000000-0000-0000-0000-0000000ee003');
  reset role;
  assert v_pub = 1, 'E3 KO : anon ne voit pas l''evenement publie — la vitrine serait vide';
  assert v_brouillons = 0,
    format('E3 KO : anon voit %s brouillon(s)', v_brouillons);
  raise notice 'E3 OK — anon voit le publie, aucun brouillon';
end $$;

-- ── E4. Les catégories suivent leur événement, jamais leur propre visibilité ─
do $$
declare v_pub int; v_bro int;
begin
  set local role anon;
  set local request.jwt.claim.sub = '';
  assert (select auth.uid()) is null, 'E4 KO : auth.uid() n''est pas NULL — revendication heritee';
  select count(*) into v_pub from zabelie_event_ticket_types
   where event_id = '00000000-0000-0000-0000-0000000ee002';
  select count(*) into v_bro from zabelie_event_ticket_types
   where event_id = '00000000-0000-0000-0000-0000000ee001';
  reset role;
  assert v_pub = 1, 'E4 KO : les categories d''un evenement publie sont invisibles';
  assert v_bro = 0,
    'E4 KO : les categories d''un BROUILLON sont visibles — la grille tarifaire fuite avant l''annonce';
  raise notice 'E4 OK — les categories heritent de la visibilite de l''evenement';
end $$;

-- ── E5. A ne peut pas ÉCRIRE dans l'événement de B ─────────────────────────
-- Lire et écrire sont deux surfaces : une policy de lecture juste avec une
-- policy d'écriture large laisserait A renommer le concert de B.
do $$
declare v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e0a1';
  update zabelie_events set titre = 'Détourné par A'
   where id = '00000000-0000-0000-0000-0000000ee003';
  get diagnostics v_n = row_count;
  reset role;
  assert v_n = 0, format('E5 KO : A a modifie %s ligne(s) de B', v_n);
  raise notice 'E5 OK — A ne peut pas ecrire dans l''evenement de B';
end $$;

-- ── E6. ⛔ LE VERROU DU PAYANT ─────────────────────────────────────────────
-- Le contrôle le plus important du fichier. Tant que
-- `zabelie_ticket_config.paiement_ouvert` est false, aucun prix non nul
-- n'entre — c'est la traduction en base de ce que le dossier BRH ne permet
-- pas encore (`docs/40` §3).
do $$
declare v_refus boolean := false;
begin
  begin
    insert into zabelie_event_ticket_types (event_id, non, prix_htg, quota)
    values ('00000000-0000-0000-0000-0000000ee002', 'VIP payant', 2500, 50);
  exception when check_violation then
    v_refus := true;
  end;
  assert v_refus,
    'E6 KO : un billet PAYANT a ete accepte alors que paiement_ouvert est false. La billetterie payante serait ouverte sans l''avis du cabinet — docs/40 §3, docs/17.';
  raise notice 'E6 OK — prix non nul refuse tant que le verrou est ferme';
end $$;

-- ── E7. Le verrou S'OUVRE quand on le déverrouille ─────────────────────────
-- Sans ce cas, E6 pourrait passer parce que la contrainte refuse TOUT prix,
-- verrou ou pas — un garde qui interdit tout n'a rien mesuré.
do $$
declare v_ok boolean := false;
begin
  update zabelie_ticket_config set paiement_ouvert = true;
  begin
    insert into zabelie_event_ticket_types (event_id, non, prix_htg, quota)
    values ('00000000-0000-0000-0000-0000000ee002', 'VIP ouvert', 2500, 50);
    v_ok := true;
  exception when check_violation then
    v_ok := false;
  end;
  update zabelie_ticket_config set paiement_ouvert = false;
  assert v_ok,
    'E7 KO : le prix est refuse MEME avec paiement_ouvert = true — la contrainte ne lit pas la config, elle interdit tout. E6 ne prouverait alors rien.';
  raise notice 'E7 OK — le verrou depend bien de la config, dans les deux sens';
end $$;

-- ── E8. Une zone de niveau depatman est refusée (ZB086) ────────────────────
do $$
declare v_refus boolean := false;
begin
  begin
    insert into zabelie_events (organisateur, titre, zone_id, debut_a, fin_a)
    select '00000000-0000-0000-0000-00000000e0a1', 'Mauvaise zone', z.id,
           now() + interval '5 days', now() + interval '5 days 2 hours'
      from zabelie_zones z where z.level = 'depatman' limit 1;
  exception when others then
    v_refus := sqlerrm like '%ZB086%';
  end;
  assert v_refus,
    'E8 KO : un evenement a ete rattache a un DEPATMAN — un departement ne dit pas ou aller';
  raise notice 'E8 OK — le niveau depatman est refuse';
end $$;

-- ── E9. Le verrou est un TRIGGER, jamais une contrainte `check` ────────────
-- Contrôle STRUCTUREL, et il garde une propriété qu'aucun test de
-- comportement ne peut voir : un `check` est inline dans `pg_dump`, donc actif
-- pendant le `COPY`. L'ordre des COPY etant alphabetique,
-- `zabelie_event_ticket_types` se recharge AVANT `zabelie_ticket_config` —
-- config vide, verrou lu `false`, billets payants legitimes REFUSES, et
-- `psql < dump.sql` sort avec le code 0. Mesure du 2026-08-21 : evenement
-- restaure, ses categories PERDUES, aucune alerte.
--
-- E6 et E7 restent verts avec un `check`. C'est exactement pour ca que ce cas
-- existe : le defaut ne se voit pas a l'insertion, seulement a la
-- restauration — et on ne restaure que le jour ou on en a besoin.
do $$
declare v_trig int; v_check int;
begin
  select count(*) into v_trig from pg_trigger
   where tgrelid = 'public.zabelie_event_ticket_types'::regclass
     and tgname = 'trg_zabelie_verrou_billet_payant'
     and not tgisinternal;
  assert v_trig = 1,
    'E9 KO : le trigger du verrou du payant est absent — le verrou ne tient plus';

  select count(*) into v_check from pg_constraint
   where conrelid = 'public.zabelie_event_ticket_types'::regclass
     and conname = 'zabelie_ticket_types_gratuit_tant_que_ferme';
  assert v_check = 0,
    'E9 KO : la contrainte check du verrou est revenue. Elle casse la restauration des billets payants EN SILENCE (exit 0, lignes perdues) — voir 0086, en-tete du verrou.';

  raise notice 'E9 OK — verrou porte par un trigger, aucune contrainte check residuelle';
end $$;

-- ── E10. ⛔ LE VERROU SOUS LE VRAI RÔLE — les deux sens ────────────────────
-- E6 et E7 tournent sous le PROPRIÉTAIRE de la base. Aucun organisateur réel
-- n'écrit sous ce rôle. Mesuré le 2026-08-21 sur la première rédaction : sous
-- `authenticated`, verrou OUVERT, un billet payant rendait
--   ERROR: permission denied for table zabelie_ticket_config  (42501)
-- parce que la config est révoquée d'`authenticated` et que la fonction était
-- `security invoker`. Le billet GRATUIT passait — `prix_htg = 0`
-- court-circuite le `or` — donc tout AVAIT L'AIR de marcher. Le jour de
-- l'ouverture, rien n'aurait fonctionné.
--
-- Ce cas est le connu-positif que E7 ne pouvait pas être.
do $$
declare v_ouvert_ok boolean := false; v_ferme_refus boolean := false; v_err text;
begin
  -- ① verrou OUVERT, rôle authenticated : le billet payant doit PASSER.
  update zabelie_ticket_config set paiement_ouvert = true;
  begin
    set local role authenticated;
    set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e0a1';
    insert into zabelie_event_ticket_types (event_id, non, prix_htg, quota)
    values ('00000000-0000-0000-0000-0000000ee002', 'VIP authentifie', 900, 5);
    v_ouvert_ok := true;
  exception when others then
    v_err := sqlstate || ' ' || sqlerrm;
  end;
  reset role;
  assert v_ouvert_ok,
    format('E10 KO : verrou OUVERT, un organisateur authentifie ne peut PAS creer de billet payant — %s. Le verrou refuse pour la mauvaise raison ; il tiendrait ferme le jour de son ouverture.', coalesce(v_err, 'sans erreur'));

  -- ② verrou FERMÉ, même rôle : refus, et un refus de VERROU (23514), pas un
  --    refus de DROITS (42501). Les deux se ressemblent à l'écran.
  update zabelie_ticket_config set paiement_ouvert = false;
  begin
    set local role authenticated;
    set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000e0a1';
    insert into zabelie_event_ticket_types (event_id, non, prix_htg, quota)
    values ('00000000-0000-0000-0000-0000000ee002', 'VIP refuse', 900, 5);
  exception when others then
    v_ferme_refus := (sqlstate = '23514');
    v_err := sqlstate || ' ' || sqlerrm;
  end;
  reset role;
  assert v_ferme_refus,
    format('E10 KO : verrou FERME, le refus attendu est check_violation (23514), obtenu %s', coalesce(v_err, 'aucun refus du tout'));

  raise notice 'E10 OK — sous authenticated : accepte verrou ouvert, refuse (23514) verrou ferme';
end $$;

rollback;
