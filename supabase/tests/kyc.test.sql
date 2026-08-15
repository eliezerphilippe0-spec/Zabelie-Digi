-- Tests du KYC vendeur (0079). Transaction annulée à la fin.
--
--   K1. Connu-POSITIF : le blocage est DORMANT — retrait possible sans KYC.
--   K2. Blocage ARMÉ : sans dossier → kyc_requis ; pending → kyc_requis ;
--       approved → le retrait passe. Le recouvrement du surplus IA (0072)
--       fonctionne toujours dans le même geste.
--   K3. La décision est complète ou absente (contrainte) ; RLS own-row.
--   K4. La purge ne prend QUE les documents décidés depuis > retention_jours.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000120001', 'k.vandè@test.local'),
  ('00000000-0000-0000-0000-000000120002', 'k.lòt@test.local');
insert into profiles (id, display_name) values
  ('00000000-0000-0000-0000-000000120001', 'Vandè KYC'),
  ('00000000-0000-0000-0000-000000120002', 'Lòt Moun K')
on conflict (id) do nothing;

insert into wallets (id, owner_id, balance_htg) values
  ('00000000-0000-0000-0000-000000130001', '00000000-0000-0000-0000-000000120001', 20000);
insert into wallet_transactions (wallet_id, type, amount_htg, idempotency_key, reference)
values ('00000000-0000-0000-0000-000000130001', 'credit', 20000, 'seed:k1', 'seed');

-- ── K1 — dormant : le retrait passe sans dossier ────────────────────────────
do $$
declare v_res jsonb;
begin
  if (select requis_pour_retrait from zabelie_kyc_config) then
    raise exception 'K1 KO : le blocage ne devait pas être armé à l''application';
  end if;
  v_res := zabelie_request_payout('00000000-0000-0000-0000-000000120001', 1000);
  if not (v_res->>'ok')::boolean then
    raise exception 'K1 KO : retrait refusé alors que le KYC est dormant (%)', v_res;
  end if;
  raise notice 'K1 OK — blocage dormant, retrait possible';
end $$;

-- ── K2 — armé : les trois états du dossier ──────────────────────────────────
do $$
declare v_res jsonb; v_payout uuid;
begin
  -- On repart d'une ardoise propre : la demande de K1 est annulée.
  select id into v_payout from payouts
   where wallet_id = '00000000-0000-0000-0000-000000130001' and status = 'requested';
  perform zabelie_reject_payout(v_payout, 'test', '00000000-0000-0000-0000-000000120001');
  update payouts set created_at = now() - interval '48 hours' where id = v_payout;

  update zabelie_kyc_config set requis_pour_retrait = true;

  -- (a) aucun dossier
  v_res := zabelie_request_payout('00000000-0000-0000-0000-000000120001', 1000);
  if v_res->>'reason' <> 'kyc_requis' or v_res->>'kyc_statut' <> 'absent' then
    raise exception 'K2a KO : sans dossier, attendu kyc_requis/absent (%)', v_res;
  end if;

  -- (b) dossier en attente
  insert into zabelie_kyc_submissions (user_id) values ('00000000-0000-0000-0000-000000120001');
  v_res := zabelie_request_payout('00000000-0000-0000-0000-000000120001', 1000);
  if v_res->>'reason' <> 'kyc_requis' or v_res->>'kyc_statut' <> 'pending' then
    raise exception 'K2b KO : en attente, attendu kyc_requis/pending (%)', v_res;
  end if;

  -- (c) approuvé → le retrait passe, ET le surplus IA est recouvré (0072)
  insert into zabelie_ai_surplus (seller_id, prix_htg)
  values ('00000000-0000-0000-0000-000000120001', 5);
  update zabelie_kyc_submissions
     set status = 'approved', decided_at = now(),
         decided_by = '00000000-0000-0000-0000-000000120001'
   where user_id = '00000000-0000-0000-0000-000000120001';

  v_res := zabelie_request_payout('00000000-0000-0000-0000-000000120001', 1000);
  if not (v_res->>'ok')::boolean then
    raise exception 'K2c KO : dossier approuvé mais retrait refusé (%)', v_res;
  end if;
  if (v_res->>'frais_ia_regles_htg')::bigint <> 5 then
    raise exception 'K2c KO : le recouvrement de 0072 a été perdu (%)', v_res;
  end if;
  raise notice 'K2 OK — absent/pending refusés, approved passe, surplus toujours recouvré';
end $$;

-- ── K3 — décision complète, et RLS own-row ──────────────────────────────────
do $$
declare v_count int;
begin
  begin
    insert into zabelie_kyc_submissions (user_id, status)
    values ('00000000-0000-0000-0000-000000120002', 'approved');
    raise exception 'K3 KO : décision sans decided_at acceptée';
  exception when check_violation then null;
  end;

  insert into zabelie_kyc_submissions (user_id) values ('00000000-0000-0000-0000-000000120002');

  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000120001';
  select count(*) into v_count from zabelie_kyc_submissions;
  if v_count <> 1 then
    raise exception 'K3 KO : le vendeur voit % dossiers, attendu 1 (le sien)', v_count;
  end if;
  reset role;
  raise notice 'K3 OK — décision complète ou absente, lecture own-row';
end $$;

-- ── K4 — la purge ne prend que les documents décidés et expirés ─────────────
do $$
declare v_n int;
begin
  insert into zabelie_kyc_documents (user_id, kind, storage_path) values
    ('00000000-0000-0000-0000-000000120001', 'cin', 'u1/recent.jpg'),
    ('00000000-0000-0000-0000-000000120002', 'cin', 'u2/pending.jpg');

  -- u1 est décidé mais RÉCENT, u2 n'est pas décidé : aucun ne doit sortir.
  select count(*) into v_n from zabelie_kyc_docs_expires();
  if v_n <> 0 then
    raise exception 'K4a KO : % document(s) purgeable(s), attendu 0', v_n;
  end if;

  -- On vieillit la décision de u1 au-delà de la rétention.
  update zabelie_kyc_submissions
     set decided_at = now() - make_interval(days =>
           (select retention_jours from zabelie_kyc_config) + 1)
   where user_id = '00000000-0000-0000-0000-000000120001';

  select count(*) into v_n from zabelie_kyc_docs_expires();
  if v_n <> 1 then
    raise exception 'K4b KO : % document(s) purgeable(s), attendu 1', v_n;
  end if;

  select zabelie_purge_kyc_documents(array(select id from zabelie_kyc_docs_expires()))
    into v_n;
  if v_n <> 1 then
    raise exception 'K4c KO : % ligne(s) purgée(s), attendu 1', v_n;
  end if;
  if not exists (select 1 from zabelie_kyc_documents
                  where user_id = '00000000-0000-0000-0000-000000120002') then
    raise exception 'K4d KO : la purge a emporté un document non décidé';
  end if;
  raise notice 'K4 OK — purge bornée aux décidés expirés, les autres intacts';
end $$;

rollback;
