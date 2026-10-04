-- Tests du domaine personnalisé (0125). Transaction annulée.
--
--   D1. Connu-POSITIF : un vendeur vérifié demande, l'admin active, l'hôte
--       (avec ou sans www, en majuscules) rend la boutique.
--   D2. Refus : non vérifié, sans adresse de boutique, format invalide,
--       domaine Zabelie, domaine pris par un autre.
--   D3. Ce qui coupe un domaine actif : vérification retirée, vendeur
--       suspendu — sans action admin.
--   D4. Décisions : refus sans motif interdit ; activation d'un non-éligible
--       refusée ; nouvelle demande = repasse en attente ; retrait.
--   D5. Accès : anon ne lit pas la table et n'appelle que la lecture
--       publique ; un vendeur ne voit que SA ligne.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000d0001', 'dom-a@test.local'),
  ('00000000-0000-0000-0000-0000000d0002', 'dom-b@test.local'),
  ('00000000-0000-0000-0000-0000000d0003', 'dom-c@test.local');
insert into profiles (id, display_name) select id, 'Domèn' from auth.users
  where id::text like '00000000-0000-0000-0000-0000000d000%' on conflict (id) do nothing;
update profiles set boutik_slug = 'dom-a' where id = '00000000-0000-0000-0000-0000000d0001';
update profiles set boutik_slug = 'dom-b' where id = '00000000-0000-0000-0000-0000000d0002';
insert into zabelie_kyc_submissions (user_id, status, decided_at) values
  ('00000000-0000-0000-0000-0000000d0001', 'approved', now()),
  ('00000000-0000-0000-0000-0000000d0002', 'pending', null),
  ('00000000-0000-0000-0000-0000000d0003', 'approved', now());

do $$
declare a uuid := '00000000-0000-0000-0000-0000000d0001'; r jsonb;
begin
  r := zabelie_domaine_demander(a, '  WWW.Boutik-Mari.HT. ');
  if r->>'ok' is distinct from 'true' or r->>'domaine' is distinct from 'boutik-mari.ht' or r->>'statut' is distinct from 'en_attente' then
    raise exception 'D1 KO : demande %', r;
  end if;
  if zabelie_domaine_boutik('boutik-mari.ht') is not null then raise exception 'D1 KO : servi avant activation'; end if;
  r := zabelie_domaine_decider(a, true, null);
  if r->>'ok' is distinct from 'true' then raise exception 'D1 KO : activation %', r; end if;
  if zabelie_domaine_boutik('boutik-mari.ht') is distinct from 'dom-a'
     or zabelie_domaine_boutik('WWW.BOUTIK-MARI.HT') is distinct from 'dom-a' then
    raise exception 'D1 KO : hôte non résolu';
  end if;
  if zabelie_domaine_boutik('autre.ht') is not null then raise exception 'D1 KO : hôte inconnu résolu'; end if;
  -- Redemander le même domaine actif ne le désactive pas.
  r := zabelie_domaine_demander(a, 'boutik-mari.ht');
  if r->>'statut' is distinct from 'actif' then raise exception 'D1 KO : redemande désactive %', r; end if;
  raise notice 'D1 OK — demande, activation, résolution de l''hôte';
end $$;

do $$
declare r jsonb; v text;
begin
  r := zabelie_domaine_demander('00000000-0000-0000-0000-0000000d0002', 'b-boutik.com');
  if r->>'reason' is distinct from 'kyc_requis' then raise exception 'D2 KO : non vérifié %', r; end if;
  r := zabelie_domaine_demander('00000000-0000-0000-0000-0000000d0003', 'c-boutik.com');
  if r->>'reason' is distinct from 'boutique_sans_adresse' then raise exception 'D2 KO : sans adresse %', r; end if;
  update profiles set boutik_slug = 'dom-c' where id = '00000000-0000-0000-0000-0000000d0003';
  foreach v in array array['localhost', 'a..b.com', '-x.com', 'x.c', 'zabelie.com', 'shop.zabelie.com', 'x.vercel.app', 'é.com', 'a b.com', 'x.com/chemin'] loop
    r := zabelie_domaine_demander('00000000-0000-0000-0000-0000000d0003', v);
    if r->>'reason' is distinct from 'format' then raise exception 'D2 KO : format % accepté (%)', v, r; end if;
  end loop;
  update profiles set suspended_at = now() where id = '00000000-0000-0000-0000-0000000d0003';
  r := zabelie_domaine_demander('00000000-0000-0000-0000-0000000d0003', 'c-boutik.com');
  if r->>'reason' is distinct from 'compte_inactif' then raise exception 'D2 KO : vendeur suspendu %', r; end if;
  update profiles set suspended_at = null where id = '00000000-0000-0000-0000-0000000d0003';
  r := zabelie_domaine_demander('00000000-0000-0000-0000-0000000d0003', 'boutik-mari.ht');
  if r->>'reason' is distinct from 'pris' then raise exception 'D2 KO : domaine pris %', r; end if;
  begin
    insert into zabelie_seller_domains (seller_id, domaine) values ('00000000-0000-0000-0000-0000000d0002', 'evil.zabelie.com');
    raise exception 'D2 KO : la table accepte un sous-domaine Zabelie';
  exception when check_violation then null;
  end;
  raise notice 'D2 OK — non vérifié, sans adresse, format, Zabelie, pris : refusés';
