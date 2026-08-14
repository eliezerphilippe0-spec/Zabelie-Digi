-- Tests du « rendu » de prestation (0068). Transaction annulée à la fin.
--
--   S1. Service payé → suivi OUVERT, escrow VERROUILLÉ. C'est la ligne qui
--       change tout : avant 0068, `open_fulfillment` rendait false et le
--       vendeur était payé au chronomètre.
--   S2. `fichier` reste DEHORS : pas de suivi, escrow non verrouillé. Le
--       jumeau connu-négatif de S1 — sans lui, S1 pourrait être vert parce
--       que la porte laisse TOUT entrer.
--   S3. Escrow verrouillé NE MÛRIT PAS au chronomètre, échéance dépassée.
--   S4. Le vendeur déclare la prestation rendue ; un TIERS ne peut pas.
--   S5. L'acheteur ne peut pas confirmer une prestation NON déclarée —
--       il libérerait les fonds d'un travail que rien n'atteste.
--   S6. Acceptation acheteur → commande `delivered`, escrow déverrouillé.
--   S7. Silence de l'acheteur après déclaration → auto-acceptation par le
--       sweep de 0043 SANS MODIFICATION de celui-ci : ses branches sont
--       agnostiques au kind, c'est la découverte qui a réduit ce chantier.
--   S8. Filet orphelin : escrow service confirmé SANS ligne de suivi →
--       réparé (ouvert + verrouillé, created_at ancré sur le paiement).
--   S9. Filet orphelin, cas TARDIF : escrow déjà mûri → action_required +
--       commande disputed, et AUCUNE écriture sur escrow_entries.
--   S10. Identité comptable 0033 : aucune étape ne déplace d'argent.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000e0001', 's.vandè@test.local'),
  ('00000000-0000-0000-0000-0000000e0002', 's.achtè@test.local'),
  ('00000000-0000-0000-0000-0000000e0003', 's.tiers@test.local');

insert into profiles (id, display_name) values
  ('00000000-0000-0000-0000-0000000e0001', 'Vandè Sèvis'),
  ('00000000-0000-0000-0000-0000000e0002', 'Achtè Sèvis'),
  ('00000000-0000-0000-0000-0000000e0003', 'Tyès')
on conflict (id) do nothing;

insert into products (id, seller_id, slug, title, price_htg, kind, status) values
  ('00000000-0000-0000-0000-0000000e0010', '00000000-0000-0000-0000-0000000e0001',
   'mentorat-s', 'Mentorat S', 3000, 'service', 'published'),
  ('00000000-0000-0000-0000-0000000e0011', '00000000-0000-0000-0000-0000000e0001',
   'ebook-s', 'E-book S', 1000, 'fichier', 'published');

do $$
declare
  v_vendeur uuid := '00000000-0000-0000-0000-0000000e0001';
  v_acheteur uuid := '00000000-0000-0000-0000-0000000e0002';
  v_tiers   uuid := '00000000-0000-0000-0000-0000000e0003';
  v_svc     uuid := '00000000-0000-0000-0000-0000000e0010';
  v_fic     uuid := '00000000-0000-0000-0000-0000000e0011';
  v_o_svc   uuid := '00000000-0000-0000-0000-0000000e0020';
  v_o_fic   uuid := '00000000-0000-0000-0000-0000000e0021';
  v_o_orph  uuid := '00000000-0000-0000-0000-0000000e0022';
  v_o_tard  uuid := '00000000-0000-0000-0000-0000000e0023';
  v_wallet  uuid;
  v_ret     jsonb;
  v_b       boolean;
  v_status  text;
  v_gated   boolean;
  v_avant   jsonb;
  v_apres   jsonb;
  v_ecart   bigint;
