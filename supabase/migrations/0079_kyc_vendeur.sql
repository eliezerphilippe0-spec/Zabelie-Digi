select zabelie_migration_garde('0079_kyc_vendeur.sql');

-- ============================================================================
-- 0079 — KYC VENDEUR : vérification manuelle, et le retrait qu'elle garde
-- ============================================================================
-- Arbitrages porteur du 2026-08-15 : « bloque le retrait », « CIN ou
-- passeport ». Spec : docs/35 V-6.
--
-- ─── CE QU'ON NE CONSTRUIT PAS, ET POURQUOI ────────────────────────────────
-- « Un système d'authentification haïtien » n'existe pas : aucune API publique
-- ne vérifie une CIN ou un NIF haïtien (checklist docs/03 §9, étape 0
-- éliminatoire — on ne code pas un rail dont l'API n'existe pas). La
-- vérification est donc MANUELLE : le vendeur téléverse, un humain décide.
-- Le jour où une API existe, elle se branchera sur ce même schéma.
--
-- ─── LE BLOCAGE EST DORMANT À L'APPLICATION ────────────────────────────────
-- `requis_pour_retrait` vaut FALSE par défaut : appliquer cette migration ne
-- coupe le retrait de PERSONNE. Le porteur l'active par UPDATE quand les
-- vendeurs ont eu le temps de se faire vérifier. Le contraire — bloquer tout
-- le monde à l'instant de l'application — serait une coupure de la voie de
-- sortie, c'est-à-dire exactement ce que le dossier BRH (docs/17) reproche.
--
-- ─── LES IMAGES SONT DES PIÈCES D'IDENTITÉ ─────────────────────────────────
-- Bucket PRIVÉ, aucune policy : service-role uniquement, jamais d'URL
-- publique — l'admin les consulte par URL signée à courte durée. Rétention
-- bornée (défaut 90 jours après décision) et purgée par cron : une pièce
-- d'identité gardée « au cas où » est une fuite qui attend son incident.
-- ⚠️ La DURÉE est un défaut prudent, pas une décision porteur : elle est en
-- table de config, modifiable par UPDATE, et inscrite au registre comme
-- restant à confirmer.
-- ============================================================================

-- ── 1. Configuration (ligne unique, règle dure n°3) ─────────────────────────
create table zabelie_kyc_config (
  id                  boolean primary key default true check (id),
  -- FALSE à l'application : personne n'est coupé. Le porteur allume.
  requis_pour_retrait boolean not null default false,
  -- Deux pièces avec photo (demande porteur). Voir la note d'usage de
  -- `zabelie_kyc_documents.kind` sur ce que « deux » veut dire ici.
  docs_requis         integer not null default 2 check (docs_requis between 1 and 4),
  retention_jours     integer not null default 90 check (retention_jours between 1 and 3650),
  updated_at          timestamptz not null default now()
);
insert into zabelie_kyc_config default values;

alter table zabelie_kyc_config enable row level security;

comment on table zabelie_kyc_config is
  'Paramètres du KYC vendeur (docs/35 V-6). requis_pour_retrait = FALSE à l''application : le blocage s''allume par UPDATE, jamais par la migration. retention_jours : défaut prudent 90, À CONFIRMER par le porteur.';

-- ── 2. La soumission : une par vendeur, décidée une fois ────────────────────
create table zabelie_kyc_submissions (
  user_id      uuid primary key references profiles(id) on delete cascade,
  status       text not null default 'pending'
               check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid references profiles(id),
  note_admin   text check (note_admin is null or char_length(btrim(note_admin)) between 1 and 500),
  constraint zabelie_kyc_decision_complete
    check ((status = 'pending') = (decided_at is null))
);

comment on table zabelie_kyc_submissions is
  'Dossier KYC d''un vendeur (docs/35 V-6) — vérification MANUELLE : aucune API publique haïtienne n''existe (docs/03 §9). Décision par service-role, journalisée dans zabelie_admin_actions par la route.';

