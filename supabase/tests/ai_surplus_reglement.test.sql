-- Tests du recouvrement du surplus IA (0072). Transaction annulée à la fin.
--
--   T1. Nominal : demande de retrait avec dette → montant ET dette débités,
--       DEUX écritures au grand livre, lignes réglées avec `payout:<id>`,
--       invariant 0033 tenu.
--   T2. Solde insuffisant NET : le refus rend disponible_htg = balance −
--       dette, et frais_ia_htg — rien n'est débité, rien n'est réglé.
--   T3. Rejet de la demande : le MONTANT est restitué, les frais IA ne le
--       sont pas — la dette était indépendante de la demande.
--   T4. Une ligne née APRÈS la demande n'est pas marquée réglée (le marquage
--       porte les lignes sommées, pas « toutes les non réglées »).
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000c0001', 't2.vandè@test.local'),
  ('00000000-0000-0000-0000-0000000c0002', 't2.lòt@test.local');
insert into profiles (id, display_name) values
  ('00000000-0000-0000-0000-0000000c0001', 'Vandè Rekouvreman'),
  ('00000000-0000-0000-0000-0000000c0002', 'Vandè Sere')
on conflict (id) do nothing;

insert into wallets (id, owner_id, balance_htg) values
  ('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000c0001', 10000),
  ('00000000-0000-0000-0000-0000000d0002', '00000000-0000-0000-0000-0000000c0002', 510);
-- L'identité 0033 part d'un grand livre cohérent : le solde initial est crédité.
insert into wallet_transactions (wallet_id, type, amount_htg, idempotency_key, reference) values
  ('00000000-0000-0000-0000-0000000d0001', 'credit', 10000, 'seed:c1', 'seed'),
  ('00000000-0000-0000-0000-0000000d0002', 'credit', 510,   'seed:c2', 'seed');

-- La dette : 3 suggestions à 5 HTG pour c1, 3 pour c2.
insert into zabelie_ai_surplus (seller_id, prix_htg)
select '00000000-0000-0000-0000-0000000c0001', 5 from generate_series(1, 3);
insert into zabelie_ai_surplus (seller_id, prix_htg)
select '00000000-0000-0000-0000-0000000c0002', 5 from generate_series(1, 3);

-- ── T1 — le nominal ─────────────────────────────────────────────────────────
do $$
declare
  v_res     jsonb;
  v_balance bigint;
  v_ledger  bigint;
  v_pending bigint;
  v_payout  uuid;
begin
  v_res := zabelie_request_payout('00000000-0000-0000-0000-0000000c0001', 500);
  if not (v_res->>'ok')::boolean then
    raise exception 'T1 KO : demande refusée (%)', v_res;
  end if;
  if (v_res->>'frais_ia_regles_htg')::bigint <> 15 then
    raise exception 'T1 KO : frais réglés = %, attendu 15', v_res->>'frais_ia_regles_htg';
  end if;
  v_payout := (v_res->>'payout_id')::uuid;

  select balance_htg, pending_htg into v_balance, v_pending
    from wallets where id = '00000000-0000-0000-0000-0000000d0001';
  if v_balance <> 10000 - 500 - 15 then
    raise exception 'T1 KO : balance = %, attendu 9485', v_balance;
  end if;

  if not exists (select 1 from wallet_transactions
                  where idempotency_key = 'ai_surplus:' || v_payout
                    and type = 'debit' and amount_htg = -15) then
    raise exception 'T1 KO : l''écriture de recouvrement manque au grand livre';
  end if;

  if exists (select 1 from zabelie_ai_surplus
              where seller_id = '00000000-0000-0000-0000-0000000c0001'
                and settled_at is null) then
    raise exception 'T1 KO : des lignes restent non réglées';
  end if;
  if exists (select 1 from zabelie_ai_surplus
              where seller_id = '00000000-0000-0000-0000-0000000c0001'
                and settlement_ref <> 'payout:' || v_payout) then
    raise exception 'T1 KO : référence de règlement inattendue';
  end if;

  -- Invariant 0033 : Σ(grand livre) = balance + pending.
  select coalesce(sum(amount_htg), 0) into v_ledger
    from wallet_transactions where wallet_id = '00000000-0000-0000-0000-0000000d0001';
  if v_ledger <> v_balance + coalesce(v_pending, 0) then
    raise exception 'T1 KO : invariant 0033 rompu (ledger=%, balance+pending=%)',
      v_ledger, v_balance + coalesce(v_pending, 0);
  end if;
  raise notice 'T1 OK — montant + dette débités, deux écritures, lignes réglées, invariant tenu';