begin
  select id into v_wallet from wallets where owner_id = v_vendeur;
  if v_wallet is null then
    insert into wallets (owner_id) values (v_vendeur) returning id into v_wallet;
  end if;

  -- ── Décor : une commande service payée, escrow en maturation ──────────────
  insert into orders (id, buyer_id, product_id, amount_htg, status)
  values (v_o_svc, v_acheteur, v_svc, 3000, 'paid');
  insert into payments (order_id, rail, idempotency_key, status, confirmed_at)
  values (v_o_svc, 'moncash', 'S-PAY-1', 'confirmed', now());
  insert into escrow_entries (order_id, wallet_id, amount_htg, status, matures_at)
  values (v_o_svc, v_wallet, 2700, 'maturing', now() + interval '7 days');

  -- ── S1 : la porte admet le service ────────────────────────────────────────
  select zabelie_open_fulfillment(v_o_svc) into v_b;
  if v_b is distinct from true then
    raise exception 'S1 : open_fulfillment rend % pour un service — la machine reste fermee', v_b;
  end if;
  select status::text into v_status from zabelie_fulfillment where order_id = v_o_svc;
  if v_status is distinct from 'awaiting_shipment' then
    raise exception 'S1 : suivi absent ou etat inattendu (%)', v_status;
  end if;
  select gated_on_delivery into v_gated from escrow_entries where order_id = v_o_svc;
  if v_gated is distinct from true then
    raise exception 'S1 : escrow NON verrouille — le vendeur serait paye au chronometre';
  end if;
  raise notice 'S1 OK — service : suivi ouvert, escrow verrouille';

  -- ── S2 : le jumeau connu-négatif — fichier reste dehors ───────────────────
  insert into orders (id, buyer_id, product_id, amount_htg, status)
  values (v_o_fic, v_acheteur, v_fic, 1000, 'paid');
  insert into payments (order_id, rail, idempotency_key, status, confirmed_at)
  values (v_o_fic, 'moncash', 'S-PAY-2', 'confirmed', now());
  insert into escrow_entries (order_id, wallet_id, amount_htg, status, matures_at)
  values (v_o_fic, v_wallet, 900, 'maturing', now() + interval '7 days');
  select zabelie_open_fulfillment(v_o_fic) into v_b;
  if v_b is distinct from false then
    raise exception 'S2 : open_fulfillment rend % pour un fichier — la porte laisse tout entrer', v_b;
  end if;
  if exists (select 1 from zabelie_fulfillment where order_id = v_o_fic) then
    raise exception 'S2 : un suivi a ete ouvert pour un fichier';
  end if;
  select gated_on_delivery into v_gated from escrow_entries where order_id = v_o_fic;
  if v_gated is distinct from false then
    raise exception 'S2 : escrow d''un fichier verrouille — sa paie attendrait une reception que personne ne prononce';
  end if;
  raise notice 'S2 OK — fichier : hors machine, escrow libre';

  -- ── S3 : verrouillé ne mûrit pas, même échéance dépassée ──────────────────
  update escrow_entries set matures_at = now() - interval '1 day'
   where order_id = v_o_svc;
  perform mature_wallets();
  select status::text into v_status from escrow_entries where order_id = v_o_svc;
  if v_status is distinct from 'maturing' then
    raise exception 'S3 : escrow % — un service verrouille a muri au chronometre', v_status;
  end if;
  raise notice 'S3 OK — pas de paie au chronometre';

  -- ── S4 : le vendeur déclare, un tiers non ─────────────────────────────────
  select zabelie_declare_shipment(v_o_svc, v_tiers, null) into v_ret;
  if (v_ret->>'ok')::boolean then
    raise exception 'S4 : un TIERS a declare la prestation rendue';
  end if;
  select zabelie_declare_shipment(v_o_svc, v_vendeur, 'Session faite jedi') into v_ret;
  if not (v_ret->>'ok')::boolean then
    raise exception 'S4 : le vendeur ne peut pas declarer (%)', v_ret->>'reason';
  end if;
  raise notice 'S4 OK — declaration reservee au vendeur';

  -- ── S5 déjà couvert par l'ordre : la déclaration a eu lieu en S4. Le cas
  --    « accepter avant déclaration » se joue sur la commande orpheline S8,
  --    AVANT réparation — le suivi n'existe pas encore.
  insert into orders (id, buyer_id, product_id, amount_htg, status)
  values (v_o_orph, v_acheteur, v_svc, 3000, 'paid');
  insert into payments (order_id, rail, idempotency_key, status, confirmed_at)
  values (v_o_orph, 'moncash', 'S-PAY-3', 'confirmed', now() - interval '10 hours');
  insert into escrow_entries (order_id, wallet_id, amount_htg, status, matures_at)
  values (v_o_orph, v_wallet, 2700, 'maturing', now() + interval '7 days');
  select zabelie_mark_received(v_o_orph, v_acheteur, false) into v_ret;
  if (v_ret->>'ok')::boolean then
    raise exception 'S5 : acceptation sans suivi ACCEPTEE';
  end if;
  raise notice 'S5 OK — pas d''acceptation sans declaration';

  -- ── S6 : l'acheteur accepte → delivered + déverrouillé ────────────────────
  select zabelie_mark_received(v_o_svc, v_acheteur, false) into v_ret;
  if not (v_ret->>'ok')::boolean then
    raise exception 'S6 : acceptation refusee (%)', v_ret->>'reason';
  end if;
  select status into v_status from orders where id = v_o_svc;
  if v_status is distinct from 'delivered' then
    raise exception 'S6 : commande % au lieu de delivered', v_status;
  end if;
  select gated_on_delivery into v_gated from escrow_entries where order_id = v_o_svc;
  if v_gated is distinct from false then
    raise exception 'S6 : escrow encore verrouille apres acceptation';
  end if;
  raise notice 'S6 OK — prestation confirmee, escrow deverrouille';

  -- ── S8 : le filet orphelin répare ─────────────────────────────────────────
  select zabelie_service_sans_suivi_sweep() into v_ret;
  if (v_ret->>'services_repares')::int <> 1 then
    raise exception 'S8 : % repare(s), 1 attendu — l''orphelin de S5 n''a pas ete vu', v_ret->>'services_repares';
  end if;
  select gated_on_delivery into v_gated from escrow_entries where order_id = v_o_orph;
  if v_gated is distinct from true then
    raise exception 'S8 : orphelin repare mais escrow non verrouille';
  end if;
  if (select created_at from zabelie_fulfillment where order_id = v_o_orph)
     > now() - interval '9 hours' then
    raise exception 'S8 : created_at non ancre sur la confirmation du paiement';
  end if;
  raise notice 'S8 OK — orphelin repare, delai ancre sur le paiement';

  -- ── S7 : silence de l'acheteur → auto-acceptation par le sweep de 0043 ────
  -- La commande orpheline réparée sert de décor : le vendeur déclare, les avis
  -- sont marqués partis (condition de légitimité), l'horloge est reculée.
  select zabelie_declare_shipment(v_o_orph, v_vendeur, null) into v_ret;
  update zabelie_fulfillment set shipped_at = now() - interval '9 days'
   where order_id = v_o_orph;
  update zabelie_fulfillment_notices set sent_at = now() - interval '8 days'
   where order_id = v_o_orph;
  perform zabelie_fulfillment_sweep();
  select status::text into v_status from zabelie_fulfillment where order_id = v_o_orph;
  if v_status is distinct from 'received' then
    raise exception 'S7 : etat % — le sweep de 0043 n''a pas auto-accepte le service', v_status;
  end if;
  if (select auto_received from zabelie_fulfillment where order_id = v_o_orph) is distinct from true then
    raise exception 'S7 : reception non marquee automatique';
  end if;
  raise notice 'S7 OK — auto-acceptation par la machine existante, sans la modifier';

  -- ── S9 : orphelin TARDIF — escrow mûri, aucune écriture dessus ────────────
  insert into orders (id, buyer_id, product_id, amount_htg, status)
  values (v_o_tard, v_acheteur, v_svc, 3000, 'paid');
  insert into payments (order_id, rail, idempotency_key, status, confirmed_at)
  values (v_o_tard, 'moncash', 'S-PAY-4', 'confirmed', now() - interval '20 days');
  insert into escrow_entries (order_id, wallet_id, amount_htg, status, matures_at)
  values (v_o_tard, v_wallet, 2700, 'matured', now() - interval '13 days');
  select to_jsonb(e) into v_avant from escrow_entries e where order_id = v_o_tard;
  select zabelie_service_sans_suivi_sweep() into v_ret;
  if (v_ret->>'services_tardifs')::int <> 1 then
    raise exception 'S9 : % tardif(s), 1 attendu', v_ret->>'services_tardifs';
  end if;
  select status::text into v_status from zabelie_fulfillment where order_id = v_o_tard;
  if v_status is distinct from 'action_required' then
    raise exception 'S9 : etat % au lieu de action_required', v_status;
  end if;
  select status into v_status from orders where id = v_o_tard;
  if v_status is distinct from 'disputed' then
    raise exception 'S9 : commande % au lieu de disputed', v_status;
  end if;
  select to_jsonb(e) into v_apres from escrow_entries e where order_id = v_o_tard;
  if v_avant is distinct from v_apres then
    raise exception 'S9 : escrow_entries MODIFIE sur un cas tardif — l''identite 0033 est en jeu';
  end if;
  raise notice 'S9 OK — tardif porte a l''humain, escrow intact champ par champ';

  -- ── S10 : l'identité comptable tient ──────────────────────────────────────
  select coalesce(sum(w.balance_htg + w.pending_htg), 0)
       - coalesce((select sum(t.amount_htg) from wallet_transactions t
                    join wallets w2 on w2.id = t.wallet_id where w2.owner_id = v_vendeur), 0)
    into v_ecart
    from wallets w where w.owner_id = v_vendeur;
  if v_ecart <> 0 then
    raise exception 'S10 : ecart comptable de % HTG', v_ecart;
  end if;
  raise notice 'S10 OK — identite 0033 intacte';
end $$;

rollback;
