select zabelie_migration_garde('0167_zabelie_confidentialite_v5.sql');

-- ─────────────────────────────────────────────────────────────────────────────
-- CONFIDENTIALITE-V5 — l'essayage virtuel entre dans la politique.
--
-- POURQUOI. Instruction directe du porteur (2026-10-29) : « Active la salle
-- d'essayage », avec Genlook pour fournisseur. La photo de l'acheteur part chez
-- un prestataire d'essayage (`lib/essayage/fournisseurs/genlook.ts`, `fashn.ts`) :
-- un tiers appelé par le code doit être nommé au §6
-- (`tests/politique-confidentialite.test.ts`), et docs/74 §13 l'exigeait déjà
-- « dans le consentement et dans /confidentialite ». Le texte de la politique est
-- empreint (`tests/account-legal-acceptance.test.ts`) : le changer sous
-- l'étiquette `confidentialite-v4` prêterait aux comptes une lecture qu'ils n'ont
-- pas faite. D'où une nouvelle version — même méthode que 0136 et 0160.
--
-- ⚠️ LA FENÊTRE DE DÉPLOIEMENT EST TRAITÉE (docs/25 §7.2). Le schéma part avant
-- le code : les deux fonctions acceptent `v1`, `v3`, `v4` ET `v5`, et enregistrent
-- exactement ce qui a été déclaré — jamais un reçu `v5` pour qui n'a lu que `v4`.
--
-- ⚠️ CE QUE ÇA COÛTE. Chaque compte existant repasse UNE fois par
-- `/connexion?mode=legal` avant de payer, de déposer un KYC ou de créer un
-- produit (5 profils au 2026-10-29).
--
-- ⚠️ ORDRE OBLIGATOIRE : appliquer CETTE migration AVANT de fusionner le code
-- qui porte `CONFIDENTIALITE_VERSION = "confidentialite-v5"`. Et l'interrupteur
-- de l'essayage (`ZABELIE_ESSAYAGE_ENABLED`) ne s'allume qu'APRÈS la mise en
-- ligne de ce texte.
-- ─────────────────────────────────────────────────────────────────────────────

-- Déclaration initiale, dans la transaction Auth. Identique à 0133 hors
-- l'ensemble des versions acceptées : aucun backfill, aucun reçu fictif.
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
    -- `v1`, `v3` et `v4` restent acceptés le temps du déploiement ; le reçu porte
    -- la version RÉELLEMENT déclarée, jamais celle que le serveur préférerait.
    if jsonb_typeof(v_legal) is distinct from 'object'
      or v_cgu is distinct from 'cgu-v1'
      or v_conf not in ('confidentialite-v1', 'confidentialite-v3', 'confidentialite-v4', 'confidentialite-v5')
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
  'Creates the safe profile (0045/0095) and captures an explicit initial legal declaration once in 0046 receipts (0133, 0136, 0160, 0167). The receipt carries the version actually declared; v1, v3 and v4 stay accepted during the v5 rollout. Metadata edits cannot create or change receipts. Missing declarations are never backfilled.';

-- Ré-acceptation explicite par un compte existant, ou première session OAuth.
-- Aucun identifiant en argument : l'appelant n'atteste que pour lui-même.
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
    or p_confidentialite_version not in ('confidentialite-v1', 'confidentialite-v3', 'confidentialite-v4', 'confidentialite-v5')
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
  'Records a new explicit current CGU acceptance and privacy-information acknowledgement by auth.uid only, under the version actually declared (v1, v3 and v4 accepted during the v5 rollout). Atomic, append-only and idempotent. No historical inference, blanket data consent or certified signature (0133, 0136, 0160, 0167).';

-- Sondes : les ACL de 0133 sont intactes, et la fenêtre v1/v3/v4/v5 est bien ouverte
-- des DEUX côtés. Une migration qui n'aurait changé qu'une des deux fonctions
-- casserait soit l'inscription, soit la ré-acceptation — en silence.
do $$
begin
  if has_function_privilege('anon', 'public.zabelie_accept_account_legal(text,text,boolean,boolean)', 'execute')
    or not has_function_privilege('authenticated', 'public.zabelie_accept_account_legal(text,text,boolean,boolean)', 'execute')
    or has_function_privilege('authenticated', 'public.zabelie_handle_new_user()', 'execute') then
    raise exception '0167: self-only RPC or trigger ACL incorrect';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_zabelie_profile_on_signup'
    and tgrelid = 'auth.users'::regclass and tgfoid = 'public.zabelie_handle_new_user()'::regprocedure
    and not tgisinternal and tgenabled <> 'D') then
    raise exception '0167: initial receipt trigger missing or disabled';
  end if;
  -- Les QUATRE versions vivantes, dans CHACUNE des deux fonctions : la présence
  -- d'une sous-chaîne dans le fichier ne prouve rien sur l'endroit qui décide.
  if (select count(*) from pg_proc p
      where p.oid in ('public.zabelie_handle_new_user()'::regprocedure,
                      'public.zabelie_accept_account_legal(text,text,boolean,boolean)'::regprocedure)
        and p.prosrc like '%''confidentialite-v1''%'
        and p.prosrc like '%''confidentialite-v3''%'
        and p.prosrc like '%''confidentialite-v4''%'
        and p.prosrc like '%''confidentialite-v5''%') <> 2 then
    raise exception '0167: une des quatre versions manque dans une des deux fonctions';
  end if;
  -- La contrainte de 0133 accepte déjà confidentialite-vN ; on le VÉRIFIE
  -- plutôt que de le supposer.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.zabelie_policy_acceptances'::regclass
      and conname = 'zabelie_policy_acceptances_policy_version_check'
      and pg_get_constraintdef(oid) like '%confidentialite-v[0-9]+%') then
    raise exception '0167: la contrainte de version ne couvre pas confidentialite-vN';
  end if;
end $$;
