-- Tests escrow / maturation J+7 + remboursement (EPIC 5).
-- À exécuter dans une transaction annulée (rollback).
-- Usage : psql "$DATABASE_URL" -f supabase/tests/escrow_maturation.test.sql
--
-- Couvre :
--   M. Maturation : NET en attente à la confirmation → disponible après échéance.
--   R. Remboursement avant maturité = AUCUN solde fantôme (pending annulé, jamais
--      crédité en disponible, même après passage du job de maturation). + idempotence.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 's1@test.local'),
  ('00000000-0000-0000-0000-000000000002', 's2@test.local')
  on conflict do nothing;

-- 0045 : le profil est désormais créé en base à l'inscription. Ces tests
-- veulent piloter la ligne eux-mêmes (rôle, tier) et éprouver le chemin
-- INSERT de `protect_profile_privileges` — on retire donc la ligne
-- auto-créée plutôt que de basculer en UPDATE, qui ne teste pas la même
-- chose.
delete from profiles where id in (select id from auth.users);
insert into profiles (id, role, display_name, tier) values
  ('00000000-0000-0000-0000-000000000001', 'creator', 'S1', 'standard'),
  ('00000000-0000-0000-0000-000000000002', 'creator', 'S2', 'standard');

-- ════════════════ M : maturation (net 2250 sur 2500) ════════════════
insert into products (id, seller_id, slug, title, kind, price_htg, status)
  values ('00000000-0000-0000-0000-0000000000a1',
          '00000000-0000-0000-0000-000000000001',
          'prod-m', 'Prod M', 'fichier', 2500, 'published');
insert into orders (id, buyer_id, product_id, amount_htg, status)
  values ('00000000-0000-0000-0000-0000000000b1',
          '00000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-0000000000a1', 2500, 'pending');
insert into payments (order_id, rail, idempotency_key, status)
  values ('00000000-0000-0000-0000-0000000000b1', 'moncash',
          '00000000-0000-0000-0000-0000000000b1', 'pending');
select confirm_payment('00000000-0000-0000-0000-0000000000b1', 'TXM', '{}'::jsonb, 2500);

-- ════════════════ R : remboursement avant maturité (net 2700 sur 3000) ════════════════
insert into products (id, seller_id, slug, title, kind, price_htg, status)
  values ('00000000-0000-0000-0000-0000000000a2',
          '00000000-0000-0000-0000-000000000002',
          'prod-r', 'Prod R', 'fichier', 3000, 'published');
insert into orders (id, buyer_id, product_id, amount_htg, status)
  values ('00000000-0000-0000-0000-0000000000b2',
          '00000000-0000-0000-0000-000000000002',
          '00000000-0000-0000-0000-0000000000a2', 3000, 'pending');
insert into payments (order_id, rail, idempotency_key, status)
  values ('00000000-0000-0000-0000-0000000000b2', 'moncash',
          '00000000-0000-0000-0000-0000000000b2', 'pending');
select confirm_payment('00000000-0000-0000-0000-0000000000b2', 'TXR', '{}'::jsonb, 3000);

-- Remboursement avant maturité (deux fois → idempotent).
select refund_order('00000000-0000-0000-0000-0000000000b2');
select refund_order('00000000-0000-0000-0000-0000000000b2');

-- M arrive à échéance ; on déclenche le job de maturation.
update escrow_entries set matures_at = now() - interval '1 day'
  where order_id = '00000000-0000-0000-0000-0000000000b1';
select mature_wallets();
select mature_wallets(); -- rejeu : ne doit rien refaire

-- ════════════════════════════ Assertions ════════════════════════════
do $$
declare
  v_m_pending bigint; v_m_avail bigint; v_m_status escrow_status;
  v_r_pending bigint; v_r_avail bigint; v_r_status escrow_status; v_r_order order_status;
begin
  -- M : matured → tout en disponible, rien en attente.
  select pending_htg, balance_htg into v_m_pending, v_m_avail
    from wallets where owner_id = '00000000-0000-0000-0000-000000000001';
  select status into v_m_status
    from escrow_entries where order_id = '00000000-0000-0000-0000-0000000000b1';
  assert v_m_avail = 2250, format('M: disponible attendu 2250, obtenu %s', v_m_avail);
  assert v_m_pending = 0, format('M: en attente attendu 0, obtenu %s', v_m_pending);
  assert v_m_status = 'matured', format('M: escrow attendu matured, obtenu %s', v_m_status);

  -- R : remboursé avant maturité → AUCUN solde fantôme (ni pending ni disponible).
  select pending_htg, balance_htg into v_r_pending, v_r_avail
    from wallets where owner_id = '00000000-0000-0000-0000-000000000002';
  select status into v_r_status
    from escrow_entries where order_id = '00000000-0000-0000-0000-0000000000b2';
  select status into v_r_order
    from orders where id = '00000000-0000-0000-0000-0000000000b2';
  assert v_r_pending = 0, format('R: en attente doit être 0, obtenu %s', v_r_pending);
  assert v_r_avail = 0, format('R: SOLDE FANTÔME — disponible doit être 0, obtenu %s', v_r_avail);
  assert v_r_status = 'reversed', format('R: escrow attendu reversed, obtenu %s', v_r_status);
  assert v_r_order = 'refunded', format('R: order attendu refunded, obtenu %s', v_r_order);

  raise notice 'OK — M maturé (dispo=%, attente=%) ; R remboursé sans solde fantôme (attente=%, dispo=%)',
    v_m_avail, v_m_pending, v_r_pending, v_r_avail;
end $$;

rollback;
