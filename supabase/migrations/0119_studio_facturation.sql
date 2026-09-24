select zabelie_migration_garde('0119_studio_facturation.sql');

-- 0119 — Studio Créatif : images payantes au-delà du gratuit, prélevées au
-- prochain retrait du vendeur (docs/62 §10).
--
-- DÉCISION PORTEUR, 2026-09-24 : « oui déduction ». Même rail que le surplus
-- IA (docs/34, 0071/0072) : aucun nouveau moyen de paiement, AUCUN solde
-- prépayé (Circulaire 121). Chaque image payante devient une ligne de
-- `zabelie_ai_surplus`, que `zabelie_request_payout` (0079) somme et prélève
-- déjà, quel que soit son motif. Le retrait n'est donc PAS modifié.
--
-- ─── TROIS RÈGLES, GARDÉES EN BASE ─────────────────────────────────────────
-- 1. Consentement au prix EXACT : au-delà du gratuit, la génération n'est
--    inscrite que si elle porte le prix de la configuration AU MOMENT de
--    l'inscription. Un prix consenti périmé est refusé, jamais ajusté.
-- 2. On ne paie que ce qui est LIVRÉ : la dette naît avec l'événement
--    `completed`, dans la même transaction. Un échec ne coûte rien.
-- 3. Une image n'est facturée qu'UNE fois : un seul `completed` par
--    génération (0118), et un index unique sur la référence de la dette.
--
-- Paramètres commerciaux en table (règle dure n°3), modifiables sans code :
-- 3 gratuites par jour, puis 10 HTG ; plafond 20 par vendeur ; 200 pour la
-- plateforme (coût Higgsfield borné à ≈ 2 $/jour, docs/65 §2).
--
-- ⚠️ Prérequis : `0071` et `0118` appliquées. Sans elles, cette migration
-- échoue — c'est voulu.
-- ⚠️ Avant l'allumage : la ligne CGU du service payant (docs/34 §3).

-- ── Configuration ──────────────────────────────────────────────────────────
alter table public.zabelie_studio_config
  add column gratuit_jour integer not null default 3 check (gratuit_jour between 0 and 50),
  add column prix_image_htg integer not null default 10 check (prix_image_htg between 0 and 1000);
-- `quota_vendeur_jour` devient le PLAFOND, gratuites comprises.
update public.zabelie_studio_config set quota_vendeur_jour = 20, quota_global_jour = 200, updated_at = now();

-- ── Le prix consenti, figé sur la génération ───────────────────────────────
alter table public.zabelie_creative_generations
  add column prix_htg integer not null default 0 check (prix_htg between 0 and 1000);

-- ── Le registre de dette : un motif, et une référence ──────────────────────
alter table public.zabelie_ai_surplus
  add column motif text not null default 'ia_description'
    check (motif in ('ia_description', 'studio_image')),
  add column objet_ref uuid,
  add constraint zabelie_ai_surplus_objet
    check ((motif = 'studio_image') = (objet_ref is not null));
create unique index zabelie_ai_surplus_studio_une_fois
  on public.zabelie_ai_surplus (objet_ref) where motif = 'studio_image';

-- Le garde ZB071 protège aussi les deux nouvelles colonnes.
create or replace function public.zabelie_ai_surplus_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'ZB071: registre de surplus append-only — suppression interdite';
  end if;
  if new.seller_id <> old.seller_id
     or new.prix_htg <> old.prix_htg
     or new.created_at <> old.created_at
     or new.id <> old.id
     or new.motif <> old.motif
     or new.objet_ref is distinct from old.objet_ref then
    raise exception 'ZB071: une ligne de surplus ne se réécrit pas';
  end if;
  if old.settled_at is not null then
    raise exception 'ZB071: règlement déjà posé — définitif';
  end if;
  if new.settled_at is null then
    raise exception 'ZB071: seul le règlement (null → valeur) est une mutation permise';
  end if;
  return new;
end;
$$;

-- ── Quotas + prix, à l'inscription ─────────────────────────────────────────
create or replace function public.zabelie_creative_quota() returns trigger
language plpgsql set search_path = public as $$
declare
  v_cfg zabelie_studio_config%rowtype;
  v_debut timestamptz := date_trunc('day', now() at time zone 'America/Port-au-Prince')
                           at time zone 'America/Port-au-Prince';
  v_vendeur integer;
  v_global integer;
begin
  perform pg_advisory_xact_lock(hashtext('zabelie_creative_quota'));
  if exists (select 1 from zabelie_creative_generations
              where seller_id = new.seller_id and idempotency_key = new.idempotency_key) then
    return new;
  end if;
  select * into v_cfg from zabelie_studio_config where id;
  if not found then
    raise exception 'studio_config_absente' using errcode = 'P0001';
  end if;
  select count(*) into v_vendeur from zabelie_creative_generations
   where seller_id = new.seller_id and created_at >= v_debut;
  if v_vendeur >= v_cfg.quota_vendeur_jour then
    raise exception 'studio_quota_vendeur' using errcode = 'P0001';
  end if;
  select count(*) into v_global from zabelie_creative_generations where created_at >= v_debut;
  if v_global >= v_cfg.quota_global_jour then
    raise exception 'studio_quota_global' using errcode = 'P0001';
  end if;
  if v_vendeur < v_cfg.gratuit_jour then
    -- Gratuite : jamais facturée, même si un prix a été consenti.
    new.prix_htg := 0;
  elsif new.prix_htg is distinct from v_cfg.prix_image_htg then
    -- Pas de consentement, ou consentement à un autre prix : refus explicite.
    raise exception 'studio_paiement_requis' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ── Transitions + facturation à la livraison ───────────────────────────────
create or replace function public.zabelie_creative_transition() returns trigger
language plpgsql set search_path = public as $$
declare
  v_seller uuid;
  v_prix integer;
begin
  if new.etat = 'completed' and not exists (
       select 1 from zabelie_creative_events where generation_id = new.generation_id and etat = 'generating') then
    raise exception 'studio_transition_interdite' using errcode = 'P0001';
  end if;
  if new.etat = 'generating' and exists (
       select 1 from zabelie_creative_events where generation_id = new.generation_id and etat in ('completed', 'failed')) then
    raise exception 'studio_transition_interdite' using errcode = 'P0001';
  end if;
  if new.etat = 'completed' then
    select seller_id, prix_htg into v_seller, v_prix
      from zabelie_creative_generations where id = new.generation_id;
    if v_prix > 0 then
      -- Même transaction que l'événement : pas de livraison sans dette, pas
      -- de dette sans livraison.
      insert into zabelie_ai_surplus (seller_id, prix_htg, motif, objet_ref)
      values (v_seller, v_prix, 'studio_image', new.generation_id);
    end if;
  end if;
  return new;
end $$;
