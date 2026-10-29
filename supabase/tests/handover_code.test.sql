-- Tests du code de remise (0163). Transaction annulée à la fin.
--
--   H1. L'acheteur crée puis relit SON code (six chiffres, stable) ; ni le vendeur, ni
--       un tiers ne le lisent ; pas de code sur un suivi absent ni sur une commande close.
--   H2. Aucun droit client : ni sur la table, ni sur les deux fonctions.
--   H3. Un faux code use un essai, ne change RIEN à la commande, à l'escrow ni au
--       suivi ; il RESTE enregistré (rendu, pas levé). Une forme invalide n'use rien.
--   H4. Le verrou : après le plafond (config), même le bon code est refusé — et
--       l'acheteur confirme encore par la voie existante.
--   H5. LE POINT CENTRAL : un bon code produit exactement la transition « J'ai reçu » —
--       réception, commande `delivered`, escrow déverrouillé — et le plancher J+7 est
--       CONSERVÉ : rien ne mûrit, aucun solde ne bouge, l'identité de 0033 tient.
--   H6. Un code est refusé hors du vendeur de la commande ; code absent ≠ essai usé ;
--       un litige n'est pas clos par un code ; rejeu = doublon.
--   H7. Depuis `shipped` (déjà déclaré) le code ferme aussi la commande.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000c6301', 'h.vendeur@test.local'),
  ('00000000-0000-0000-0000-0000000c6302', 'h.acheteur@test.local'),
  ('00000000-0000-0000-0000-0000000c6303', 'h.tiers@test.local'),
  ('00000000-0000-0000-0000-0000000c6304', 'h.autrevendeur@test.local');
delete from profiles where id in (select id from auth.users);
insert into profiles (id, display_name, role) values
  ('00000000-0000-0000-0000-0000000c6301', 'Vendeur H', 'creator'),
  ('00000000-0000-0000-0000-0000000c6302', 'Acheteur H', 'buyer'),
  ('00000000-0000-0000-0000-0000000c6303', 'Tiers H', 'buyer'),
  ('00000000-0000-0000-0000-0000000c6304', 'Autre vendeur H', 'creator');
insert into wallets (owner_id) values ('00000000-0000-0000-0000-0000000c6301');

insert into products (id, seller_id, slug, title, price_htg, kind, status) values
  ('00000000-0000-0000-0000-0000000c6310', '00000000-0000-0000-0000-0000000c6301', 'filtre-h', 'Filtre H', 2000, 'physical', 'published'),
  ('00000000-0000-0000-0000-0000000c6311', '00000000-0000-0000-0000-0000000c6301', 'ebook-h', 'E-book H', 1000, 'fichier', 'published');

do $$
declare
  v_wallet uuid;
  v_o1 uuid := '00000000-0000-0000-0000-0000000c6320';  -- physique, awaiting_shipment
  v_o2 uuid := '00000000-0000-0000-0000-0000000c6321';  -- physique, shipped (déjà déclaré)
  v_o3 uuid := '00000000-0000-0000-0000-0000000c6322';  -- physique, litige
  v_o4 uuid := '00000000-0000-0000-0000-0000000c6323';  -- numérique
  v_buyer  uuid := '00000000-0000-0000-0000-0000000c6302';
  v_seller uuid := '00000000-0000-0000-0000-0000000c6301';
  v_tiers  uuid := '00000000-0000-0000-0000-0000000c6303';
  v_other  uuid := '00000000-0000-0000-0000-0000000c6304';
  v_res jsonb; v_res2 jsonb; v_code text; v_wrong text;
  v_matures timestamptz; v_gated boolean; v_attempts integer;
  v_balance bigint; v_pending bigint; v_ledger bigint;
