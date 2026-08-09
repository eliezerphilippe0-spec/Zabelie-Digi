-- Tests de la config commissions (0054). Transaction annulée. ON_ERROR_STOP.
--
--   C1. Seed : 10 % standard / 6 % Elite — les valeurs historiques, à
--       l'identique. La migration change le LIEU du taux, pas le taux.
--   C2. Un UPDATE du taux change le calcul RÉEL : confirm_payment facture au
--       nouveau taux, floor compris (D-4), et platform_earnings le journalise.
--   C3. Fat-finger : un taux hors borne (> 30 %) échoue à l'ÉCRITURE.
--   C4. Un taux ne se supprime pas (trigger) — config = UPDATE seulement.
--   C5. REPLI : ligne de config absente (trigger désactivé pour simuler un
--       palier ajouté à l'énumération sans sa ligne) → taux HISTORIQUE,
--       jamais zéro. Un oubli de config ne peut pas offrir 0 % de commission.
--   C6. Rejeu de migration : le seed `on conflict do nothing` n'écrase pas
--       un taux modifié en exploitation.

begin;

insert into auth.users (id, email)
  values ('00000000-0000-0000-0000-0000000c0001', 'cc.vendeur@test.local');

-- 0045 : profil auto-créé à l'inscription — on pilote la ligne nous-mêmes.
delete from profiles where id in (select id from auth.users);
insert into profiles (id, role, display_name)
  values ('00000000-0000-0000-0000-0000000c0001', 'creator', 'Vendeur CC');
insert into products (id, seller_id, slug, title, kind, price_htg, status)
  values ('00000000-0000-0000-0000-0000000c0010',
          '00000000-0000-0000-0000-0000000c0001',
          'cc-p', 'CC P', 'fichier', 999, 'published');

do $$
declare
  v_rate  integer;
  v_comm  bigint;
  v_bal   bigint;
begin
  -- ── C1 — seed aux valeurs historiques ────────────────────────────────────
  if commission_rate_bps('standard') <> 1000 then
    raise exception 'C1: taux standard attendu 1000, obtenu %', commission_rate_bps('standard');
  end if;
  if commission_rate_bps('elite') <> 600 then
    raise exception 'C1: taux elite attendu 600, obtenu %', commission_rate_bps('elite');
  end if;

  -- ── C2 — l'UPDATE change le calcul réel, pas seulement une ligne ─────────
  update zabelie_commission_config set rate_bps = 1200 where tier = 'standard';

  insert into orders (id, buyer_id, product_id, amount_htg, status)
    values ('00000000-0000-0000-0000-0000000c0020',
            '00000000-0000-0000-0000-0000000c0001',
            '00000000-0000-0000-0000-0000000c0010', 999, 'pending');
  insert into payments (order_id, rail, idempotency_key, status)
    values ('00000000-0000-0000-0000-0000000c0020', 'moncash', 'cc-k1', 'pending');
  perform confirm_payment('cc-k1', 'CC-TX1', '{}'::jsonb, 999, null);

  select commission_htg, rate_bps into v_comm, v_rate
    from platform_earnings
   where order_id = '00000000-0000-0000-0000-0000000c0020';
  if v_rate <> 1200 then
    raise exception 'C2: confirm_payment a facturé au taux % — la config n''est pas lue', v_rate;
  end if;
  -- floor(999 × 1200 / 10000) = floor(119,88) = 119 : l'arrondi va au vendeur (D-4).
  if v_comm <> 119 then
    raise exception 'C2: commission attendue 119 (floor), obtenue %', v_comm;
  end if;
  select pending_htg into v_bal from wallets
   where owner_id = '00000000-0000-0000-0000-0000000c0001';
  if v_bal <> 999 - 119 then
    raise exception 'C2: net vendeur attendu 880, obtenu %', v_bal;
  end if;

  -- ── C3 — fat-finger bloqué à l'écriture ──────────────────────────────────
  begin
    update zabelie_commission_config set rate_bps = 5000 where tier = 'standard';
    raise exception 'C3: un taux de 50 %% a été accepté — la borne ne protège rien';
  exception
    when check_violation then null; -- attendu
  end;

  -- ── C4 — un taux ne se supprime pas ──────────────────────────────────────
  begin
    delete from zabelie_commission_config where tier = 'elite';
    raise exception 'C4: DELETE accepté — le repli silencieux redevient possible';
  exception
    when raise_exception then
      if sqlerrm not like '%ne se supprime pas%' then raise; end if;
  end;

  -- ── C5 — repli : palier sans ligne de config → taux HISTORIQUE, pas 0 ────
  -- On simule le seul cas légitime d'absence (valeur d'énumération ajoutée
  -- avant sa ligne) en désactivant le garde le temps du test.
  alter table zabelie_commission_config disable trigger zabelie_commission_config_nodelete;
  delete from zabelie_commission_config where tier = 'elite';
  alter table zabelie_commission_config enable trigger zabelie_commission_config_nodelete;

  select commission_rate_bps('elite') into v_rate;
  if v_rate is null or v_rate = 0 then
    raise exception 'C5: ligne absente → taux % — un oubli de config offre la commission', coalesce(v_rate::text, 'NULL');
  end if;
  if v_rate <> 600 then
    raise exception 'C5: repli attendu 600 (historique 0005), obtenu %', v_rate;
  end if;

  -- ── C6 — le rejeu du seed n'écrase pas l'exploitation ────────────────────
  -- `standard` vaut 1200 depuis C2. On rejoue l'insert du seed.
  insert into zabelie_commission_config (tier, rate_bps, comment) values
    ('standard', 1000, 'rejeu'), ('elite', 600, 'rejeu')
  on conflict (tier) do nothing;
  if commission_rate_bps('standard') <> 1200 then
    raise exception 'C6: le rejeu de migration a ÉCRASÉ un taux exploité (obtenu %)',
      commission_rate_bps('standard');
  end if;

  raise notice 'OK — C1 seed historique · C2 la config pilote le calcul réel (floor compris) · C3 borne · C4 pas de DELETE · C5 repli historique jamais zéro · C6 rejeu inoffensif';
end $$;

rollback;