end $$;

do $$
declare a uuid := '00000000-0000-0000-0000-0000000d0001';
begin
  update zabelie_kyc_submissions set status = 'rejected' where user_id = a;
  if zabelie_domaine_boutik('boutik-mari.ht') is not null then raise exception 'D3 KO : vérification retirée, domaine servi'; end if;
  update zabelie_kyc_submissions set status = 'approved' where user_id = a;
  update profiles set suspended_at = now() where id = a;
  if zabelie_domaine_boutik('boutik-mari.ht') is not null then raise exception 'D3 KO : vendeur suspendu, domaine servi'; end if;
  update profiles set suspended_at = null where id = a;
  if zabelie_domaine_boutik('boutik-mari.ht') is distinct from 'dom-a' then raise exception 'D3 KO : rétablissement'; end if;
  raise notice 'D3 OK — vérification retirée ou suspension : domaine coupé sans action admin';
end $$;

do $$
declare a uuid := '00000000-0000-0000-0000-0000000d0001'; c uuid := '00000000-0000-0000-0000-0000000d0003'; r jsonb;
begin
  r := zabelie_domaine_demander(c, 'c-boutik.com');
  r := zabelie_domaine_decider(c, false, '  ');
  if r->>'reason' is distinct from 'motif_requis' then raise exception 'D4 KO : refus sans motif %', r; end if;
  r := zabelie_domaine_decider(c, false, 'DNS absent');
  if (select statut from zabelie_seller_domains where seller_id = c) is distinct from 'refuse' then raise exception 'D4 KO : refus'; end if;
  r := zabelie_domaine_demander(c, 'c-boutik.com');
  if (select statut from zabelie_seller_domains where seller_id = c) is distinct from 'en_attente' then raise exception 'D4 KO : nouvelle demande'; end if;
  update zabelie_kyc_submissions set status = 'rejected' where user_id = c;
  r := zabelie_domaine_decider(c, true, null);
  if r->>'reason' is distinct from 'non_eligible' then raise exception 'D4 KO : activation non éligible %', r; end if;
  -- Changer de domaine repasse en attente : l'ancien cesse aussitôt.
  r := zabelie_domaine_demander(a, 'nouvo-mari.ht');
  if zabelie_domaine_boutik('boutik-mari.ht') is not null or zabelie_domaine_boutik('nouvo-mari.ht') is not null then
    raise exception 'D4 KO : changement de domaine';
  end if;
  -- Deux instructions : dans une seule, `exists` lirait la photo d'avant le retrait.
  if not zabelie_domaine_retirer(a) then raise exception 'D4 KO : retrait refusé'; end if;
  if exists (select 1 from zabelie_seller_domains where seller_id = a) then raise exception 'D4 KO : ligne restée'; end if;
  raise notice 'D4 OK — motif exigé, éligibilité recontrôlée, changement et retrait';
end $$;

do $$
declare n integer;
begin
  perform zabelie_domaine_demander('00000000-0000-0000-0000-0000000d0001', 'boutik-mari.ht');
  perform zabelie_domaine_decider('00000000-0000-0000-0000-0000000d0001', true, null);
  set local role anon;
  if zabelie_domaine_boutik('boutik-mari.ht') is distinct from 'dom-a' then raise exception 'D5 KO : anon ne résout pas'; end if;
  begin perform 1 from zabelie_seller_domains; raise exception 'D5 KO : anon lit la table';
  exception when insufficient_privilege then null; end;
  begin perform zabelie_domaine_demander('00000000-0000-0000-0000-0000000d0001', 'x.com'); raise exception 'D5 KO : anon demande';
  exception when insufficient_privilege then null; end;
  begin perform zabelie_domaine_decider('00000000-0000-0000-0000-0000000d0001', true, null); raise exception 'D5 KO : anon décide';
  exception when insufficient_privilege then null; end;
  reset role;
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000d0003';
  select count(*) into n from zabelie_seller_domains;
  if n <> 1 then raise exception 'D5 KO : le vendeur voit % lignes', n; end if;
  begin perform zabelie_domaine_decider('00000000-0000-0000-0000-0000000d0003', true, null); raise exception 'D5 KO : vendeur s''active';
  exception when insufficient_privilege then null; end;
  begin update zabelie_seller_domains set statut = 'actif', active_le = now(); raise exception 'D5 KO : écriture directe';
  exception when insufficient_privilege then null; end;
  reset role;
  raise notice 'D5 OK — anon ne fait que résoudre, le vendeur ne voit que sa ligne';
end $$;

rollback;