begin
  select id into v_wallet from wallets where owner_id = v_seller;

  insert into orders (id, buyer_id, product_id, amount_htg, status) values
    (v_o1, v_buyer, '00000000-0000-0000-0000-0000000c6310', 2000, 'paid'),
    (v_o2, v_buyer, '00000000-0000-0000-0000-0000000c6310', 2000, 'paid'),
    (v_o3, v_buyer, '00000000-0000-0000-0000-0000000c6310', 2000, 'paid'),
    (v_o4, v_buyer, '00000000-0000-0000-0000-0000000c6311', 1000, 'paid');
  -- Escrow à échéance FUTURE (J+7) : le plancher anti-fraude doit survivre à la réception.
  insert into escrow_entries (order_id, wallet_id, amount_htg, matures_at) values
    (v_o1, v_wallet, 1800, now() + interval '7 days'),
    (v_o2, v_wallet, 1800, now() + interval '7 days'),
    (v_o3, v_wallet, 1800, now() + interval '7 days');
  update wallets set pending_htg = 5400 where id = v_wallet;
  insert into wallet_transactions (wallet_id, type, amount_htg, idempotency_key) values
    (v_wallet, 'credit', 1800, 'test_h_1'), (v_wallet, 'credit', 1800, 'test_h_2'), (v_wallet, 'credit', 1800, 'test_h_3');

  perform zabelie_open_fulfillment(v_o1);
  perform zabelie_open_fulfillment(v_o2);
  perform zabelie_open_fulfillment(v_o3);
  if zabelie_open_fulfillment(v_o4) then raise exception 'H0: un suivi a été ouvert pour un numérique'; end if;
  -- v_o2 : le vendeur a déjà déclaré la remise.
  perform zabelie_declare_shipment(v_o2, v_seller, 'déclaré avant le code');
  -- v_o3 : litige (« je n'ai pas reçu » exige `shipped`).
  perform zabelie_declare_shipment(v_o3, v_seller, 'x');
  perform zabelie_report_not_received(v_o3, v_buyer, 'jamais reçu');

  -- ── H1 — l'acheteur lit son code ────────────────────────────────────────
  v_res := zabelie_handover_code_get(v_o1, v_buyer);
  if not (v_res ->> 'ok')::boolean then raise exception 'H1: l''acheteur n''obtient pas son code (%)', v_res ->> 'reason'; end if;
  v_code := v_res ->> 'code';
  if v_code !~ '^[0-9]{6}$' then raise exception 'H1: le code n''a pas six chiffres : %', v_code; end if;
  v_res2 := zabelie_handover_code_get(v_o1, v_buyer);
  if v_res2 ->> 'code' <> v_code then raise exception 'H1: le code change à la seconde lecture'; end if;
  if (select count(*) from zabelie_handover_codes where order_id = v_o1) <> 1 then raise exception 'H1: plus d''une ligne de code'; end if;

  v_res := zabelie_handover_code_get(v_o1, v_seller);
  if (v_res ->> 'ok')::boolean or v_res ->> 'reason' <> 'non_autorise' then raise exception 'H1: LE VENDEUR a pu lire le code (%)', v_res; end if;
  v_res := zabelie_handover_code_get(v_o1, v_tiers);
  if (v_res ->> 'ok')::boolean then raise exception 'H1: un TIERS a pu lire le code'; end if;
  v_res := zabelie_handover_code_get(v_o4, v_buyer);
  if (v_res ->> 'ok')::boolean or v_res ->> 'reason' <> 'suivi_absent' then raise exception 'H1: un code a été délivré pour un NUMÉRIQUE (%)', v_res; end if;
  v_res := zabelie_handover_code_get(v_o3, v_buyer);
  if (v_res ->> 'ok')::boolean or v_res ->> 'reason' <> 'etat_incompatible' then raise exception 'H1: un code a été délivré pour une commande EN LITIGE (%)', v_res; end if;

  -- ── H2 — aucun droit client ─────────────────────────────────────────────
  if has_table_privilege('anon', 'zabelie_handover_codes', 'select') or has_table_privilege('authenticated', 'zabelie_handover_codes', 'select')
     or has_table_privilege('authenticated', 'zabelie_handover_codes', 'insert') or has_table_privilege('authenticated', 'zabelie_handover_codes', 'update') then
    raise exception 'H2: un rôle client a un droit sur la table des codes';
  end if;
  if has_function_privilege('anon', 'zabelie_handover_code_get(uuid,uuid)', 'execute') or has_function_privilege('authenticated', 'zabelie_handover_code_get(uuid,uuid)', 'execute')
     or has_function_privilege('anon', 'zabelie_handover_confirm(uuid,uuid,text)', 'execute') or has_function_privilege('authenticated', 'zabelie_handover_confirm(uuid,uuid,text)', 'execute') then
    raise exception 'H2: une fonction du code est exécutable par un rôle client';
  end if;

  -- ── H3 — un faux code use un essai et ne change rien ────────────────────
  v_wrong := lpad(((v_code::int + 1) % 1000000)::text, 6, '0');
  v_res := zabelie_handover_confirm(v_o1, v_seller, v_wrong);
  if (v_res ->> 'ok')::boolean or v_res ->> 'reason' <> 'code_incorrect' or (v_res ->> 'restantes')::int <> 4 then
    raise exception 'H3: faux code mal traité (%)', v_res;
  end if;
  select attempts into v_attempts from zabelie_handover_codes where order_id = v_o1;
  if v_attempts <> 1 then raise exception 'H3: l''essai n''est pas enregistré (attempts=%)', v_attempts; end if;
  if (select status::text from zabelie_fulfillment where order_id = v_o1) <> 'awaiting_shipment' then raise exception 'H3: un faux code a changé le suivi'; end if;
  if (select status::text from orders where id = v_o1) <> 'paid' then raise exception 'H3: un faux code a changé la commande'; end if;
  select gated_on_delivery into v_gated from escrow_entries where order_id = v_o1;
  if not v_gated then raise exception 'H3: un faux code a déverrouillé l''escrow'; end if;
  foreach v_wrong in array array['abc', '12345', '1234567', '12 345', ''] loop
    v_res := zabelie_handover_confirm(v_o1, v_seller, v_wrong);
    if v_res ->> 'reason' <> 'code_invalide' then raise exception 'H3: forme invalide mal traitée (%) : %', v_wrong, v_res; end if;
  end loop;
  v_res := zabelie_handover_confirm(v_o1, v_seller, null);
  if v_res ->> 'reason' <> 'code_invalide' then raise exception 'H3: code nul mal traité'; end if;
  select attempts into v_attempts from zabelie_handover_codes where order_id = v_o1;
  if v_attempts <> 1 then raise exception 'H3: une forme invalide a usé un essai (attempts=%)', v_attempts; end if;

  -- ── H6 — qui peut confirmer ─────────────────────────────────────────────
  v_res := zabelie_handover_confirm(v_o1, v_other, v_code);
  if (v_res ->> 'ok')::boolean or v_res ->> 'reason' <> 'non_autorise' then raise exception 'H6: un AUTRE vendeur a pu confirmer (%)', v_res; end if;
  v_res := zabelie_handover_confirm(v_o1, v_buyer, v_code);
  if (v_res ->> 'ok')::boolean then raise exception 'H6: l''ACHETEUR a pu confirmer par le chemin du vendeur'; end if;
  v_res := zabelie_handover_confirm(v_o2, v_seller, '000000');
  if v_res ->> 'reason' <> 'code_absent' then raise exception 'H6: code jamais affiché mal traité (%)', v_res; end if;
  if exists (select 1 from zabelie_handover_codes where order_id = v_o2) then raise exception 'H6: « code absent » a créé une ligne'; end if;
  v_res := zabelie_handover_confirm(v_o3, v_seller, '000000');
  if v_res ->> 'reason' <> 'etat_incompatible' then raise exception 'H6: un litige est clos par un code (%)', v_res; end if;
  if (select status::text from orders where id = v_o3) <> 'disputed' then raise exception 'H6: le litige a bougé'; end if;

  -- ── H5 — le bon code : MÊME transition que « J'ai reçu », plancher conservé ──
  select matures_at into v_matures from escrow_entries where order_id = v_o1;
  v_res := zabelie_handover_confirm(v_o1, v_seller, v_code);
  if not (v_res ->> 'ok')::boolean then raise exception 'H5: le bon code est refusé (%)', v_res; end if;
  if (select status::text from zabelie_fulfillment where order_id = v_o1) <> 'received' then raise exception 'H5: suivi non reçu'; end if;
  if (select received_by from zabelie_fulfillment where order_id = v_o1) is distinct from v_buyer then raise exception 'H5: la réception n''est pas attribuée à l''acheteur'; end if;
  if (select auto_received from zabelie_fulfillment where order_id = v_o1) then raise exception 'H5: marquée « automatique »'; end if;
  if (select shipped_at from zabelie_fulfillment where order_id = v_o1) is null then raise exception 'H5: remise en main propre sans date de remise'; end if;
  if (select status::text from orders where id = v_o1) <> 'delivered' then raise exception 'H5: la commande n''atteint pas delivered'; end if;
  select gated_on_delivery, matures_at into v_gated, v_matures from escrow_entries where order_id = v_o1;
  if v_gated then raise exception 'H5: escrow encore verrouillé'; end if;
  if v_matures < now() + interval '6 days 23 hours' then
    raise exception 'H5: LE PLANCHER J+7 A ÉTÉ RABOTÉ (matures_at=%)', v_matures;
  end if;
  if (select confirmed_at from zabelie_handover_codes where order_id = v_o1) is null then raise exception 'H5: confirmed_at non posé'; end if;
  if (select count(*) from zabelie_fulfillment_notices where order_id = v_o1) <> 0 then raise exception 'H5: le code a créé des avis'; end if;
  -- Rien ne mûrit, aucun solde ne bouge : le code ne paie personne.
  if mature_wallets() <> 0 then raise exception 'H5: une entrée a mûri à la réception — le code a payé'; end if;
  select balance_htg, pending_htg into v_balance, v_pending from wallets where id = v_wallet;
  if v_balance <> 0 or v_pending <> 5400 then raise exception 'H5: soldes modifiés (dispo=%, attente=%)', v_balance, v_pending; end if;
  -- Rejeu = doublon.
  v_res := zabelie_handover_confirm(v_o1, v_seller, v_code);
  if not (v_res ->> 'duplicate')::boolean then raise exception 'H6: rejeu non signalé comme doublon'; end if;
  v_res := zabelie_handover_code_get(v_o1, v_buyer);
  if (v_res ->> 'ok')::boolean then raise exception 'H1: un code est encore délivré APRÈS la réception'; end if;

  -- ── H7 — depuis `shipped` ───────────────────────────────────────────────
  v_res := zabelie_handover_code_get(v_o2, v_buyer);
  v_code := v_res ->> 'code';
  v_res := zabelie_handover_confirm(v_o2, v_seller, v_code);
  if not (v_res ->> 'ok')::boolean then raise exception 'H7: le code ne clôt pas une commande déjà déclarée (%)', v_res; end if;
  if (select status::text from orders where id = v_o2) <> 'delivered' then raise exception 'H7: commande non delivered'; end if;

  -- ── H4 — le verrou : le plafond vient de la CONFIG ──────────────────────
  -- Nouvelle commande, plafond réduit à 2 : deux faux codes, puis même le bon est refusé.
  insert into orders (id, buyer_id, product_id, amount_htg, status)
  values ('00000000-0000-0000-0000-0000000c6324', v_buyer, '00000000-0000-0000-0000-0000000c6310', 2000, 'paid');
  insert into escrow_entries (order_id, wallet_id, amount_htg, matures_at)
  values ('00000000-0000-0000-0000-0000000c6324', v_wallet, 1800, now() + interval '7 days');
  perform zabelie_open_fulfillment('00000000-0000-0000-0000-0000000c6324');
  update zabelie_fulfillment_limits set value = 2 where key = 'handover_code_max_attempts';
  v_code := zabelie_handover_code_get('00000000-0000-0000-0000-0000000c6324', v_buyer) ->> 'code';
  v_wrong := lpad(((v_code::int + 1) % 1000000)::text, 6, '0');
  perform zabelie_handover_confirm('00000000-0000-0000-0000-0000000c6324', v_seller, v_wrong);
  v_res := zabelie_handover_confirm('00000000-0000-0000-0000-0000000c6324', v_seller, v_wrong);
  if (v_res ->> 'restantes')::int <> 0 then raise exception 'H4: le plafond de la config (2) n''est pas lu (%)', v_res; end if;
  v_res := zabelie_handover_confirm('00000000-0000-0000-0000-0000000c6324', v_seller, v_code);
  if (v_res ->> 'ok')::boolean or v_res ->> 'reason' <> 'verrouille' then raise exception 'H4: le BON code passe après le verrou (%)', v_res; end if;
  if (select status::text from zabelie_fulfillment where order_id = '00000000-0000-0000-0000-0000000c6324') <> 'awaiting_shipment' then raise exception 'H4: la commande a bougé sous verrou'; end if;
  -- L'acheteur garde la voie existante (après déclaration du vendeur).
  perform zabelie_declare_shipment('00000000-0000-0000-0000-0000000c6324', v_seller, 'déclarée');
  v_res := zabelie_mark_received('00000000-0000-0000-0000-0000000c6324', v_buyer);
  if not (v_res ->> 'ok')::boolean then raise exception 'H4: le verrou du code empêche la confirmation de l''acheteur (%)', v_res; end if;

  -- ── Identité comptable de 0033, après tout ça ───────────────────────────
  select coalesce(sum(amount_htg), 0) into v_ledger from wallet_transactions where wallet_id = v_wallet;
  select balance_htg, pending_htg into v_balance, v_pending from wallets where id = v_wallet;
  if v_ledger <> v_balance + v_pending then raise exception 'H5: identité 0033 rompue (ledger=%, dispo+attente=%)', v_ledger, v_balance + v_pending; end if;
  raise notice 'H1-H7 OK — code de remise : même transition que « J''ai reçu », plancher J+7 conservé, verrou, lecture acheteur seul';
end $$;

rollback;
