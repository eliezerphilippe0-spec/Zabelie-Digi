-- Tests du lot 0.a (0032) — enregistrement des règlements manuels vendeurs.
-- Usage : psql "$DATABASE_URL" -f supabase/tests/manual_payouts.test.sql
--
-- Couvre :
--   PM1. Enregistrement : payout tracé, solde débité, ledger négatif.
--   PM2. Idempotence : même reçu rejoué → no-op, aucun double débit.
--   PM3. Montant > solde DISPONIBLE → refus (rien d'écrit).
--   PM4. Le solde EN ATTENTE n'est pas décaissable.
--   PM5. Référence de reçu vide → refus (opposabilité).
--   PM6. Écriture de règlement immuable (append-only 0025).

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000ab01'::uuid, 'vendeur.payout@test.local'),
  ('00000000-0000-0000-0000-00000000ab02'::uuid, 'admin.payout@test.local');

-- 0045 : le profil est désormais créé en base à l'inscription. Ces tests
-- veulent piloter la ligne eux-mêmes (rôle, tier) et éprouver le chemin
-- INSERT de `protect_profile_privileges` — on retire donc la ligne
-- auto-créée plutôt que de basculer en UPDATE, qui ne teste pas la même
-- chose.
delete from profiles where id in (select id from auth.users);

insert into profiles (id, display_name, role) values
  ('00000000-0000-0000-0000-00000000ab01'::uuid, 'Vendeur Test', 'creator'),
  ('00000000-0000-0000-0000-00000000ab02'::uuid, 'Admin Test', 'admin');

-- Portefeuille : 5 000 disponibles, 2 000 encore en attente (escrow non maturé).
insert into wallets (id, owner_id, balance_htg, pending_htg) values
  ('00000000-0000-0000-0000-00000000ac01'::uuid,
   '00000000-0000-0000-0000-00000000ab01'::uuid, 5000, 2000);

do $$
declare
  v_wallet uuid := '00000000-0000-0000-0000-00000000ac01';
  v_admin  uuid := '00000000-0000-0000-0000-00000000ab02';
  v_res    jsonb;
  v_bal    bigint;
  v_amt    bigint;
  v_rows   integer;
begin
  -- PM1 : règlement de 3 000 contre reçu MC-001.
  v_res := zabelie_record_manual_payout(
    v_wallet, 3000, 'moncash', 'MC-001', v_admin, 'Apurement manuel');
  assert (v_res->>'ok')::boolean, 'PM1: enregistrement devait réussir';
  assert not (v_res->>'duplicate')::boolean, 'PM1: ne devait pas être un doublon';

  select balance_htg into v_bal from wallets where id = v_wallet;
  assert v_bal = 2000, format('PM1: solde attendu 2000, obtenu %s', v_bal);

  select amount_htg into v_amt from wallet_transactions
   where idempotency_key = 'payout:MC-001';
  assert v_amt = -3000, format('PM1: ledger attendu -3000, obtenu %s', v_amt);

  select count(*) into v_rows from payouts
   where reference = 'MC-001' and status = 'paid'
     and method = 'moncash' and recorded_by = v_admin and paid_at is not null;
  assert v_rows = 1, 'PM1: la trace opposable (reçu, méthode, auteur, date) doit exister';

  -- PM2 : rejeu du MÊME reçu → no-op, pas de second débit.
  v_res := zabelie_record_manual_payout(
    v_wallet, 3000, 'moncash', 'MC-001', v_admin);
  assert (v_res->>'duplicate')::boolean, 'PM2: rejeu devait être signalé comme doublon';
  select balance_htg into v_bal from wallets where id = v_wallet;
  assert v_bal = 2000, format('PM2: solde inchangé attendu 2000, obtenu %s', v_bal);
  select count(*) into v_rows from payouts where reference = 'MC-001';
  assert v_rows = 1, 'PM2: aucun second payout ne devait être créé';

  -- PM3 : 2 500 demandés alors que 2 000 sont disponibles → refus.
  begin
    perform zabelie_record_manual_payout(
      v_wallet, 2500, 'moncash', 'MC-002', v_admin);
    raise exception 'PM3: un montant supérieur au disponible aurait dû être refusé';
  exception
    when others then
      if sqlerrm like 'PM3:%' then raise; end if;
  end;
  select balance_htg into v_bal from wallets where id = v_wallet;
  assert v_bal = 2000, format('PM3: solde intact attendu 2000, obtenu %s', v_bal);
  select count(*) into v_rows from payouts where reference = 'MC-002';
  assert v_rows = 0, 'PM3: aucun payout ne devait être écrit';

  -- PM4 : le pending (2 000) ne s'ajoute pas au décaissable — 2 000 max, pas 4 000.
  begin
    perform zabelie_record_manual_payout(
      v_wallet, 4000, 'moncash', 'MC-003', v_admin);
    raise exception 'PM4: le solde en attente ne doit pas être décaissable';
  exception
    when others then
      if sqlerrm like 'PM4:%' then raise; end if;
  end;
  select pending_htg into v_bal from wallets where id = v_wallet;
  assert v_bal = 2000, format('PM4: pending intact attendu 2000, obtenu %s', v_bal);

  -- PM5 : référence vide → refus (règlement non démontrable).
  begin
    perform zabelie_record_manual_payout(v_wallet, 100, 'especes', '   ', v_admin);
    raise exception 'PM5: une référence vide aurait dû être refusée';
  exception
    when others then
      if sqlerrm like 'PM5:%' then raise; end if;
  end;

  -- PM6 : l'écriture de règlement est immuable (trigger append-only 0025).
  begin
    update wallet_transactions set amount_htg = -1
     where idempotency_key = 'payout:MC-001';
    raise exception 'PM6: la modification du ledger aurait dû être refusée';
  exception
    when others then
      if sqlerrm like 'PM6:%' then raise; end if;
  end;
  select amount_htg into v_amt from wallet_transactions
   where idempotency_key = 'payout:MC-001';
  assert v_amt = -3000, 'PM6: le ledger doit être resté intact';

  raise notice 'OK — PM1 règlement tracé (reçu/méthode/auteur/date) ; PM2 rejeu idempotent ; PM3 refus si > disponible ; PM4 le pending n''est pas décaissable ; PM5 référence obligatoire ; PM6 ledger immuable';
end $$;

rollback;
