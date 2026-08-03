-- Tests du lot 0.b (0034) — retrait self-service vendeur.
-- Usage : psql "$DATABASE_URL" -f supabase/tests/payout_requests.test.sql
--
-- Couvre :
--   PR1. Demande valide : solde immobilisé, ledger écrit, identité 0033 tenue.
--   PR2. Une seule demande ouverte à la fois.
--   PR3. Règlement admin : preuve inscrite, aucun second débit.
--   PR4. Rejet : solde restitué par écriture compensatoire, identité tenue.
--   PR5. Sous le minimum → refus. Solde insuffisant → refus.
--   PR6. Compte suspendu → décaissement bloqué.
--   PR7. Le solde en attente (escrow non maturé) n'est pas retirable.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000ce01'::uuid, 'retrait@test.local'),
  ('00000000-0000-0000-0000-00000000ce02'::uuid, 'retrait.admin@test.local'),
  ('00000000-0000-0000-0000-00000000ce03'::uuid, 'retrait.susp@test.local');

-- 0045 : le profil est désormais créé en base à l'inscription. Ces tests
-- veulent piloter la ligne eux-mêmes (rôle, tier) et éprouver le chemin
-- INSERT de `protect_profile_privileges` — on retire donc la ligne
-- auto-créée plutôt que de basculer en UPDATE, qui ne teste pas la même
-- chose.
delete from profiles where id in (select id from auth.users);
insert into profiles (id, display_name, role) values
  ('00000000-0000-0000-0000-00000000ce01'::uuid, 'Vendeur Retrait', 'creator'),
  ('00000000-0000-0000-0000-00000000ce02'::uuid, 'Admin Retrait', 'admin'),
  ('00000000-0000-0000-0000-00000000ce03'::uuid, 'Vendeur Suspendu', 'creator');

insert into wallets (id, owner_id, balance_htg, pending_htg) values
  ('00000000-0000-0000-0000-00000000cf01'::uuid,
   '00000000-0000-0000-0000-00000000ce01'::uuid, 10000, 3000),
  ('00000000-0000-0000-0000-00000000cf02'::uuid,
   '00000000-0000-0000-0000-00000000ce03'::uuid, 5000, 0);

-- Ledger initial cohérent (identité 0033 : somme = balance + pending).
insert into wallet_transactions (wallet_id, type, amount_htg, idempotency_key, reference)
values
  ('00000000-0000-0000-0000-00000000cf01'::uuid, 'credit', 13000, 'seed:cf01', 'Ventes'),
  ('00000000-0000-0000-0000-00000000cf02'::uuid, 'credit', 5000,  'seed:cf02', 'Ventes');

update profiles set suspended_at = now(), suspended_reason = 'test'
 where id = '00000000-0000-0000-0000-00000000ce03';

do $$
declare
  v_user   uuid := '00000000-0000-0000-0000-00000000ce01';
  v_susp   uuid := '00000000-0000-0000-0000-00000000ce03';
  v_admin  uuid := '00000000-0000-0000-0000-00000000ce02';
  v_wallet uuid := '00000000-0000-0000-0000-00000000cf01';
  v_res    jsonb;
  v_bal    bigint;
  v_ecart  bigint;
  v_pid    uuid;
  v_rows   integer;
