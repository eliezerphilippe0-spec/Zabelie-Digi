select zabelie_migration_garde('0072_ai_surplus_recouvrement.sql');

-- ============================================================================
-- 0072 — SURPLUS IA, TRANCHE 2 : le recouvrement au règlement (docs/34 §2)
-- ============================================================================
-- La dette de surplus (0071) se recouvre AU MOMENT OÙ L'ARGENT SORT : la
-- demande de retrait. `zabelie_request_payout` (0034) est remplacée — même
-- signature, mêmes contrôles, plus le recouvrement :
--
--   • la somme des lignes NON RÉGLÉES du vendeur est calculée SOUS VERROU
--     (les lignes elles-mêmes, pas un total recompté ensuite — une ligne
--     née entre la somme et le marquage ne doit pas être marquée réglée
--     sans avoir été collectée) ;
--   • le solde doit couvrir montant demandé + dette ; sinon le refus rend
--     le disponible NET (`disponible_htg = balance − dette`) et la dette
--     (`frais_ia_htg`) — le vendeur voit pourquoi ;
--   • au succès : débit du montant ET de la dette, DEUX écritures au grand
--     livre (payout −montant ; debit −dette, idempotence `ai_surplus:<payout>`),
--     lignes de surplus marquées réglées avec `payout:<id>`.
--
-- INVARIANT 0033 TENU : balance −(x+s) · ledger −x −s → identité préservée.
--
-- ⚠️ UN REJET DE LA DEMANDE NE RESTITUE PAS LES FRAIS IA — et c'est voulu :
-- la dette existait indépendamment de la demande (le service a été consommé,
-- au prix consenti), le rejet restitue le MONTANT DEMANDÉ, rien d'autre.
-- `zabelie_reject_payout` (0034) reste inchangée, son écriture compensatoire
-- ne porte que `v_payout.amount_htg`.
--
-- ⛔ ORDRE : s'applique APRÈS 0071 (référence `zabelie_ai_surplus`), dans la
-- même fenêtre de signal porteur.
-- ============================================================================

create or replace function zabelie_request_payout(
  p_user_id    uuid,
  p_amount_htg bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet      uuid;
  v_balance     bigint;
  v_min         integer;
  v_max         integer;
  v_cooldown    integer;
  v_last        timestamptz;
  v_suspended   timestamptz;
  v_payout_id   uuid;
  v_surplus_due bigint;
  v_surplus_ids bigint[];
begin
  select coalesce(max(value) filter (where key = 'min_payout_htg'), 500),
         coalesce(max(value) filter (where key = 'max_per_request_htg'), 100000),
         coalesce(max(value) filter (where key = 'cooldown_hours'), 24)
    into v_min, v_max, v_cooldown
    from zabelie_payout_limits;

  if p_amount_htg is null or p_amount_htg <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'montant_invalide');
  end if;
  if p_amount_htg < v_min then
    return jsonb_build_object('ok', false, 'reason', 'sous_minimum', 'min_htg', v_min);
  end if;
  if p_amount_htg > v_max then
    return jsonb_build_object('ok', false, 'reason', 'au_dessus_plafond', 'max_htg', v_max);
  end if;

  select suspended_at into v_suspended from profiles where id = p_user_id;
  if v_suspended is not null then
    return jsonb_build_object('ok', false, 'reason', 'compte_suspendu');
  end if;

  select id into v_wallet from wallets where owner_id = p_user_id;
  if v_wallet is null then
    return jsonb_build_object('ok', false, 'reason', 'portefeuille_absent');
  end if;

  -- Sérialise les demandes concurrentes du même vendeur.
  select balance_htg into v_balance from wallets where id = v_wallet for update;

  if exists (select 1 from payouts
              where wallet_id = v_wallet and status in ('requested', 'processing')) then
    return jsonb_build_object('ok', false, 'reason', 'demande_en_cours');
  end if;

  select max(created_at) into v_last from payouts where wallet_id = v_wallet;
  if v_last is not null and v_last > now() - make_interval(hours => v_cooldown) then
    return jsonb_build_object('ok', false, 'reason', 'delai_non_ecoule',
                              'cooldown_hours', v_cooldown);
  end if;

  -- La dette IA, lignes VERROUILLÉES puis sommées : on ne réglera que ces
  -- lignes-là. Une ligne née pendant la demande attendra la prochaine sortie.
  select coalesce(array_agg(s.id), '{}'), coalesce(sum(s.prix_htg), 0)
    into v_surplus_ids, v_surplus_due
    from (select id, prix_htg
            from zabelie_ai_surplus
           where seller_id = p_user_id and settled_at is null
             for update) s;

  -- Le solde doit couvrir le montant ET la dette — sinon le refus dit les
  -- deux chiffres, et le disponible annoncé est le NET.
  if v_balance < p_amount_htg + v_surplus_due then
    return jsonb_build_object('ok', false, 'reason', 'solde_insuffisant',
                              'disponible_htg', greatest(v_balance - v_surplus_due, 0),
                              'frais_ia_htg', v_surplus_due);
  end if;

  insert into payouts (wallet_id, amount_htg, status)
  values (v_wallet, p_amount_htg, 'requested')
  returning id into v_payout_id;

  -- Immobilisation du montant + écriture au grand livre (identité 0033).
  update wallets set balance_htg = balance_htg - p_amount_htg where id = v_wallet;
  insert into wallet_transactions
    (wallet_id, type, amount_htg, idempotency_key, reference)
  values
    (v_wallet, 'payout', -p_amount_htg, 'payout_req:' || v_payout_id,
     'Demande de retrait ' || left(v_payout_id::text, 8));

  -- Recouvrement de la dette IA : débit + écriture propre + marquage des
  -- lignes sommées — jamais « toutes les non réglées ».
  if v_surplus_due > 0 then
    update wallets set balance_htg = balance_htg - v_surplus_due where id = v_wallet;
    insert into wallet_transactions
      (wallet_id, type, amount_htg, idempotency_key, reference)
    values
      (v_wallet, 'debit', -v_surplus_due, 'ai_surplus:' || v_payout_id,
       'Frais IA (' || array_length(v_surplus_ids, 1) || ' sijesyon) — retrait '
         || left(v_payout_id::text, 8));

    update zabelie_ai_surplus
       set settled_at = now(), settlement_ref = 'payout:' || v_payout_id
     where id = any(v_surplus_ids);
  end if;

  return jsonb_build_object('ok', true, 'payout_id', v_payout_id,
                            'balance_htg', v_balance - p_amount_htg - v_surplus_due,
                            'frais_ia_regles_htg', v_surplus_due);
end;
$$;
revoke all on function zabelie_request_payout(uuid, bigint)
  from public, anon, authenticated;

-- ── Post-conditions ─────────────────────────────────────────────────────────
do $$
declare v_src text;
begin
  select prosrc into v_src
    from pg_proc
   where proname = 'zabelie_request_payout'
     and pronamespace = 'public'::regnamespace;
  if v_src is null then
    raise exception '0072: zabelie_request_payout introuvable';
  end if;
  if position('zabelie_ai_surplus' in v_src) = 0 then
    raise exception '0072: la fonction en place ne porte pas le recouvrement';
  end if;
  if position('ai_surplus:' in v_src) = 0 then
    raise exception '0072: l''écriture idempotente du recouvrement manque';
  end if;
end $$;
