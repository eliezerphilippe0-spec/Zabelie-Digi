-- ============================================================================
-- 0032 — Chantier 0, lot 0.a : enregistrement des RÈGLEMENTS MANUELS vendeurs
-- ============================================================================
-- Contexte (docs/19-CHANTIER-0-RETRAIT-VENDEUR.md) : aucune route de
-- décaissement n'existe ; les vendeurs sont réglés À LA MAIN (virement MonCash
-- direct contre reçu). Sans enregistrement, le registre continuerait d'afficher
-- une dette DÉJÀ PAYÉE : solde créditeur fantôme, double réclamation possible,
-- et toute réconciliation ultérieure partirait d'une base fausse.
--
-- Ce lot ne crée PAS de retrait self-service (lot 0.b) : il inscrit un
-- paiement qui a déjà eu lieu hors plateforme.
--
-- Opposabilité (question Q7 du dossier BRH) : la table `payouts` d'origine ne
-- portait ni référence de reçu, ni date de règlement, ni trace de l'auteur de
-- l'enregistrement. Sans ces éléments, un règlement n'est pas démontrable.
-- ============================================================================

-- ───────────────────────── 1. Enrichissement de payouts ─────────────────────

create type payout_method as enum ('moncash', 'especes', 'virement', 'autre');

alter table payouts
  add column method      payout_method,
  add column reference   text,        -- n° de reçu MonCash / preuve du virement
  add column paid_at     timestamptz, -- date du règlement RÉEL (≠ enregistrement)
  add column recorded_by uuid references profiles (id),
  add column note        text;

-- La référence du reçu est la clé naturelle d'un règlement : deux
-- enregistrements ne peuvent pas se réclamer du même justificatif.
create unique index payouts_reference_uniq
  on payouts (reference) where reference is not null;

create index payouts_paid_at_idx on payouts (paid_at desc) where status = 'paid';

-- ───────────────────── 2. RPC — zabelie_record_manual_payout ────────────────
-- Débit ATOMIQUE sous verrou du portefeuille + trace opposable + écriture au
-- grand livre (append-only depuis 0025). Idempotent sur la référence du reçu :
-- ressaisir le même justificatif ne débite pas deux fois.

create function zabelie_record_manual_payout(
  p_wallet_id   uuid,
  p_amount_htg  bigint,
  p_method      payout_method,
  p_reference   text,
  p_recorded_by uuid,
  p_note        text        default null,
  p_paid_at     timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref       text;
  v_key       text;
  v_balance   bigint;
  v_payout_id uuid;
begin
  if p_amount_htg is null or p_amount_htg <= 0 then
    raise exception 'record_manual_payout: montant strictement positif requis';
  end if;

  -- Référence OBLIGATOIRE : c'est ce qui rend le règlement démontrable.
  v_ref := nullif(btrim(coalesce(p_reference, '')), '');
  if v_ref is null then
    raise exception
      'record_manual_payout: référence du reçu obligatoire (opposabilité du règlement)';
  end if;
  v_key := 'payout:' || v_ref;

  -- Idempotence AVANT le verrou : rejeu du même reçu = no-op, jamais d'erreur
  -- (l'admin qui resoumet un formulaire ne doit pas payer deux fois).
  if exists (select 1 from wallet_transactions where idempotency_key = v_key) then
    select id into v_payout_id from payouts where reference = v_ref;
    select balance_htg into v_balance from wallets where id = p_wallet_id;
    return jsonb_build_object(
      'ok', true, 'duplicate', true,
      'payout_id', v_payout_id, 'balance_htg', v_balance
    );
  end if;

  -- Verrou du portefeuille : sérialise les enregistrements concurrents.
  select balance_htg into v_balance
    from wallets where id = p_wallet_id for update;
  if v_balance is null then
    raise exception 'record_manual_payout: portefeuille introuvable';
  end if;

  -- On ne décaisse que le solde DISPONIBLE. Le solde en attente (escrow non
  -- maturé) n'est pas encore acquis au vendeur : le régler serait une avance.
  if v_balance < p_amount_htg then
    raise exception
      'record_manual_payout: solde disponible insuffisant (% demandés, % disponibles) — le solde en attente n''est pas décaissable',
      p_amount_htg, v_balance;
  end if;

  insert into payouts
    (wallet_id, amount_htg, status, method, reference, paid_at, recorded_by, note)
  values
    (p_wallet_id, p_amount_htg, 'paid', p_method, v_ref,
     coalesce(p_paid_at, now()), p_recorded_by, p_note)
  returning id into v_payout_id;

  update wallets set balance_htg = balance_htg - p_amount_htg
   where id = p_wallet_id;

  -- Grand livre : débit NÉGATIF (convention 0006), immuable (trigger 0025).
  insert into wallet_transactions
    (wallet_id, type, amount_htg, idempotency_key, reference)
  values
    (p_wallet_id, 'payout', -p_amount_htg, v_key, 'Règlement manuel ' || v_ref);

  return jsonb_build_object(
    'ok', true, 'duplicate', false,
    'payout_id', v_payout_id, 'balance_htg', v_balance - p_amount_htg
  );
end;
$$;
revoke all on function zabelie_record_manual_payout(
  uuid, bigint, payout_method, text, uuid, text, timestamptz
) from public, anon, authenticated;

-- ─────────────── 3. Vue de contrôle — encours dû aux vendeurs ───────────────
-- Lecture seule, service_role uniquement (aucune policy → invisible au client).
-- Sert l'écran d'apurement ET le contrôle de solvabilité (docs/19 §3.2) :
-- le total `du_total_htg` doit être COUVERT par le solde réel du compte
-- marchand MonCash. Ce rapprochement reste manuel tant que Digicel n'expose
-- pas d'endpoint de solde.

create view zabelie_seller_balances as
select w.id                as wallet_id,
       w.owner_id,
       p.display_name,
       w.balance_htg       as disponible_htg,
       w.pending_htg       as en_attente_htg,
       w.balance_htg + w.pending_htg as du_total_htg,
       (select coalesce(sum(po.amount_htg), 0)
          from payouts po
         where po.wallet_id = w.id and po.status = 'paid') as deja_regle_htg
  from wallets w
  join profiles p on p.id = w.owner_id
 where w.balance_htg + w.pending_htg > 0;

revoke all on zabelie_seller_balances from anon, authenticated;
