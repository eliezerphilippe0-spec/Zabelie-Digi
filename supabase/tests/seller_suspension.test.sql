-- Tests de la suspension réversible (0017) — anti-régression modération.
-- Transaction annulée (rollback). ON_ERROR_STOP.
--
-- Couvre :
--   A. Masquage catalogue : le produit publié d'un vendeur suspendu disparaît
--      pour `authenticated`, et RÉAPPARAÎT à la réactivation (réversibilité).
--   B. Trigger : un rôle client ne peut PAS se dé-suspendre (ni se suspendre)
--      via un UPDATE de son profil — champs figés hors service role.
--   C. Aucun effet monétaire : la suspension ne modifie ni wallet ni escrow.

begin;

insert into auth.users (id, email)
  values ('00000000-0000-0000-0000-0000000000a9', 'vendeur@test.local');

-- 0045 : le profil est désormais créé en base à l'inscription. Ces tests
-- veulent piloter la ligne eux-mêmes (rôle, tier) et éprouver le chemin
-- INSERT de `protect_profile_privileges` — on retire donc la ligne
-- auto-créée plutôt que de basculer en UPDATE, qui ne teste pas la même
-- chose.
delete from profiles where id in (select id from auth.users);
insert into profiles (id, role, display_name)
  values ('00000000-0000-0000-0000-0000000000a9', 'creator', 'Vendeur à suspendre');
insert into products (id, seller_id, slug, title, kind, price_htg, status)
  values ('00000000-0000-0000-0000-0000000000b9',
          '00000000-0000-0000-0000-0000000000a9',
          'produit-s', 'Produit S', 'fichier', 500, 'published');
insert into wallets (owner_id, balance_htg, pending_htg)
  values ('00000000-0000-0000-0000-0000000000a9', 1000, 250);

-- Mimique des grants par défaut Supabase (absents d'un Postgres nu).
grant select on products to authenticated;

-- Rôle client éphémère pour le test du trigger (bypassrls : on isole le trigger).
create role test_client bypassrls;
grant usage on schema public to test_client;
grant select, update on profiles to test_client;

do $$
declare
  v_count int;
  v_susp  timestamptz;
  v_bal   bigint;
  v_pend  bigint;
begin
  -- A1 : vendeur actif → produit visible du catalogue.
  set local role authenticated;
  select count(*) into v_count from products
   where id = '00000000-0000-0000-0000-0000000000b9';
  reset role;
  assert v_count = 1, format('A1: produit attendu visible, count=%s', v_count);

  -- Suspension par le back-office (service role — ici postgres, exempté).
  update profiles
     set suspended_at = now(), suspended_reason = 'non-respect du règlement'
   where id = '00000000-0000-0000-0000-0000000000a9';

  -- A2 : suspendu → produit masqué.
  set local role authenticated;
  select count(*) into v_count from products
   where id = '00000000-0000-0000-0000-0000000000b9';
  reset role;
  assert v_count = 0, format('A2: produit attendu masqué, count=%s', v_count);
  assert seller_is_active('00000000-0000-0000-0000-0000000000a9') = false,
    'A2: seller_is_active devrait être false';

  -- B : le client ne peut pas se dé-suspendre (champs figés par le trigger).
  set local role test_client;
  update profiles
     set suspended_at = null, suspended_reason = null,
         display_name = 'Nom modifié'
   where id = '00000000-0000-0000-0000-0000000000a9';
  reset role;
  select suspended_at into v_susp from profiles
   where id = '00000000-0000-0000-0000-0000000000a9';
  assert v_susp is not null, 'B: auto-dé-suspension non bloquée par le trigger';

  -- C : aucun effet monétaire — wallet et escrow intacts (cadre BRH).
  select balance_htg, pending_htg into v_bal, v_pend
    from wallets where owner_id = '00000000-0000-0000-0000-0000000000a9';
  assert v_bal = 1000 and v_pend = 250,
    format('C: wallet modifié par la suspension (bal=%s, pending=%s)', v_bal, v_pend);

  -- A3 : réactivation → produit de retour, sans re-publication.
  update profiles
     set suspended_at = null, suspended_reason = null, suspended_by = null
   where id = '00000000-0000-0000-0000-0000000000a9';
  set local role authenticated;
  select count(*) into v_count from products
   where id = '00000000-0000-0000-0000-0000000000b9';
  reset role;
  assert v_count = 1, format('A3: produit attendu de retour, count=%s', v_count);

  raise notice 'OK — A masqué/restauré ; B trigger anti-dé-suspension ; C wallet intact';
end $$;

rollback;
