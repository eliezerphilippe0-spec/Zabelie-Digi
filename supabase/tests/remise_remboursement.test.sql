-- Tests de 0168 — un remboursement sort la remise du circuit. Transaction annulée.
--
--   R1. Physique en attente d'envoi, remboursé : la remise passe `action_required` ;
--       le vendeur ne peut plus déclarer l'envoi ni confirmer par code, l'acheteur
--       n'obtient plus de code. AVANT le remboursement, la déclaration passait.
--   R2. Physique déjà expédié, remboursé : ni « J'ai reçu », ni l'auto-réception.
--   R3. Service (que le balayage de 0043 ne couvre pas) : même règle.
--   R4. Une remise `received` ou `disputed_by_buyer` n'est pas réécrite.
--   R5. Connu-négatif : un changement de statut qui n'est PAS un remboursement,
--       ou un « remboursement » d'une commande déjà remboursée, ne touche à rien.
--   R6. L'identité de 0033 tient après les remboursements ; aucun droit client.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000c6801', 'r.vendeur@test.local'),
  ('00000000-0000-0000-0000-0000000c6802', 'r.acheteur@test.local');
delete from profiles where id in ('00000000-0000-0000-0000-0000000c6801', '00000000-0000-0000-0000-0000000c6802');
insert into profiles (id, display_name, role) values
  ('00000000-0000-0000-0000-0000000c6801', 'Vendeur R', 'creator'),
  ('00000000-0000-0000-0000-0000000c6802', 'Acheteur R', 'buyer');
insert into wallets (owner_id) values ('00000000-0000-0000-0000-0000000c6801');

insert into products (id, seller_id, slug, title, price_htg, kind, status) values
  ('00000000-0000-0000-0000-0000000c6810', '00000000-0000-0000-0000-0000000c6801', 'lampe-r', 'Lampe R', 2000, 'physical', 'published'),
  ('00000000-0000-0000-0000-0000000c6811', '00000000-0000-0000-0000-0000000c6801', 'cours-r', 'Cours R', 1000, 'service', 'published');

do $$
declare
  v_wallet uuid;
  v_seller uuid := '00000000-0000-0000-0000-0000000c6801';
  v_buyer  uuid := '00000000-0000-0000-0000-0000000c6802';
  v_o1 uuid := '00000000-0000-0000-0000-0000000c6820';  -- physique, en attente d'envoi
  v_o2 uuid := '00000000-0000-0000-0000-0000000c6821';  -- physique, expédié
  v_o3 uuid := '00000000-0000-0000-0000-0000000c6822';  -- service, en attente
  v_o4 uuid := '00000000-0000-0000-0000-0000000c6823';  -- physique, reçu
  v_o5 uuid := '00000000-0000-0000-0000-0000000c6824';  -- physique, litige acheteur
  v_o6 uuid := '00000000-0000-0000-0000-0000000c6825';  -- témoin : jamais remboursé
  v_o7 uuid := '00000000-0000-0000-0000-0000000c6826';  -- témoin : déclaration AVANT remboursement
  v_res jsonb;
  v_etat text;
  v_ledger bigint; v_balance bigint; v_pending bigint;
  v_o uuid;