-- ── 3. Les documents : bucket PRIVÉ, chemin nommé par le serveur ────────────
create table zabelie_kyc_documents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  -- Arbitrage porteur : CIN ou passeport. `selfie` complète la paire quand le
  -- vendeur ne possède qu'une seule pièce — cas majoritaire sur ce marché, le
  -- passeport y étant peu répandu. Énumération fermée : un type de pièce se
  -- filtre et se compte, il ne se raconte pas.
  kind         text not null check (kind in ('cin', 'paspo', 'selfie')),
  storage_path text not null unique,
  created_at   timestamptz not null default now()
);
create index zabelie_kyc_documents_user_idx on zabelie_kyc_documents (user_id);

comment on table zabelie_kyc_documents is
  'Pièces d''identité téléversées (bucket PRIVÉ kyc-documents, aucune policy — service-role seul, URL signée pour l''admin). Purgées après retention_jours suivant la décision.';

-- Bucket privé. `public = false` est le point entier de cette ligne.
insert into storage.buckets (id, name, public)
values ('kyc-documents', 'kyc-documents', false)
on conflict (id) do nothing;

-- ── 4. RLS : le titulaire lit son dossier, personne d'autre ─────────────────
alter table zabelie_kyc_submissions enable row level security;
alter table zabelie_kyc_documents enable row level security;

create policy zabelie_kyc_sub_own_read on zabelie_kyc_submissions
  for select using (auth.uid() = user_id);
-- Métadonnées seulement : les IMAGES vivent dans un bucket sans policy.
create policy zabelie_kyc_doc_own_read on zabelie_kyc_documents
  for select using (auth.uid() = user_id);

