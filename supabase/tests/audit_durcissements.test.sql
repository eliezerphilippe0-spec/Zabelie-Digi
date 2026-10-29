-- 0166 — durcissements de l'audit pré-lancement du 2026-10-29 (docs/78).
-- Transaction annulée. Chaque garde est éprouvée sur un cas connu-positif
-- (le geste légitime passe) ET un cas connu-négatif (le geste fautif échoue).

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000001660a1', 'audit-vendeur@test.local'),
  ('00000000-0000-0000-0000-0000001660a2', 'audit-autre@test.local');
insert into profiles (id, display_name) values
  ('00000000-0000-0000-0000-0000001660a1', 'Vendeur audit'),
  ('00000000-0000-0000-0000-0000001660a2', 'Autre vendeur audit')
  on conflict (id) do nothing;

-- ════════════════ M1 : une vente flash vaut pour UN prix ════════════════════
insert into products (id, seller_id, slug, title, kind, price_htg, status) values
  ('00000000-0000-0000-0000-0000001660b1', '00000000-0000-0000-0000-0000001660a1', 'audit-une-variante', 'Une variante', 'physical', 2000, 'published'),
  ('00000000-0000-0000-0000-0000001660b2', '00000000-0000-0000-0000-0000001660a1', 'audit-deux-variantes', 'Deux variantes', 'physical', 2000, 'published');
insert into zabelie_product_variants (id, product_id, sku, price_htg, active, position) values
  ('00000000-0000-0000-0000-0000001660c1', '00000000-0000-0000-0000-0000001660b1', 'AUDIT-U', 2000, true, 0),
  ('00000000-0000-0000-0000-0000001660c2', '00000000-0000-0000-0000-0000001660b2', 'AUDIT-S', 2000, true, 0),
  ('00000000-0000-0000-0000-0000001660c3', '00000000-0000-0000-0000-0000001660b2', 'AUDIT-XL', 5000, true, 1),
  ('00000000-0000-0000-0000-0000001660c4', '00000000-0000-0000-0000-0000001660b1', 'AUDIT-INACTIVE', 9000, false, 1);

do $$
declare
  v_state text;