begin
  -- PR5a : sous le minimum (500).
  v_res := zabelie_request_payout(v_user, 100);
  assert not (v_res->>'ok')::boolean and v_res->>'reason' = 'sous_minimum',
    format('PR5a: refus sous_minimum attendu, obtenu %s', v_res);

  -- PR7 : 12 000 demandés alors que 10 000 sont disponibles (3 000 en attente
  -- ne comptent pas).
  v_res := zabelie_request_payout(v_user, 12000);
  assert not (v_res->>'ok')::boolean and v_res->>'reason' = 'solde_insuffisant',
    format('PR7: le pending ne doit pas être retirable, obtenu %s', v_res);

  -- PR6 : compte suspendu.
  v_res := zabelie_request_payout(v_susp, 1000);
  assert not (v_res->>'ok')::boolean and v_res->>'reason' = 'compte_suspendu',
    format('PR6: refus compte_suspendu attendu, obtenu %s', v_res);

  -- PR1 : demande valide de 4 000.
  v_res := zabelie_request_payout(v_user, 4000);
  assert (v_res->>'ok')::boolean, format('PR1: demande devait réussir, obtenu %s', v_res);
  v_pid := (v_res->>'payout_id')::uuid;

  select balance_htg into v_bal from wallets where id = v_wallet;
  assert v_bal = 6000, format('PR1: solde immobilisé attendu 6000, obtenu %s', v_bal);
  select ecart_htg into v_ecart from zabelie_wallet_coherence where wallet_id = v_wallet;
  assert v_ecart = 0, format('PR1: identité 0033 rompue, écart %s', v_ecart);

  -- PR2 : seconde demande refusée tant que la première est ouverte.
  v_res := zabelie_request_payout(v_user, 1000);
  assert not (v_res->>'ok')::boolean and v_res->>'reason' = 'demande_en_cours',
    format('PR2: refus demande_en_cours attendu, obtenu %s', v_res);

  -- PR3 : l'admin a viré → il inscrit la preuve. Aucun second débit.
  v_res := zabelie_settle_payout(v_pid, 'moncash', 'MC-RET-1', v_admin, 'Viré');
  assert (v_res->>'ok')::boolean, 'PR3: règlement devait réussir';
  select balance_htg into v_bal from wallets where id = v_wallet;
  assert v_bal = 6000, format('PR3: aucun second débit attendu (6000), obtenu %s', v_bal);
  select count(*) into v_rows from payouts
   where id = v_pid and status = 'paid' and reference = 'MC-RET-1'
     and recorded_by = v_admin and paid_at is not null;
  assert v_rows = 1, 'PR3: la preuve du règlement doit être inscrite';
  -- Rejeu du règlement : no-op.
  v_res := zabelie_settle_payout(v_pid, 'moncash', 'MC-RET-1', v_admin);
  assert (v_res->>'duplicate')::boolean, 'PR3: rejeu devait être signalé doublon';

  select ecart_htg into v_ecart from zabelie_wallet_coherence where wallet_id = v_wallet;
  assert v_ecart = 0, format('PR3: identité 0033 rompue, écart %s', v_ecart);

  -- PR4 : nouvelle demande, puis rejet → restitution compensatoire.
  update payouts set created_at = now() - interval '48 hours' where id = v_pid;
  v_res := zabelie_request_payout(v_user, 2000);
  assert (v_res->>'ok')::boolean, format('PR4: demande devait réussir, obtenu %s', v_res);
  v_pid := (v_res->>'payout_id')::uuid;
  select balance_htg into v_bal from wallets where id = v_wallet;
  assert v_bal = 4000, format('PR4: solde après immobilisation attendu 4000, obtenu %s', v_bal);

  v_res := zabelie_reject_payout(v_pid, 'Numéro MonCash invalide', v_admin);
  assert (v_res->>'ok')::boolean, 'PR4: rejet devait réussir';
  select balance_htg into v_bal from wallets where id = v_wallet;
  assert v_bal = 6000, format('PR4: solde restitué attendu 6000, obtenu %s', v_bal);
  select count(*) into v_rows from wallet_transactions
   where idempotency_key = 'payout_rej:' || v_pid and amount_htg = 2000;
  assert v_rows = 1, 'PR4: la restitution doit être une écriture compensatoire';
  select ecart_htg into v_ecart from zabelie_wallet_coherence where wallet_id = v_wallet;
  assert v_ecart = 0, format('PR4: identité 0033 rompue, écart %s', v_ecart);

  -- Une demande réglée ne peut plus être rejetée.
  begin
    perform zabelie_reject_payout(
      (select id from payouts where reference = 'MC-RET-1'), 'test', v_admin);
    raise exception 'PR4b: le rejet d''une demande réglée aurait dû échouer';
  exception
    when others then
      if sqlerrm like 'PR4b:%' then raise; end if;
  end;

  raise notice 'OK — PR1 immobilisation + identité tenue ; PR2 une seule demande ouverte ; PR3 preuve inscrite sans second débit ; PR4 rejet compensatoire ; PR5 minimum ; PR6 compte suspendu bloqué ; PR7 le pending n''est pas retirable';
end $$;

rollback;
