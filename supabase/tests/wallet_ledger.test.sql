-- Test BL-123 (0025) : wallet_transactions est APPEND-ONLY.
-- Usage : psql "$DATABASE_URL" -f supabase/tests/wallet_ledger.test.sql

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b9'::uuid, 'ledger@p1.test');

-- 0045 : le profil est désormais créé en base à l'inscription. Ces tests
-- veulent piloter la ligne eux-mêmes (rôle, tier) et éprouver le chemin
-- INSERT de `protect_profile_privileges` — on retire donc la ligne
-- auto-créée plutôt que de basculer en UPDATE, qui ne teste pas la même
-- chose.
delete from profiles where id in (select id from auth.users);
insert into profiles (id, role, display_name) values
  ('00000000-0000-0000-0000-0000000000b9'::uuid, 'creator', 'Ledger P1');
insert into wallets (id, owner_id, balance_htg) values
  ('00000000-0000-0000-0000-000000000b90'::uuid,
   '00000000-0000-0000-0000-0000000000b9'::uuid, 100);
insert into wallet_transactions (id, wallet_id, type, amount_htg, idempotency_key)
values ('00000000-0000-0000-0000-000000000b91'::uuid,
        '00000000-0000-0000-0000-000000000b90'::uuid, 'credit', 100, 'p1:ledger:1');

do $$
declare v_blocked integer := 0;
begin
  -- W1 : UPDATE interdit (même en superuser — le trigger prime).
  begin
    update wallet_transactions set amount_htg = 999999
     where id = '00000000-0000-0000-0000-000000000b91';
  exception when others then v_blocked := v_blocked + 1;
  end;
  -- W2 : DELETE interdit.
  begin
    delete from wallet_transactions
     where id = '00000000-0000-0000-0000-000000000b91';
  exception when others then v_blocked := v_blocked + 1;
  end;
  assert v_blocked = 2,
    format('W1/W2: le ledger devait bloquer UPDATE et DELETE (bloqués=%s/2)', v_blocked);

  -- W3 : l'INSERT (append) reste évidemment possible.
  insert into wallet_transactions (wallet_id, type, amount_htg, idempotency_key)
  values ('00000000-0000-0000-0000-000000000b90', 'debit', 10, 'p1:ledger:2');

  raise notice 'OK — W1 update bloqué ; W2 delete bloqué ; W3 append possible';
end $$;

rollback;
