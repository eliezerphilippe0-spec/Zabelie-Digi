-- Tests Zabelie Business Vague 1 (0022) — garde-fous money-path.
-- Usage : psql "$DATABASE_URL" -f supabase/tests/business_v1.test.sql
--
-- Couvre :
--   B1. Total recalculé SERVEUR (qty × unit_price) — jamais fourni par le client.
--   B2. Facture 'sent' non modifiable (upsert_item refusé).
--   B3. Confirmation idempotente — même clé → un seul paiement, un seul crédit.
--   B4. Montant falsifié : sur-paiement refusé.
--   B5. Paiement partiel → payé : statut, commission 10 %, net crédité au solde.
--   B6. Void interdit dès qu'un centime est encaissé.
--   B7. Portail token : renvoie une vue sûre ; 'draft' invisible ; token faux → null.
--   B8. Anti self-write : le rôle authenticated ne peut PAS confirmer un paiement.

begin;

-- ── Fixtures : un pro (avec profiles → wallet FK) + un client + une facture draft ──
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1'::uuid, 'pro@biz.test');

-- 0045 : le profil est désormais créé en base à l'inscription. Ces tests
-- veulent piloter la ligne eux-mêmes (rôle, tier) et éprouver le chemin
-- INSERT de `protect_profile_privileges` — on retire donc la ligne
-- auto-créée plutôt que de basculer en UPDATE, qui ne teste pas la même
-- chose.
delete from profiles where id in (select id from auth.users);
insert into profiles (id, role, display_name) values
  ('00000000-0000-0000-0000-0000000000b1'::uuid, 'creator', 'Marie Pro');

insert into zabelie_biz_professionals (id, user_id, display_name, slug) values
  ('00000000-0000-0000-0000-000000000b10'::uuid,
   '00000000-0000-0000-0000-0000000000b1'::uuid, 'Marie Pro', 'marie-pro');

insert into zabelie_biz_clients (id, professional_id, name, phone) values
  ('00000000-0000-0000-0000-000000000b20'::uuid,
   '00000000-0000-0000-0000-000000000b10'::uuid, 'Client X', '50931000000');

insert into zabelie_biz_invoices (id, professional_id, client_id, public_token) values
  ('00000000-0000-0000-0000-000000000b30'::uuid,
   '00000000-0000-0000-0000-000000000b10'::uuid,
   '00000000-0000-0000-0000-000000000b20'::uuid, 'tok_marie_x');

do $$
declare
  v_inv    uuid := '00000000-0000-0000-0000-000000000b30';
  v_pro    uuid := '00000000-0000-0000-0000-000000000b10';
  v_user   uuid := '00000000-0000-0000-0000-0000000000b1';
  v_item   uuid;
  v_total  bigint;
  v_status zabelie_biz_invoice_status;
  v_num    text;
  v_bal    bigint;
  v_wallet uuid;
  v_pay1   zabelie_biz_payments;
  v_pay2   zabelie_biz_payments;
  v_cnt    integer;
  v_portal jsonb;
