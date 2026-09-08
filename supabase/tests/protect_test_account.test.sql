-- Tests des droits réels et de la visibilité catalogue. Aucune écriture conservée.
begin;
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-000000001051', 'protected-test@example.test'),
 ('00000000-0000-0000-0000-000000001052', 'ordinary-test@example.test'),
 ('00000000-0000-0000-0000-000000001053', 'new-test@example.test');
update profiles set is_test = true where id = '00000000-0000-0000-0000-000000001051';
insert into products (id, seller_id, slug, title, kind, price_htg, status) values
 ('00000000-0000-0000-0000-000000001054', '00000000-0000-0000-0000-000000001051', 'test-protected-105', 'Service test', 'service', 500, 'published');

-- Le propriétaire ne peut pas retirer sa marque, même avec un claim trompeur.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000001051';
set local request.jwt.claim.role = 'service_role';
do $$
begin
 begin
  update profiles set is_test = false where id = '00000000-0000-0000-0000-000000001051';
  raise exception 'Compte de test démarqué par son propriétaire';
 exception when insufficient_privilege then null;
 end;
 update profiles set display_name = 'Nom modifié' where id = '00000000-0000-0000-0000-000000001051';
 -- La RLS refuse également de modifier une autre personne.
 update profiles set display_name = 'Autre modifié' where id = '00000000-0000-0000-0000-000000001052';
end $$;
reset role;
do $$
begin
 assert (select is_test and display_name = 'Nom modifié' from profiles where id = '00000000-0000-0000-0000-000000001051');
 assert (select display_name is distinct from 'Autre modifié' from profiles where id = '00000000-0000-0000-0000-000000001052');
end $$;
set local role anon;
do $$ begin
 assert not exists(select 1 from products where id = '00000000-0000-0000-0000-000000001054'), 'Une tentative de démarquage a exposé la fiche';
end $$;
reset role;

-- Le rôle métier admin n'est pas une autorisation SQL : l'API MFA/service reste obligatoire.
update profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000001051';
set local role authenticated;
do $$ begin
 begin
  update profiles set is_test = false where id = '00000000-0000-0000-0000-000000001051';
  raise exception 'Un profil admin contourne le serveur';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;

-- Un membre ordinaire ne peut pas se marquer non plus.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000001052';
do $$ begin
 begin
  update profiles set is_test = true where id = '00000000-0000-0000-0000-000000001052';
  raise exception 'Marquage direct autorisé';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;

-- INSERT direct couvert ; un profil ordinaire peut toujours être créé.
delete from profiles where id = '00000000-0000-0000-0000-000000001053';
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000001053';
do $$ begin
 begin
  insert into profiles (id, display_name, is_test) values ('00000000-0000-0000-0000-000000001053', 'Nouveau', true);
  raise exception 'INSERT client avec marque autorisé';
 exception when insufficient_privilege then null;
 end;
 insert into profiles (id, display_name) values ('00000000-0000-0000-0000-000000001053', 'Nouveau');
end $$;
reset role;

-- L'administration serveur peut encore retirer/remettre la marque.
set local role service_role;
update profiles set is_test = false where id = '00000000-0000-0000-0000-000000001051';
reset role;
set local role anon;
do $$ begin
 assert exists(select 1 from products where id = '00000000-0000-0000-0000-000000001054'), 'Le démarquage serveur ne restaure pas la visibilité';
end $$;
reset role;
set local role service_role;
update profiles set is_test = true where id = '00000000-0000-0000-0000-000000001051';
reset role;
do $$ begin
 assert (select is_test from profiles where id = '00000000-0000-0000-0000-000000001051');
 assert not (select prosecdef from pg_proc where oid = 'public.zabelie_protect_test_account()'::regprocedure), 'Le garde doit rester INVOKER';
 assert not has_function_privilege('authenticated', 'public.zabelie_protect_test_account()', 'EXECUTE');
 assert exists (select 1 from zabelie_objets_requis() where objet = 'zabelie_protect_test_account' and present);
end $$;
rollback;