-- ── 5. Le retrait gardé — TROISIÈME version de la fonction ──────────────────
-- Reprend INTÉGRALEMENT la version de `0072` (recouvrement du surplus IA) et
-- n'ajoute que la garde KYC. Réécrire une fonction d'argent de mémoire est le
-- défaut que ce dépôt a déjà payé : la base de départ a été relue en prod
-- avant d'écrire ces lignes.
create or replace function zabelie_request_payout(
  p_user_id    uuid,
  p_amount_htg bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet      uuid;
  v_balance     bigint;
  v_min         integer;
  v_max         integer;
  v_cooldown    integer;
  v_last        timestamptz;
  v_suspended   timestamptz;
  v_payout_id   uuid;
  v_surplus_due bigint;
  v_surplus_ids bigint[];
  v_kyc_requis  boolean;
  v_kyc_statut  text;
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

  select suspended_at into v_suspended from profiles where id = p_user_id;
  if v_suspended is not null then
    return jsonb_build_object('ok', false, 'reason', 'compte_suspendu');
  end if;

  -- ── LA GARDE KYC (0079) ───────────────────────────────────────────────────
  -- Dormante tant que `requis_pour_retrait` est false : à l'application,
  -- aucun vendeur n'est coupé. Le refus est EXPLICITE et porte le statut du
  -- dossier, pour que l'écran sache dire « en attente » plutôt que « refusé ».
  select requis_pour_retrait into v_kyc_requis from zabelie_kyc_config;
  if coalesce(v_kyc_requis, false) then
    select status into v_kyc_statut
      from zabelie_kyc_submissions where user_id = p_user_id;
    if v_kyc_statut is distinct from 'approved' then
      return jsonb_build_object('ok', false, 'reason', 'kyc_requis',
                                'kyc_statut', coalesce(v_kyc_statut, 'absent'));
    end if;
  end if;

  select id into v_wallet from wallets where owner_id = p_user_id;
  if v_wallet is null then
    return jsonb_build_object('ok', false, 'reason', 'portefeuille_absent');
  end if;

  select balance_htg into v_balance from wallets where id = v_wallet for update;

  if exists (select 1 from payouts
              where wallet_id = v_wallet and status in ('requested', 'processing')) then
    return jsonb_build_object('ok', false, 'reason', 'demande_en_cours');
  end if;

  select max(created_at) into v_last from payouts where wallet_id = v_wallet;
  if v_last is not null and v_last > now() - make_interval(hours => v_cooldown) then
    return jsonb_build_object('ok', false, 'reason', 'delai_non_ecoule',
                              'cooldown_hours', v_cooldown);
  end if;

  select coalesce(array_agg(s.id), '{}'), coalesce(sum(s.prix_htg), 0)
    into v_surplus_ids, v_surplus_due
    from (select id, prix_htg
            from zabelie_ai_surplus
           where seller_id = p_user_id and settled_at is null
             for update) s;

  if v_balance < p_amount_htg + v_surplus_due then
    return jsonb_build_object('ok', false, 'reason', 'solde_insuffisant',
                              'disponible_htg', greatest(v_balance - v_surplus_due, 0),
                              'frais_ia_htg', v_surplus_due);
  end if;

  insert into payouts (wallet_id, amount_htg, status)
  values (v_wallet, p_amount_htg, 'requested')
  returning id into v_payout_id;

  update wallets set balance_htg = balance_htg - p_amount_htg where id = v_wallet;
  insert into wallet_transactions
    (wallet_id, type, amount_htg, idempotency_key, reference)
  values
    (v_wallet, 'payout', -p_amount_htg, 'payout_req:' || v_payout_id,
     'Demande de retrait ' || left(v_payout_id::text, 8));

  if v_surplus_due > 0 then
    update wallets set balance_htg = balance_htg - v_surplus_due where id = v_wallet;
    insert into wallet_transactions
      (wallet_id, type, amount_htg, idempotency_key, reference)
    values
      (v_wallet, 'debit', -v_surplus_due, 'ai_surplus:' || v_payout_id,
       'Frais IA (' || array_length(v_surplus_ids, 1) || ' sijesyon) — retrait '
         || left(v_payout_id::text, 8));

    update zabelie_ai_surplus
       set settled_at = now(), settlement_ref = 'payout:' || v_payout_id
     where id = any(v_surplus_ids);
  end if;

  return jsonb_build_object('ok', true, 'payout_id', v_payout_id,
                            'balance_htg', v_balance - p_amount_htg - v_surplus_due,
                            'frais_ia_regles_htg', v_surplus_due);
end;
$$;
revoke all on function zabelie_request_payout(uuid, bigint)
  from public, anon, authenticated;

-- ── 6. Rétention : lister puis purger, en deux temps ────────────────────────
-- Deux fonctions parce que les OBJETS vivent au stockage et les LIGNES en
-- base : la route supprime les objets d'abord, les lignes ensuite. Si elle
-- échoue au milieu, le passage suivant reprend — l'inverse laisserait des
-- pièces d'identité au stockage sans plus aucune trace de leur existence.
create function zabelie_kyc_docs_expires()
returns table (id uuid, storage_path text)
language sql
security definer
set search_path = public
as $$
  select d.id, d.storage_path
    from zabelie_kyc_documents d
    join zabelie_kyc_submissions s on s.user_id = d.user_id
   where s.decided_at is not null
     and s.decided_at < now() - make_interval(
           days => (select retention_jours from zabelie_kyc_config))
   limit 500;
$$;
revoke all on function zabelie_kyc_docs_expires() from public, anon, authenticated;

create function zabelie_purge_kyc_documents(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  delete from zabelie_kyc_documents where id = any(coalesce(p_ids, '{}'));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function zabelie_purge_kyc_documents(uuid[])
  from public, anon, authenticated;

-- ── 7. Post-conditions ──────────────────────────────────────────────────────
do $$
begin
  if (select requis_pour_retrait from zabelie_kyc_config) then
    raise exception '0079: le blocage du retrait doit être DORMANT à l''application';
  end if;
  if not exists (select 1 from storage.buckets where id = 'kyc-documents' and not public) then
    raise exception '0079: le bucket kyc-documents doit exister et être PRIVÉ';
  end if;
  if exists (select 1 from pg_policies
              where schemaname = 'storage' and tablename = 'objects'
                and qual like '%kyc-documents%') then
    raise exception '0079: aucune policy ne doit ouvrir le bucket des pièces d''identité';
  end if;
  if position('zabelie_ai_surplus' in
       (select prosrc from pg_proc where proname = 'zabelie_request_payout'
         and pronamespace = 'public'::regnamespace)) = 0 then
    raise exception '0079: la réécriture a perdu le recouvrement du surplus (0072)';
  end if;
  if position('kyc_requis' in
       (select prosrc from pg_proc where proname = 'zabelie_request_payout'
         and pronamespace = 'public'::regnamespace)) = 0 then
    raise exception '0079: la garde KYC n''est pas en place';
  end if;
end $$;
