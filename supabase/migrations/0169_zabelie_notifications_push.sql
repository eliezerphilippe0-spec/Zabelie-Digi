select zabelie_migration_garde('0169_zabelie_notifications_push.sql');

-- ─────────────────────────────────────────────────────────────────────────────
-- 0169 — NOTIFICATIONS DE VENTE, PAGE FERMÉE (niveau 2) + CONFIDENTIALITE-V6.
--
-- POURQUOI. Décision du porteur le 2026-10-31 (« go niveau 2 ») : un vendeur
-- qui l'active reçoit une notification sur son appareil à chaque vente, même
-- quand Zabelie est fermée — l'équivalent web du « cha-ching » de Shopify.
-- Le porteur a validé les services de notification des navigateurs (Google,
-- Apple, Mozilla, Microsoft) et la mise à jour de la politique.
--
-- CE QUI EST STOCKÉ, ET RIEN DE PLUS. L'ADRESSE de notification de l'appareil
-- (une URL chez le service de son navigateur). Aucune clé de chiffrement :
-- la notification part SANS contenu, le service worker écrit lui-même le
-- texte — le service du navigateur ne voit passer qu'un signal vide.
--
-- ─── LA POLITIQUE ──────────────────────────────────────────────────────────
-- Le texte de la politique est empreint : ajouter un destinataire sous
-- l'étiquette `confidentialite-v5` prêterait aux comptes une lecture qu'ils
-- n'ont pas faite. D'où `v6` — même méthode que 0136, 0160 et 0167. Les deux
-- fonctions acceptent v1, v3, v4, v5 ET v6 le temps du déploiement, et
-- enregistrent exactement ce qui a été déclaré.
--
-- ⚠️ ORDRE OBLIGATOIRE : appliquer CETTE migration AVANT de fusionner le code
-- qui porte `CONFIDENTIALITE_VERSION = "confidentialite-v6"`.
-- ⚠️ CE QUE ÇA COÛTE : chaque compte existant repasse une fois par
-- `/connexion?mode=legal`.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── 1. Un appareil abonné, une ligne ────────────────────────────────────────
create table if not exists zabelie_push_abonnements (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  endpoint          text not null unique
                      check (endpoint ~ '^https://' and length(endpoint) <= 2048),
  cree_le           timestamptz not null default now(),
  derniere_reussite timestamptz,
  echecs            integer not null default 0 check (echecs >= 0)
);
create index if not exists zabelie_push_abonnements_user_idx on zabelie_push_abonnements (user_id);
alter table zabelie_push_abonnements enable row level security;
revoke all on zabelie_push_abonnements from public, anon, authenticated;
grant all on zabelie_push_abonnements to service_role;
comment on table zabelie_push_abonnements is
  'Adresse de notification d''un appareil dont l''utilisateur a active les notifications de vente (0169). Aucune cle de chiffrement : les notifications partent sans contenu. Aucun droit client : tout passe par /api/seller/push, apres verification de la session.';

-- ── 2. Une vente, un seul signal ────────────────────────────────────────────
-- `notifyOrderPaid` est rejoué (retour MonCash, webhook, réconciliation) : la
-- première insertion gagne, les suivantes ne renvoient rien.
create table if not exists zabelie_push_ventes (
  order_id   uuid primary key references orders(id) on delete cascade,
  signale_a  timestamptz not null default now(),
  appareils  integer not null default 0 check (appareils >= 0)
);
alter table zabelie_push_ventes enable row level security;
revoke all on zabelie_push_ventes from public, anon, authenticated;
grant all on zabelie_push_ventes to service_role;
comment on table zabelie_push_ventes is
  'Une ligne par vente signalee par notification (0169) : garde d''unicite contre les rejeux de notifyOrderPaid, et nombre d''appareils atteints. Aucun droit client.';

-- ── 3. confidentialite-v6 : déclaration initiale (identique à 0167 hors versions) ──
create or replace function public.zabelie_handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_legal jsonb;
  v_cgu text;
  v_conf text;
begin
  insert into public.profiles (id, display_name)
  values (new.id, public.zabelie_safe_display_name(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), '')
  ), new.email)) on conflict (id) do nothing;

  if new.raw_user_meta_data ? 'legal_acceptance' then
    v_legal := new.raw_user_meta_data -> 'legal_acceptance';
    v_cgu := v_legal ->> 'conditions_version';
    v_conf := v_legal ->> 'confidentialite_version';
    -- `v1`, `v3`, `v4` et `v5` restent acceptés le temps du déploiement ; le reçu
    -- porte la version RÉELLEMENT déclarée, jamais celle que le serveur préférerait.
    if jsonb_typeof(v_legal) is distinct from 'object'
      or v_cgu is distinct from 'cgu-v1'
      or v_conf not in ('confidentialite-v1', 'confidentialite-v3', 'confidentialite-v4', 'confidentialite-v5', 'confidentialite-v6')
      or v_legal -> 'conditions_accepted' is distinct from 'true'::jsonb
      or v_legal -> 'confidentialite_read' is distinct from 'true'::jsonb then
      raise exception 'Current terms acceptance and privacy acknowledgement required' using errcode = 'ZB133';
    end if;
    insert into public.zabelie_policy_acceptances (user_id, policy_version)
    values (new.id, v_cgu), (new.id, v_conf)
    on conflict (user_id, policy_version) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.zabelie_handle_new_user() from public, anon, authenticated;