begin
  select id into v_wallet from wallets where owner_id = v_seller;
  insert into orders (id, buyer_id, product_id, amount_htg, status) values
    (v_o1, v_buyer, '00000000-0000-0000-0000-0000000c6810', 2000, 'paid'),
    (v_o2, v_buyer, '00000000-0000-0000-0000-0000000c6810', 2000, 'paid'),
    (v_o3, v_buyer, '00000000-0000-0000-0000-0000000c6811', 1000, 'paid'),
    (v_o4, v_buyer, '00000000-0000-0000-0000-0000000c6810', 2000, 'paid'),
    (v_o5, v_buyer, '00000000-0000-0000-0000-0000000c6810', 2000, 'paid'),
    (v_o6, v_buyer, '00000000-0000-0000-0000-0000000c6810', 2000, 'paid'),
    (v_o7, v_buyer, '00000000-0000-0000-0000-0000000c6810', 2000, 'paid');
  foreach v_o in array array[v_o1, v_o2, v_o3, v_o4, v_o5, v_o6, v_o7] loop
    insert into escrow_entries (order_id, wallet_id, amount_htg, matures_at)
      values (v_o, v_wallet, 900, now() + interval '7 days');
    insert into wallet_transactions (wallet_id, type, amount_htg, order_id, idempotency_key)
      values (v_wallet, 'credit', 900, v_o, 'order_credit:' || v_o);
    if not zabelie_open_fulfillment(v_o) then
      raise exception 'R0: suivi non ouvert pour %', v_o;
    end if;
  end loop;
  update wallets set pending_htg = 7 * 900 where id = v_wallet;

  -- Témoin connu-positif : AVANT tout remboursement, la déclaration d'envoi passe.
  v_res := zabelie_declare_shipment(v_o7, v_seller, 'témoin');
  if not (v_res ->> 'ok')::boolean then raise exception 'R0: la déclaration témoin a échoué (%)', v_res; end if;

  perform zabelie_declare_shipment(v_o2, v_seller, 'expédié');
  perform zabelie_declare_shipment(v_o4, v_seller, 'expédié');
  perform zabelie_mark_received(v_o4, v_buyer, false);
  perform zabelie_declare_shipment(v_o5, v_seller, 'expédié');
  perform zabelie_report_not_received(v_o5, v_buyer, 'jamais reçu');

  -- ── R1 — physique en attente d'envoi ─────────────────────────────────────
  if refund_order(v_o1) <> 'reversed' then raise exception 'R1: remboursement non passé'; end if;
  select status::text into v_etat from zabelie_fulfillment where order_id = v_o1;
  if v_etat <> 'action_required' then raise exception 'R1: remise restée %', v_etat; end if;
  v_res := zabelie_declare_shipment(v_o1, v_seller, 'après remboursement');
  if (v_res ->> 'ok')::boolean then raise exception 'R1: envoi déclaré sur une commande remboursée'; end if;
  v_res := zabelie_handover_code_get(v_o1, v_buyer);
  if (v_res ->> 'ok')::boolean then raise exception 'R1: code de remise délivré après remboursement'; end if;
  v_res := zabelie_handover_confirm(v_o1, v_seller, '123456');
  if (v_res ->> 'ok')::boolean or v_res ->> 'reason' <> 'etat_incompatible' then
    raise exception 'R1: code de remise accepté ou mauvais motif (%)', v_res;
  end if;
  raise notice 'R1 OK — physique en attente : ni envoi, ni code';

  -- ── R2 — physique expédié ────────────────────────────────────────────────
  perform refund_order(v_o2);
  select status::text into v_etat from zabelie_fulfillment where order_id = v_o2;
  if v_etat <> 'action_required' then raise exception 'R2: remise restée %', v_etat; end if;
  v_res := zabelie_mark_received(v_o2, v_buyer, false);
  if (v_res ->> 'ok')::boolean then raise exception 'R2: réception confirmée après remboursement'; end if;
  v_res := zabelie_mark_received(v_o2, null, true);
  if (v_res ->> 'ok')::boolean then raise exception 'R2: auto-réception après remboursement'; end if;
  raise notice 'R2 OK — physique expédié : ni réception, ni auto-réception';

  -- ── R3 — service ─────────────────────────────────────────────────────────
  perform refund_order(v_o3);
  select status::text into v_etat from zabelie_fulfillment where order_id = v_o3;
  if v_etat <> 'action_required' then raise exception 'R3: remise du service restée %', v_etat; end if;
  v_res := zabelie_declare_shipment(v_o3, v_seller, 'service rendu ?');
  if (v_res ->> 'ok')::boolean then raise exception 'R3: service déclaré rendu après remboursement'; end if;
  raise notice 'R3 OK — service : sorti du circuit';

  -- ── R4 — états terminaux intacts ─────────────────────────────────────────
  perform refund_order(v_o4);
  perform refund_order(v_o5);
  select status::text into v_etat from zabelie_fulfillment where order_id = v_o4;
  if v_etat <> 'received' then raise exception 'R4: une remise reçue a été réécrite en %', v_etat; end if;
  select status::text into v_etat from zabelie_fulfillment where order_id = v_o5;
  if v_etat <> 'disputed_by_buyer' then raise exception 'R4: un litige acheteur a été réécrit en %', v_etat; end if;
  raise notice 'R4 OK — received et disputed_by_buyer intacts';

  -- ── R5 — connus-négatifs ─────────────────────────────────────────────────
  update orders set status = 'disputed' where id = v_o6;
  select status::text into v_etat from zabelie_fulfillment where order_id = v_o6;
  if v_etat <> 'awaiting_shipment' then raise exception 'R5: un statut autre que refunded a fermé la remise (%)', v_etat; end if;
  -- Re-poser `refunded` sur une commande déjà remboursée ne refait rien.
  update zabelie_fulfillment set status = 'awaiting_shipment' where order_id = v_o1;
  update orders set status = 'refunded' where id = v_o1;
  select status::text into v_etat from zabelie_fulfillment where order_id = v_o1;
  if v_etat <> 'awaiting_shipment' then raise exception 'R5: le déclencheur a joué sans changement de statut'; end if;
  update zabelie_fulfillment set status = 'action_required' where order_id = v_o1;
  raise notice 'R5 OK — seul le passage EN refunded ferme la remise';

  -- ── R6 — grand livre et droits ───────────────────────────────────────────
  select coalesce(sum(amount_htg), 0) into v_ledger from wallet_transactions where wallet_id = v_wallet;
  select balance_htg, pending_htg into v_balance, v_pending from wallets where id = v_wallet;
  if v_ledger <> v_balance + v_pending then
    raise exception 'R6: identité 0033 rompue (% <> % + %)', v_ledger, v_balance, v_pending;
  end if;
  if has_function_privilege('anon', 'zabelie_remise_sur_remboursement()', 'execute')
     or has_function_privilege('authenticated', 'zabelie_remise_sur_remboursement()', 'execute') then
    raise exception 'R6: fonction du déclencheur exécutable par un client';
  end if;
  raise notice 'R6 OK — identité 0033 tenue, aucun droit client';
end $$;

rollback;
