-- ============================================================================
-- 0034 — Chantier 0, lot 0.b : RETRAIT SELF-SERVICE (la voie de sortie)
-- ============================================================================
-- Le lot 0.a inscrit un règlement déjà versé. Celui-ci donne au vendeur le
-- moyen de DEMANDER son argent — c'est la voie de sortie dont l'absence est au
-- cœur du dossier BRH (docs/17 §2.5).
--
-- Flux :  requested → paid        (l'admin a viré, il inscrit le reçu)
--                  ↘ rejected     (le solde est restitué)
--
-- INVARIANT PRÉSERVÉ (0033) : Σ(wallet_transactions) = balance_htg + pending_htg
--   • demande  : balance −x · ledger 'payout' −x        → identité tenue
--   • paiement : aucun mouvement (déjà débité)          → identité tenue
--   • rejet    : balance +x · ledger 'credit' +x        → identité tenue
-- Le rejet passe par une ÉCRITURE COMPENSATOIRE, jamais par une correction du
-- grand livre (règle 0025 : l'historique d'argent ne se réécrit pas).
--
-- Le débit a lieu DÈS LA DEMANDE : les fonds sont immobilisés, ce qui empêche
-- de demander deux fois le même argent.
-- ============================================================================

-- ─────────────────── 1. Paramètres (table de config, jamais en dur) ─────────

create table zabelie_payout_limits (
  key        text primary key,
  value      integer not null,
  comment    text,
  updated_at timestamptz not null default now()
);
insert into zabelie_payout_limits (key, value, comment) values
  ('min_payout_htg', 500,
   'Montant minimum d''une demande de retrait (HTG). Évite les micro-virements dont les frais dépassent l''intérêt.'),
  ('max_per_request_htg', 100000,
   'Plafond par demande (HTG). Garde-fou anti-erreur de saisie, pas une limite de droit.'),
  ('cooldown_hours', 24,
   'Délai minimum entre deux demandes d''un même vendeur.');

alter table zabelie_payout_limits enable row level security;
revoke all on zabelie_payout_limits from anon, authenticated;

-- Motif de rejet, tracé sur la demande.
alter table payouts add column rejected_reason text;

create index payouts_pending_idx on payouts (status, created_at)
  where status in ('requested', 'processing');

-- ─────────────────── 2. RPC — zabelie_request_payout (vendeur) ──────────────
-- Prend l'UTILISATEUR, jamais un wallet_id fourni par le client.

create function zabelie_request_payout(
  p_user_id    uuid,
  p_amount_htg bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet    uuid;
  v_balance   bigint;
  v_min       integer;
  v_max       integer;
  v_cooldown  integer;
  v_last      timestamptz;
  v_suspended timestamptz;
  v_payout_id uuid;
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

  -- Compte suspendu (modération) : décaissement bloqué — prévu dès 0017.
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

  -- Une seule demande ouverte à la fois : sinon l'admin traite des montants
  -- qui se chevauchent.
  if exists (select 1 from payouts
              where wallet_id = v_wallet and status in ('requested', 'processing')) then
    return jsonb_build_object('ok', false, 'reason', 'demande_en_cours');
  end if;

  select max(created_at) into v_last from payouts where wallet_id = v_wallet;
  if v_last is not null and v_last > now() - make_interval(hours => v_cooldown) then
    return jsonb_build_object('ok', false, 'reason', 'delai_non_ecoule',
                              'cooldown_hours', v_cooldown);
  end if;

  -- Seul le solde DISPONIBLE est retirable (l'escrow non maturé ne l'est pas).
  if v_balance < p_amount_htg then
    return jsonb_build_object('ok', false, 'reason', 'solde_insuffisant',
                              'disponible_htg', v_balance);
  end if;

  insert into payouts (wallet_id, amount_htg, status)
  values (v_wallet, p_amount_htg, 'requested')
  returning id into v_payout_id;

  -- Immobilisation immédiate + écriture au grand livre (identité 0033).
  update wallets set balance_htg = balance_htg - p_amount_htg where id = v_wallet;
  insert into wallet_transactions
    (wallet_id, type, amount_htg, idempotency_key, reference)
  values
    (v_wallet, 'payout', -p_amount_htg, 'payout_req:' || v_payout_id,
     'Demande de retrait ' || left(v_payout_id::text, 8));

  return jsonb_build_object('ok', true, 'payout_id', v_payout_id,
                            'balance_htg', v_balance - p_amount_htg);
end;
$$;
revoke all on function zabelie_request_payout(uuid, bigint)
  from public, anon, authenticated;

-- ─────────────── 3. RPC — zabelie_settle_payout (admin, après virement) ─────
-- Aucun mouvement d'argent ici : le débit a eu lieu à la demande. On inscrit
-- la PREUVE (reçu, moyen, date, auteur) — opposabilité, cf. Q7 du dossier.

create function zabelie_settle_payout(
  p_payout_id   uuid,
  p_method      payout_method,
  p_reference   text,
  p_recorded_by uuid,
  p_note        text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payout payouts;
  v_ref    text;
begin
  v_ref := nullif(btrim(coalesce(p_reference, '')), '');
  if v_ref is null then
    raise exception 'settle_payout: référence du reçu obligatoire (opposabilité)';
  end if;

  select * into v_payout from payouts where id = p_payout_id for update;
  if not found then
    raise exception 'settle_payout: demande introuvable';
  end if;
  if v_payout.status = 'paid' then
    -- Rejeu : no-op (l'admin qui resoumet ne doit pas déclencher d'erreur).
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  if v_payout.status <> 'requested' and v_payout.status <> 'processing' then
    raise exception 'settle_payout: demande déjà close (%)', v_payout.status;
  end if;

  update payouts
     set status = 'paid', method = p_method, reference = v_ref,
         paid_at = now(), recorded_by = p_recorded_by, note = p_note
   where id = p_payout_id;

  return jsonb_build_object('ok', true, 'duplicate', false);
end;
$$;
revoke all on function zabelie_settle_payout(uuid, payout_method, text, uuid, text)
  from public, anon, authenticated;

-- ─────────────── 4. RPC — zabelie_reject_payout (admin) ─────────────────────
-- Restitue le solde par ÉCRITURE COMPENSATOIRE (le grand livre ne se corrige
-- jamais par modification — règle 0025).

create function zabelie_reject_payout(
  p_payout_id   uuid,
  p_reason      text,
  p_recorded_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payout payouts;
begin
  select * into v_payout from payouts where id = p_payout_id for update;
  if not found then
    raise exception 'reject_payout: demande introuvable';
  end if;
  if v_payout.status = 'rejected' then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  if v_payout.status = 'paid' then
    raise exception 'reject_payout: demande déjà réglée — corriger par un nouveau mouvement';
  end if;

  update payouts
     set status = 'rejected',
         rejected_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         recorded_by = p_recorded_by
   where id = p_payout_id;

  update wallets set balance_htg = balance_htg + v_payout.amount_htg
   where id = v_payout.wallet_id;

  insert into wallet_transactions
    (wallet_id, type, amount_htg, idempotency_key, reference)
  values
    (v_payout.wallet_id, 'credit', v_payout.amount_htg,
     'payout_rej:' || p_payout_id,
     'Annulation demande ' || left(p_payout_id::text, 8));

  return jsonb_build_object('ok', true, 'duplicate', false);
end;
$$;
revoke all on function zabelie_reject_payout(uuid, text, uuid)
  from public, anon, authenticated;
