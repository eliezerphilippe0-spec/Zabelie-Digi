-- Tests du lot 0.c.1 (0033) — contrôle de cohérence du registre.
-- Usage : psql "$DATABASE_URL" -f supabase/tests/wallet_coherence.test.sql
--
-- Couvre :
--   WC1. Un portefeuille alimenté par les fonctions normales est cohérent.
--   WC2. La maturation J+7 ne casse pas l'identité (pending → balance).
--   WC3. Un règlement manuel (0032) ne casse pas l'identité.
--   WC4. Une écriture directe hors ledger est DÉTECTÉE.
--   WC5. Le rapport global agrège correctement et bascule ok=false.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000bc01'::uuid, 'coherence@test.local'),
  ('00000000-0000-0000-0000-00000000bc02'::uuid, 'coherence.admin@test.local');
insert into profiles (id, display_name, role) values
  ('00000000-0000-0000-0000-00000000bc01'::uuid, 'Vendeur Cohérence', 'creator'),
  ('00000000-0000-0000-0000-00000000bc02'::uuid, 'Admin Cohérence', 'admin');

insert into wallets (id, owner_id, balance_htg, pending_htg) values
  ('00000000-0000-0000-0000-00000000bd01'::uuid,
   '00000000-0000-0000-0000-00000000bc01'::uuid, 0, 0);

do $$
declare
  v_wallet uuid := '00000000-0000-0000-0000-00000000bd01';
  v_admin  uuid := '00000000-0000-0000-0000-00000000bc02';
  v_ecart  bigint;
  v_rep    jsonb;
begin
  -- Simule une vente confirmée : ledger +10000, pending +10000
  -- (exactement ce que fait confirm_payment via 0006).
  insert into wallet_transactions
    (wallet_id, type, amount_htg, idempotency_key, reference)
  values (v_wallet, 'credit', 10000, 'test_credit:1', 'Vente test');
  update wallets set pending_htg = pending_htg + 10000 where id = v_wallet;

  -- WC1 : cohérent.
  select ecart_htg into v_ecart from zabelie_wallet_coherence where wallet_id = v_wallet;
  assert v_ecart = 0, format('WC1: écart attendu 0, obtenu %s', v_ecart);

  -- WC2 : maturation — pending → balance, sans écriture au ledger.
  update wallets set pending_htg = pending_htg - 10000,
                     balance_htg = balance_htg + 10000
   where id = v_wallet;
  select ecart_htg into v_ecart from zabelie_wallet_coherence where wallet_id = v_wallet;
  assert v_ecart = 0, format('WC2: la maturation ne doit pas créer d''écart, obtenu %s', v_ecart);

  -- WC3 : règlement manuel de 4 000 via la fonction du lot 0.a.
  perform zabelie_record_manual_payout(
    v_wallet, 4000, 'moncash', 'MC-COH-1', v_admin);
  select ecart_htg into v_ecart from zabelie_wallet_coherence where wallet_id = v_wallet;
  assert v_ecart = 0, format('WC3: le règlement ne doit pas créer d''écart, obtenu %s', v_ecart);

  v_rep := zabelie_solvency_report();
  assert (v_rep->>'ok')::boolean, 'WC3: le rapport devait être ok avant altération';
  assert (v_rep->>'du_total_htg')::bigint = 6000,
    format('WC3: dû total attendu 6000, obtenu %s', v_rep->>'du_total_htg');

  -- WC4 : écriture directe hors grand livre (bug ou intervention manuelle).
  update wallets set balance_htg = balance_htg + 2500 where id = v_wallet;
  select ecart_htg into v_ecart from zabelie_wallet_coherence where wallet_id = v_wallet;
  assert v_ecart = 2500, format('WC4: écart attendu 2500, obtenu %s', v_ecart);

  -- WC5 : le rapport global le signale.
  v_rep := zabelie_solvency_report();
  assert not (v_rep->>'ok')::boolean, 'WC5: le rapport devait basculer en ok=false';
  assert (v_rep->>'ecarts')::integer = 1,
    format('WC5: 1 écart attendu, obtenu %s', v_rep->>'ecarts');
  assert (v_rep->>'ecart_total_htg')::bigint = 2500,
    format('WC5: écart total attendu 2500, obtenu %s', v_rep->>'ecart_total_htg');

  raise notice 'OK — WC1 vente cohérente ; WC2 maturation neutre ; WC3 règlement manuel neutre ; WC4 écriture hors ledger détectée ; WC5 rapport global ok=false';
end $$;

rollback;