begin
  -- Connu-positif : une seule variante ACTIVE (l'inactive ne compte pas) → l'offre naît.
  insert into zabelie_flash_sales (product_id, prix_flash_htg, fin)
    values ('00000000-0000-0000-0000-0000001660b1', 1200, now() + interval '2 hours');

  -- Connu-négatif : deux variantes actives à des prix différents → ZB166.
  begin
    insert into zabelie_flash_sales (product_id, prix_flash_htg, fin)
      values ('00000000-0000-0000-0000-0000001660b2', 1200, now() + interval '2 hours');
    raise exception 'M1: offre flash acceptée sur un produit à deux variantes';
  exception when sqlstate 'ZB166' then
    get stacked diagnostics v_state = returned_sqlstate;
  end;
  assert v_state = 'ZB166', 'M1: code ZB166 attendu';

  -- Les autres gardes ZB080 tiennent toujours (produit à une variante, rabais hors bornes).
  begin
    insert into zabelie_flash_sales (product_id, prix_flash_htg, fin)
      values ('00000000-0000-0000-0000-0000001660b1', 1999, now() + interval '2 hours');
    raise exception 'M1: les bornes de rabais ont sauté';
  exception when raise_exception then
    if sqlerrm !~ '^ZB080' then raise; end if;
  end;
  raise notice 'M1 OK — une variante : offre ; deux variantes : ZB166';
end $$;

-- ════════════════ L2 : l'adresse publique se fige côté client ═══════════════
update profiles set boutik_slug = 'vendeur-audit' where id = '00000000-0000-0000-0000-0000001660a1';  -- service (postgres)

create role test_client_166 bypassrls;
grant usage on schema public to test_client_166;
grant select, insert, update on profiles to test_client_166;

set local role test_client_166;
update profiles set boutik_slug = 'bebeto-officiel-2', display_name = 'Vendeur audit renommé'
 where id = '00000000-0000-0000-0000-0000001660a1';
reset role;

do $$
declare
  v_slug text;
  v_nom  text;
begin
  select boutik_slug, display_name into v_slug, v_nom from profiles where id = '00000000-0000-0000-0000-0000001660a1';
  assert v_slug = 'vendeur-audit', format('L2: adresse modifiée par un client — %s', v_slug);
  assert v_nom = 'Vendeur audit renommé', 'L2: la modification légitime du nom doit passer';
end $$;

-- À l'INSERT aussi : un client ne naît pas avec l'adresse de son choix.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000001660a3', 'audit-nouveau@test.local');
delete from profiles where id = '00000000-0000-0000-0000-0000001660a3';
set local role test_client_166;
insert into profiles (id, display_name, boutik_slug) values ('00000000-0000-0000-0000-0000001660a3', 'Nouveau', 'adresse-choisie');
reset role;
do $$ begin
  assert (select boutik_slug from profiles where id = '00000000-0000-0000-0000-0000001660a3') is null,
    'L2: un client a choisi son adresse à l''inscription';
end $$;

-- Le service (attribution serveur) écrit toujours l'adresse.
update profiles set boutik_slug = 'vendeur-audit-2' where id = '00000000-0000-0000-0000-0000001660a1';
do $$ begin
  assert (select boutik_slug from profiles where id = '00000000-0000-0000-0000-0000001660a1') = 'vendeur-audit-2',
    'L2: le service doit pouvoir attribuer une adresse';
end $$;

-- Noms réservés : la plateforme et ses mots d'autorité.
do $$
declare
  v_slug text;
begin
  foreach v_slug in array array['zabelie', 'zabelie-officiel', 'zabelie-2', 'officiel', 'support', 'service-client'] loop
    begin
      update profiles set boutik_slug = v_slug where id = '00000000-0000-0000-0000-0000001660a2';
      raise exception 'L2: adresse réservée acceptée — %', v_slug;
    exception when check_violation then null;
    end;
  end loop;
  -- Connu-positif : un nom qui CONTIENT zabelie sans commencer par lui reste libre.
  update profiles set boutik_slug = 'boutik-zabeliana' where id = '00000000-0000-0000-0000-0000001660a2';
  update profiles set boutik_slug = 'mari-support-jakmel' where id = '00000000-0000-0000-0000-0000001660a2';
  raise notice 'L2 OK — adresse figée côté client, noms de plateforme réservés';
end $$;

-- ════════════════ L10 : aucune écriture anonyme, aucun TRUNCATE client ══════
do $$
declare
  v_n integer;
begin
  select count(*) into v_n
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and (has_table_privilege('anon', c.oid, 'INSERT') or has_table_privilege('anon', c.oid, 'UPDATE')
          or has_table_privilege('anon', c.oid, 'DELETE') or has_table_privilege('anon', c.oid, 'TRUNCATE')
          or has_table_privilege('authenticated', c.oid, 'TRUNCATE'));
  assert v_n = 0, format('L10: %s table(s) gardent une écriture anonyme ou un TRUNCATE', v_n);
  -- ⚠️ Angle mort assumé : le bootstrap local n'accorde PAS TRUNCATE à
  -- `authenticated` (Supabase, si : 64 tables mesurées en production le
  -- 2026-10-29). Retirer la révocation `authenticated` ne rougit donc pas ce
  -- test (mutation M7, survivante). La preuve est la sonde de la migration,
  -- qui s'exécute en production où la condition existe.

  -- Connu-positif : la lecture publique et l'écriture authentifiée sous RLS restent.
  assert has_table_privilege('anon', 'public.products', 'SELECT'), 'L10: la vitrine doit rester lisible';
  assert has_table_privilege('authenticated', 'public.profiles', 'UPDATE'), 'L10: un compte modifie toujours son profil';
end $$;

-- Une table créée APRÈS 0166 naît sans écriture anonyme (privilèges par défaut).
create table public.zabelie_audit_166_temoin (id integer);
do $$ begin
  assert not has_table_privilege('anon', 'public.zabelie_audit_166_temoin', 'INSERT'),
    'L10: une nouvelle table hérite d''une écriture anonyme';
  assert not has_table_privilege('authenticated', 'public.zabelie_audit_166_temoin', 'TRUNCATE'),
    'L10: une nouvelle table hérite d''un TRUNCATE client';
  raise notice 'L10 OK — écritures anonymes et TRUNCATE retirés, y compris pour les tables à venir';
end $$;

-- Sous le rôle anon réel : l'insertion est refusée par les DROITS, avant même RLS.
set local role anon;
do $$ begin
  begin
    insert into zabelie_zone_requests (requester, komin_id, nom_propose)
      values ('00000000-0000-0000-0000-0000001660a1', '00000000-0000-0000-0000-0000001660ff', 'x');
    raise exception 'L10: insertion anonyme acceptée';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

rollback;