begin
  -- B1 : total recalculé serveur. 2×150 + 1×200 = 500 (jamais fourni par l'appel).
  v_item := zabelie_biz_upsert_item(v_inv, 'Logo', 2, 150);
  perform zabelie_biz_upsert_item(v_inv, 'Carte visite', 1, 200);
  select total_htg into v_total from zabelie_biz_invoices where id = v_inv;
  assert v_total = 500, format('B1: total serveur attendu 500, obtenu %s', v_total);
  -- Correction d'une ligne : 2×150 → 3×150 = 450 ; total 450+200 = 650.
  perform zabelie_biz_upsert_item(v_inv, 'Logo', 3, 150, v_item);
  select total_htg into v_total from zabelie_biz_invoices where id = v_inv;
  assert v_total = 650, format('B1: total après maj attendu 650, obtenu %s', v_total);

  -- B7a : token — une facture 'draft' n'est PAS visible au portail public.
  assert zabelie_biz_get_invoice_by_token('tok_marie_x') is null,
    'B7: une facture draft ne doit pas être exposée par token';

  -- Envoi : draft → sent, numéro lisible généré.
  perform zabelie_biz_send_invoice(v_inv);
  select status, invoice_number into v_status, v_num
    from zabelie_biz_invoices where id = v_inv;
  assert v_status = 'sent', format('envoi: statut attendu sent, obtenu %s', v_status);
  assert v_num = 'FCT-000001', format('envoi: numéro attendu FCT-000001, obtenu %s', v_num);

  -- B2 : facture envoyée non modifiable.
  begin
    perform zabelie_biz_upsert_item(v_inv, 'Extra', 1, 100);
    raise exception 'B2: modifier une facture sent aurait dû échouer';
  exception when others then
    if sqlerrm like 'B2:%' then raise; end if;
  end;

  -- B4 : sur-paiement refusé (total dû = 650).
  begin
    perform zabelie_biz_confirm_invoice_payment(
      v_inv, 'moncash', 'REF-OVER', 700, 'biz_pay:over');
    raise exception 'B4: un sur-paiement aurait dû être refusé';
  exception when others then
    if sqlerrm like 'B4:%' then raise; end if;
  end;

  -- B5 : paiement partiel (400 sur 650). Commission 10 % = 40, net = 360.
  v_pay1 := zabelie_biz_confirm_invoice_payment(
    v_inv, 'moncash', 'REF-1', 400, 'biz_pay:1');
  assert v_pay1.commission_htg = 40,
    format('B5: commission attendue 40, obtenue %s', v_pay1.commission_htg);
  assert v_pay1.net_htg = 360,
    format('B5: net attendu 360, obtenu %s', v_pay1.net_htg);
  select status into v_status from zabelie_biz_invoices where id = v_inv;
  assert v_status = 'partially_paid',
    format('B5: statut attendu partially_paid, obtenu %s', v_status);
  select id, balance_htg into v_wallet, v_bal from wallets where owner_id = v_user;
  assert v_bal = 360, format('B5: solde après 1er versement attendu 360, obtenu %s', v_bal);

  -- B3 : idempotence — rejouer la MÊME clé ne recrédite pas.
  v_pay2 := zabelie_biz_confirm_invoice_payment(
    v_inv, 'moncash', 'REF-1', 400, 'biz_pay:1');
  assert v_pay2.id = v_pay1.id, 'B3: le rejeu doit renvoyer le paiement existant';
  select count(*) into v_cnt from zabelie_biz_payments where invoice_id = v_inv;
  assert v_cnt = 1, format('B3: un seul paiement attendu, obtenu %s', v_cnt);
  select balance_htg into v_bal from wallets where owner_id = v_user;
  assert v_bal = 360, format('B3: solde inchangé attendu 360, obtenu %s', v_bal);
  select count(*) into v_cnt from wallet_transactions where wallet_id = v_wallet;
  assert v_cnt = 1, format('B3: une seule ligne au ledger attendue, obtenu %s', v_cnt);

  -- B6 : void interdit dès qu'un paiement est encaissé.
  begin
    perform zabelie_biz_void_invoice(v_inv);
    raise exception 'B6: annuler une facture déjà encaissée aurait dû échouer';
  exception when others then
    if sqlerrm like 'B6:%' then raise; end if;
  end;

  -- B5b : solde restant (250) → facture 'paid'. Commission 25, net 225.
  v_pay1 := zabelie_biz_confirm_invoice_payment(
    v_inv, 'moncash', 'REF-2', 250, 'biz_pay:2');
  assert v_pay1.commission_htg = 25,
    format('B5: 2e commission attendue 25, obtenue %s', v_pay1.commission_htg);
  select status, paid_htg into v_status, v_total from zabelie_biz_invoices where id = v_inv;
  assert v_status = 'paid', format('B5: statut final attendu paid, obtenu %s', v_status);
  assert v_total = 650, format('B5: paid_htg attendu 650, obtenu %s', v_total);
  select balance_htg into v_bal from wallets where owner_id = v_user;
  assert v_bal = 585, format('B5: solde final attendu 585 (360+225), obtenu %s', v_bal);

  -- B7b : portail token — vue sûre, montants exacts, pas d'ID interne.
  v_portal := zabelie_biz_get_invoice_by_token('tok_marie_x');
  assert v_portal is not null, 'B7: la facture envoyée doit être lisible par token';
  assert (v_portal->>'total_htg')::bigint = 650, 'B7: total du portail incohérent';
  assert (v_portal->>'paid_htg')::bigint = 650, 'B7: paid du portail incohérent';
  assert v_portal->>'invoice_number' = 'FCT-000001', 'B7: numéro du portail incohérent';
  assert v_portal ? 'items', 'B7: le portail doit exposer les lignes';
  assert not (v_portal ? 'client_id'), 'B7: le portail ne doit PAS exposer client_id';
  -- Token inexistant → null (jamais une autre facture).
  assert zabelie_biz_get_invoice_by_token('tok_inexistant') is null,
    'B7: un token inconnu doit renvoyer null';

  raise notice 'OK — B1 total serveur ; B2 sent immuable ; B3 idempotent ; B4 sur-paiement refusé ; B5 partiel→payé + commission 10%% ; B6 void interdit si payé ; B7 portail token sûr';
end $$;

-- B8 : anti self-write — un client authentifié ne DOIT PAS pouvoir confirmer un
-- paiement (sinon auto-crédit du wallet). REVOKE vérifié en direct.
do $$
declare v_denied boolean := false;
begin
  set local role authenticated;
  begin
    perform zabelie_biz_confirm_invoice_payment(
      '00000000-0000-0000-0000-000000000b30'::uuid,
      'moncash', 'HACK', 100, 'biz_pay:hack');
  exception when insufficient_privilege then
    v_denied := true;
  end;
  reset role;
  assert v_denied,
    'B8: authenticated a pu exécuter confirm_invoice_payment — REVOKE manquant !';
  raise notice 'OK — B8 confirm_invoice_payment refusé au rôle authenticated (anti auto-crédit)';
end $$;

rollback;