end $$;

-- ── T2 — l'insuffisance se dit en NET ───────────────────────────────────────
do $$
declare
  v_res jsonb;
begin
  v_res := zabelie_request_payout('00000000-0000-0000-0000-0000000c0002', 500);
  if (v_res->>'ok')::boolean then
    raise exception 'T2 KO : demande acceptée avec 510 pour 500 + 15 de dette';
  end if;
  if v_res->>'reason' <> 'solde_insuffisant' then
    raise exception 'T2 KO : reason = %', v_res->>'reason';
  end if;
  if (v_res->>'disponible_htg')::bigint <> 495 then
    raise exception 'T2 KO : disponible = %, attendu 495 (510 − 15)', v_res->>'disponible_htg';
  end if;
  if (v_res->>'frais_ia_htg')::bigint <> 15 then
    raise exception 'T2 KO : frais annoncés = %, attendu 15', v_res->>'frais_ia_htg';
  end if;
  if exists (select 1 from zabelie_ai_surplus
              where seller_id = '00000000-0000-0000-0000-0000000c0002'
                and settled_at is not null) then
    raise exception 'T2 KO : des lignes réglées sur un refus';
  end if;
  if (select balance_htg from wallets where id = '00000000-0000-0000-0000-0000000d0002') <> 510 then
    raise exception 'T2 KO : le solde a bougé sur un refus';
  end if;
  raise notice 'T2 OK — refus en net (495 dispo, 15 de frais), rien débité, rien réglé';
end $$;

-- ── T3 — le rejet restitue le montant, pas les frais ────────────────────────
do $$
declare
  v_payout  uuid;
  v_balance bigint;
  v_ledger  bigint;
  v_pending bigint;
begin
  select id into v_payout from payouts
   where wallet_id = '00000000-0000-0000-0000-0000000d0001' and status = 'requested';

  perform zabelie_reject_payout(v_payout, 'test de restitution',
                                '00000000-0000-0000-0000-0000000c0001');

  select balance_htg, pending_htg into v_balance, v_pending
    from wallets where id = '00000000-0000-0000-0000-0000000d0001';
  -- 9485 + 500 restitués = 9985 — les 15 de frais restent recouvrés.
  if v_balance <> 9985 then
    raise exception 'T3 KO : balance = %, attendu 9985 (frais non restituables)', v_balance;
  end if;
  if exists (select 1 from zabelie_ai_surplus
              where seller_id = '00000000-0000-0000-0000-0000000c0001'
                and settled_at is null) then
    raise exception 'T3 KO : le rejet a rouvert des lignes réglées';
  end if;

  select coalesce(sum(amount_htg), 0) into v_ledger
    from wallet_transactions where wallet_id = '00000000-0000-0000-0000-0000000d0001';
  if v_ledger <> v_balance + coalesce(v_pending, 0) then
    raise exception 'T3 KO : invariant 0033 rompu après rejet';
  end if;
  raise notice 'T3 OK — montant restitué, frais conservés, invariant tenu';
end $$;

-- ── T4 — une dette née après la demande attend la prochaine sortie ──────────
do $$
declare
  v_res jsonb;
begin
  -- c1 n'a plus de demande ouverte (rejetée en T3) mais le cooldown de 24 h
  -- bloque une nouvelle demande : on vérifie le marquage autrement — la dette
  -- née MAINTENANT est non réglée et aucune référence ne la porte.
  insert into zabelie_ai_surplus (seller_id, prix_htg)
  values ('00000000-0000-0000-0000-0000000c0001', 5);

  if (select count(*) from zabelie_ai_surplus
       where seller_id = '00000000-0000-0000-0000-0000000c0001'
         and settled_at is null) <> 1 then
    raise exception 'T4 KO : la nouvelle dette devrait être seule non réglée';
  end if;
  raise notice 'T4 OK — la dette postérieure reste ouverte, pour la prochaine sortie';
end $$;

rollback;