comment on function public.zabelie_handle_new_user() is
  'Creates the safe profile (0045/0095) and captures an explicit initial legal declaration once in 0046 receipts (0133, 0136, 0160, 0167, 0169). The receipt carries the version actually declared; v1, v3, v4 and v5 stay accepted during the v6 rollout. Metadata edits cannot create or change receipts. Missing declarations are never backfilled.';

-- ── 4. confidentialite-v6 : ré-acceptation explicite (identique à 0167 hors versions) ──
create or replace function public.zabelie_accept_account_legal(
  p_conditions_version text,
  p_confidentialite_version text,
  p_conditions_accepted boolean,
  p_confidentialite_read boolean
)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_conditions_version is distinct from 'cgu-v1'
    or p_confidentialite_version not in ('confidentialite-v1', 'confidentialite-v3', 'confidentialite-v4', 'confidentialite-v5', 'confidentialite-v6')
    or p_conditions_accepted is distinct from true
    or p_confidentialite_read is distinct from true then
    raise exception 'Current terms acceptance and privacy acknowledgement required' using errcode = 'ZB133';
  end if;
  -- Hold the profile against a concurrent closure until the pair is recorded.
  perform 1 from public.profiles where id = v_user
    and suspended_at is null and suspended_reason is distinct from 'account_closed'
    for share;
  if not found then raise exception 'Active account required' using errcode = '42501'; end if;
  insert into public.zabelie_policy_acceptances (user_id, policy_version)
  values (v_user, p_conditions_version), (v_user, p_confidentialite_version)
  on conflict (user_id, policy_version) do nothing;
end;
$$;
revoke all on function public.zabelie_accept_account_legal(text,text,boolean,boolean) from public, anon, authenticated;
grant execute on function public.zabelie_accept_account_legal(text,text,boolean,boolean) to authenticated;
comment on function public.zabelie_accept_account_legal(text,text,boolean,boolean) is
  'Records a new explicit current CGU acceptance and privacy-information acknowledgement by auth.uid only, under the version actually declared (v1, v3, v4 and v5 accepted during the v6 rollout). Atomic, append-only and idempotent. No historical inference, blanket data consent or certified signature (0133, 0136, 0160, 0167, 0169).';

-- ── 5. Post-conditions ──────────────────────────────────────────────────────
do $$
declare
  v_t text;
begin
  -- Les deux tables : RLS active, AUCUN droit client, en lecture comme en écriture.
  foreach v_t in array array['zabelie_push_abonnements', 'zabelie_push_ventes'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || v_t)::regclass) then
      raise exception '0169: RLS inactive sur %', v_t;
    end if;
    if has_table_privilege('anon', 'public.' || v_t, 'SELECT') or has_table_privilege('authenticated', 'public.' || v_t, 'SELECT')
       or has_table_privilege('anon', 'public.' || v_t, 'INSERT') or has_table_privilege('authenticated', 'public.' || v_t, 'INSERT')
       or has_table_privilege('authenticated', 'public.' || v_t, 'DELETE') or has_table_privilege('authenticated', 'public.' || v_t, 'UPDATE') then
      raise exception '0169: un client garde un droit sur %', v_t;
    end if;
  end loop;

  -- ACL de 0133 intactes, et la fenêtre v1/v3/v4/v5/v6 ouverte des DEUX côtés.
  if has_function_privilege('anon', 'public.zabelie_accept_account_legal(text,text,boolean,boolean)', 'execute')
    or not has_function_privilege('authenticated', 'public.zabelie_accept_account_legal(text,text,boolean,boolean)', 'execute')
    or has_function_privilege('authenticated', 'public.zabelie_handle_new_user()', 'execute') then
    raise exception '0169: self-only RPC or trigger ACL incorrect';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_zabelie_profile_on_signup'
    and tgrelid = 'auth.users'::regclass and tgfoid = 'public.zabelie_handle_new_user()'::regprocedure
    and not tgisinternal and tgenabled <> 'D') then
    raise exception '0169: initial receipt trigger missing or disabled';
  end if;
  if (select count(*) from pg_proc p
      where p.oid in ('public.zabelie_handle_new_user()'::regprocedure,
                      'public.zabelie_accept_account_legal(text,text,boolean,boolean)'::regprocedure)
        and p.prosrc like '%''confidentialite-v1''%'
        and p.prosrc like '%''confidentialite-v3''%'
        and p.prosrc like '%''confidentialite-v4''%'
        and p.prosrc like '%''confidentialite-v5''%'
        and p.prosrc like '%''confidentialite-v6''%') <> 2 then
    raise exception '0169: une des cinq versions manque dans une des deux fonctions';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.zabelie_policy_acceptances'::regclass
      and conname = 'zabelie_policy_acceptances_policy_version_check'
      and pg_get_constraintdef(oid) like '%confidentialite-v[0-9]+%') then
    raise exception '0169: la contrainte de version ne couvre pas confidentialite-vN';
  end if;
  raise notice '0169 OK — abonnements push sans droit client, confidentialite-v6 ouverte';
end $$;

commit;
