-- Tests des garde-fous R3/R4 (0031) — plafond de solde + borne d'expiration.
-- Usage : psql "$DATABASE_URL" -f supabase/tests/points_caps.test.sql
--
-- Couvre :
--   P7.  Écrêtage : un gain qui dépasse le plafond est tronqué, surplus tracé
--        dans metadata (clipped_points), balance = plafond exactement.
--   P8.  Solde plein : award_points renvoie null, AUCUN lot ni mouvement créé.
--   P9.  Expiration > max_expiry_days → refus (exception), rien d'écrit.
--   P10. La dépense (rédemption) rouvre l'accumulation sous le plafond.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000fa'::uuid, 'caps@test.local');

insert into rewards_catalog (id, label, points_cost, discount_percentage, max_discount_htg)
values ('00000000-0000-0000-0000-0000000000e2'::uuid, '-5 % (test caps)', 500, 5, 500);

-- Plafond abaissé pour le test (configurable en base = testable en base).
update points_limits set value = 1000 where key = 'max_balance_points';

do $$
declare
  v_uid uuid := '00000000-0000-0000-0000-0000000000fa';
  v_rid uuid := '00000000-0000-0000-0000-0000000000e2';
  v_bal integer;
  v_batch uuid;
  v_clipped integer;
  v_rows integer;
begin
  -- P7 : 800 puis 400 → le second gain est écrêté à 200, solde = 1000 (plafond).
  perform award_points(v_uid, 800, 'purchase');
  select award_points(v_uid, 400, 'purchase') into v_batch;
  assert v_batch is not null, 'P7: le gain écrêté doit créer un lot';
  select balance into v_bal from points_balances where user_id = v_uid;
  assert v_bal = 1000, format('P7: solde attendu 1000 (plafond), obtenu %s', v_bal);
  select (metadata->>'clipped_points')::integer into v_clipped
    from points_ledger where user_id = v_uid and batch_id = v_batch;
  assert v_clipped = 200, format('P7: surplus tracé attendu 200, obtenu %s', v_clipped);
  select points_earned into v_rows from points_batches where id = v_batch;
  assert v_rows = 200, format('P7: lot écrêté attendu 200, obtenu %s', v_rows);

  -- P8 : solde plein → null, et AUCUNE ligne supplémentaire nulle part.
  select count(*) into v_rows from points_ledger where user_id = v_uid;
  select award_points(v_uid, 100, 'review_text') into v_batch;
  assert v_batch is null, 'P8: solde plein — award_points devait renvoyer null';
  select balance into v_bal from points_balances where user_id = v_uid;
  assert v_bal = 1000, format('P8: solde inchangé attendu 1000, obtenu %s', v_bal);
  select count(*) - v_rows into v_rows from points_ledger where user_id = v_uid;
  assert v_rows = 0, 'P8: aucun mouvement de ledger ne devait être créé';

  -- P9 : expiration au-delà de la borne (181 j > 180) → exception, rien d'écrit.
  begin
    perform award_points(v_uid, 10, 'promo_boost', null, 181);
    raise exception 'P9: expiration 181 j aurait dû être refusée';
  exception
    when others then
      if sqlerrm like 'P9:%' then raise; end if; -- c'est notre propre assert
  end;
  select count(*) into v_rows from points_batches
   where user_id = v_uid and expires_at > now() + interval '180 days';
  assert v_rows = 0, 'P9: aucun lot au-delà de 180 j ne doit exister';

  -- P10 : une rédemption (−500) rouvre l'accumulation → gain suivant intégral.
  perform redeem_points_for_coupon(v_uid, v_rid);
  select balance into v_bal from points_balances where user_id = v_uid;
  assert v_bal = 500, format('P10: solde après rédemption attendu 500, obtenu %s', v_bal);
  perform award_points(v_uid, 300, 'purchase');
  select balance into v_bal from points_balances where user_id = v_uid;
  assert v_bal = 800, format('P10: solde attendu 800 (300 non écrêtés), obtenu %s', v_bal);

  raise notice 'OK — P7 écrêtage au plafond + surplus tracé ; P8 solde plein sans effet ; P9 expiration bornée à 180 j ; P10 la dépense rouvre l''accumulation';
end $$;

rollback;
