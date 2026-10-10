select zabelie_migration_garde('0136_zabelie_confidentialite_v3.sql');

-- ─────────────────────────────────────────────────────────────────────────────
-- CONFIDENTIALITE-V3 — huit tiers entrent au §6, et le §6 se coupe en deux.
--
-- POURQUOI UNE MIGRATION POUR UN PARAGRAPHE. Le relevé `docs/69` a mesuré HUIT
-- tiers appelés par le code, pas quatre ; aucun n'était déclaré. Resend reçoit
-- l'adresse e-mail, Reloadly le numéro du bénéficiaire, l'assistant d'achat la
-- phrase libre de l'acheteur, TypeSafe le message de support. Stripe et Kobara,
-- eux, ne reçoivent AUCUNE donnée personnelle de Zabelie — l'utilisateur saisit
-- chez eux — d'où une rubrique distincte, et le déplacement de MonCash avec eux
-- (⚖️ changement de qualification, à valider par le conseil).
-- `tests/account-legal-acceptance.test.ts` interdit de changer le texte sans
-- nouvelle version : un reçu `confidentialite-v1` atteste d'un document précis,
-- et réétiqueter ce document reviendrait à prêter à l'utilisateur une
-- acceptation qu'il n'a jamais donnée.
--
-- ⚠️ LA FENÊTRE DE DÉPLOIEMENT EST TRAITÉE, PAS IGNORÉE (docs/25 §7.2).
-- Le schéma part avant le code : entre l'application de cette migration et la
-- mise en ligne du build, les clients en vol déclarent encore `v1`. Les deux
-- fonctions acceptent donc `v1` ET `v2`, et **enregistrent exactement ce qui a
-- été déclaré** — jamais un reçu `v3` pour quelqu'un qui n'a lu que `v1`. Un
-- compte créé dans la fenêtre repart avec un reçu `v1` et passera par la
-- ré-acceptation comme les comptes existants : c'est correct, pas un oubli.
--
-- ⚠️ CE QUE CETTE MIGRATION COÛTE, ET IL FAUT LE SAVOIR AVANT DE L'APPLIQUER.
-- `ACCOUNT_LEGAL_VERSIONS` passe à `confidentialite-v3` côté application. Tout
-- compte existant perd donc `hasCurrentLegalAcceptance` et devra repasser une
-- fois par `/connexion?mode=legal` avant de payer, de déposer un KYC ou de
-- créer un produit. La surface existe et la RPC ci-dessous l'alimente — ce
-- n'est pas un mur, c'est un passage obligé, une fois.
-- Le moment est choisi : au 2026-09-06 (`docs/49`), 2 produits publiés et
-- 14 paiements tous échoués. Il n'y a presque personne à déranger ; dans six
-- mois avec de vrais vendeurs, la même opération coûte bien plus cher.
--
-- ⚠️ ORDRE OBLIGATOIRE : appliquer CETTE migration AVANT de fusionner le code
-- qui porte `CONFIDENTIALITE_VERSION = "confidentialite-v3"`. L'inverse
-- laisserait l'application exiger un reçu `v2` que la RPC ne sait pas écrire —
-- les utilisateurs ré-accepteraient en boucle sans jamais satisfaire la garde.
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
    -- `v1` reste accepté le temps du déploiement ; le reçu porte la version
    -- RÉELLEMENT déclarée, jamais celle que le serveur préférerait.
    if jsonb_typeof(v_legal) is distinct from 'object'
      or v_cgu is distinct from 'cgu-v1'
      or v_conf not in ('confidentialite-v1', 'confidentialite-v3')
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
  'Creates the safe profile (0045/0095) and captures an explicit initial legal declaration once in 0046 receipts (0133, 0136). The receipt carries the version actually declared; v1 stays accepted during the v2 rollout. Metadata edits cannot create or change receipts. Missing declarations are never backfilled.';

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
    or p_confidentialite_version not in ('confidentialite-v1', 'confidentialite-v3')
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
  'Records a new explicit current CGU acceptance and privacy-information acknowledgement by auth.uid only, under the version actually declared (v1 accepted during the v2 rollout). Atomic, append-only and idempotent. No historical inference, blanket data consent or certified signature (0133, 0136).';

-- Sondes : les ACL de 0133 sont intactes, et la fenêtre v1/v2 est bien ouverte
-- des DEUX côtés. Une migration qui n'aurait changé qu'une des deux fonctions
-- casserait soit l'inscription, soit la ré-acceptation — en silence.
do $$
begin
  if has_function_privilege('anon', 'public.zabelie_accept_account_legal(text,text,boolean,boolean)', 'execute')
    or not has_function_privilege('authenticated', 'public.zabelie_accept_account_legal(text,text,boolean,boolean)', 'execute')
    or has_function_privilege('authenticated', 'public.zabelie_handle_new_user()', 'execute') then
    raise exception '0136: self-only RPC or trigger ACL incorrect';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_zabelie_profile_on_signup'
    and tgrelid = 'auth.users'::regclass and tgfoid = 'public.zabelie_handle_new_user()'::regprocedure
    and not tgisinternal and tgenabled <> 'D') then
    raise exception '0136: initial receipt trigger missing or disabled';
  end if;
  if (select count(*) from pg_proc p
      where p.oid in ('public.zabelie_handle_new_user()'::regprocedure,
                      'public.zabelie_accept_account_legal(text,text,boolean,boolean)'::regprocedure)
        and p.prosrc like '%confidentialite-v3%') <> 2 then
    raise exception '0136: confidentialite-v3 absente d''une des deux fonctions';
  end if;
  -- La contrainte de 0133 accepte déjà confidentialite-vN ; on le VÉRIFIE
  -- plutôt que de le supposer, sans quoi l'insert échouerait à la première
  -- ré-acceptation réelle.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.zabelie_policy_acceptances'::regclass
      and conname = 'zabelie_policy_acceptances_policy_version_check'
      and pg_get_constraintdef(oid) like '%confidentialite-v[0-9]+%') then
    raise exception '0136: la contrainte de version ne couvre pas confidentialite-vN';
  end if;
end $$;
