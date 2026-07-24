-- ============================================================================
-- 0031 — Points : plafond de solde + borne d'expiration (garde-fous R3/R4)
-- ============================================================================
-- Applique les Règles 3 et 4 de docs/CASHBACK-GARDE-FOUS.md (référence
-- normative, audit 2026-07-23) :
--   • R3 — un compte ne peut pas accumuler au-delà d'un plafond configurable.
--     Le crédit est ÉCRÊTÉ (jamais refusé) et le surplus est tracé dans
--     metadata : c'est la preuve, pour le dossier BRH, que l'accumulation
--     s'arrête — les points ne peuvent pas devenir une réserve de valeur.
--   • R4 — aucun lot ne peut expirer à plus de `max_expiry_days` (défaut
--     180 j). Le défaut d'appel reste 90 j ; la borne empêche un appelant
--     futur de créer des points quasi-permanents.
-- Aucun point n'a encore circulé (système débranché) : pas de backfill.

-- ───────────────── Table de configuration (modèle zabelie_topup_limits) ─────

create table points_limits (
  key        text primary key,
  value      integer not null,
  comment    text,
  updated_at timestamptz not null default now()
);
insert into points_limits (key, value, comment) values
  ('max_balance_points', 2000,
   'Plafond de solde par compte (R3). ~2 coupons majeurs ≈ 3 000 HTG de remise max au catalogue actuel. Ajustable par le porteur.'),
  ('max_expiry_days', 180,
   'Durée de vie maximale d''un lot de points (R4). Le défaut d''attribution reste 90 j.');

alter table points_limits enable row level security;
-- Pas de policy : lecture/écriture réservées au service_role (bypass RLS).
revoke all on points_limits from anon, authenticated;

-- ───────────────── award_points : écrêtage au plafond + borne d'expiration ──

create or replace function award_points(
  p_user_id uuid,
  p_points integer,
  p_reason points_reason,
  p_order_id uuid default null,
  p_expires_in_days integer default 90,
  p_metadata jsonb default '{}'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_balance integer;
  v_cap integer;
  v_max_days integer;
  v_award integer;
  v_metadata jsonb := p_metadata;
begin
  if p_points <= 0 then
    raise exception 'award_points: points must be positive';
  end if;

  select coalesce(max(value) filter (where key = 'max_balance_points'), 2000),
         coalesce(max(value) filter (where key = 'max_expiry_days'), 180)
    into v_cap, v_max_days
    from points_limits;

  -- R4 : borne dure — on REFUSE (erreur de programmation, pas un cas métier).
  if p_expires_in_days > v_max_days then
    raise exception
      'award_points: expiration % j > plafond % j (R4, docs/CASHBACK-GARDE-FOUS.md)',
      p_expires_in_days, v_max_days;
  end if;

  -- Verrou du solde AVANT lecture : balance_after cohérent même sous
  -- attributions concurrentes (crée la ligne à 0 si absente).
  insert into points_balances (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  select balance into v_balance
  from points_balances
  where user_id = p_user_id
  for update;

  -- R3 : écrêtage au plafond. Solde plein → aucun lot, aucun mouvement
  -- (renvoie null) ; l'appelant n'a rien à gérer, l'accumulation s'arrête.
  v_award := least(p_points, greatest(v_cap - v_balance, 0));
  if v_award = 0 then
    return null;
  end if;
  if v_award < p_points then
    v_metadata := v_metadata || jsonb_build_object(
      'clipped_points', p_points - v_award,
      'max_balance_points', v_cap
    );
  end if;

  insert into points_batches
    (user_id, points_earned, points_remaining, reason, order_id, expires_at)
  values
    (p_user_id, v_award, v_award, p_reason, p_order_id,
     now() + make_interval(days => p_expires_in_days))
  returning id into v_batch_id;

  insert into points_ledger
    (user_id, batch_id, delta, balance_after, reason, order_id, metadata)
  values
    (p_user_id, v_batch_id, v_award, v_balance + v_award, p_reason, p_order_id,
     v_metadata);

  return v_batch_id;
end;
$$;
revoke all on function award_points(uuid, integer, points_reason, uuid, integer, jsonb)
  from public, anon, authenticated;
