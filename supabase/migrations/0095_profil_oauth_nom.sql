select zabelie_migration_garde('0095_profil_oauth_nom.sql');

-- ============================================================================
-- 0095 — Le profil d'un compte créé par Google/Microsoft porte son vrai nom
-- ============================================================================
-- V-19 (docs/02) ouvre la connexion par fournisseurs tiers. Un compte qui naît
-- par OAuth passe par le MÊME déclencheur que l'inscription par e-mail
-- (`trg_zabelie_profile_on_signup`, 0045) — c'est ce qu'on veut : le profil
-- est une conséquence de l'existence du compte, quelle qu'en soit la voie.
--
-- Mais `zabelie_handle_new_user` ne lisait que `raw_user_meta_data->>
-- 'display_name'`, la clé que NOTRE formulaire écrit. Google, Microsoft,
-- Facebook et Apple n'écrivent pas cette clé : ils posent `full_name` et
-- `name` (Supabase normalise ainsi les profils OAuth). Sans cette migration,
-- un compte « Marie Dupont » venu de Google s'appellerait `marie.dupont` —
-- le repli e-mail, qui est un repli, pas un nom.
--
-- Ce qui change : l'ordre de lecture devient `display_name` → `full_name` →
-- `name`, puis les replis de 0045 (e-mail, « Kont »). TOUT passe encore par
-- `zabelie_safe_display_name` : un « Support Zabelie » fourni par un compte
-- Google est refusé exactement comme s'il venait du formulaire (PS8c), et la
-- longueur reste bornée à 60. Le nom d'un fournisseur n'est pas plus digne de
-- confiance que celui d'un navigateur : il est saisi par la même personne.
--
-- Ce qui ne change pas : `security definer`, `search_path`, la révocation de
-- 0049 (un `create or replace` conserve les droits — asserté ci-dessous plutôt
-- que supposé), le `on conflict do nothing`. Éprouvé sous vrais comptes dans
-- `supabase/tests/profile_on_signup.test.sql` (PS12).
-- ============================================================================

create or replace function zabelie_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into profiles (id, display_name)
  values (
    new.id,
    zabelie_safe_display_name(
      coalesce(
        nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
        nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
        nullif(btrim(new.raw_user_meta_data ->> 'name'), '')
      ),
      new.email
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Belt and braces : la révocation de 0049 est restée, on la redit.
revoke all on function zabelie_handle_new_user() from public, anon, authenticated;

comment on function zabelie_handle_new_user() is
  'Crée la ligne profiles d''un nouveau compte, par e-mail comme par '
  'fournisseur tiers (display_name → full_name → name → e-mail → « Kont », '
  'tous filtrés). Le profil est une conséquence de l''existence du compte : il '
  'ne peut pas dépendre d''un navigateur encore ouvert. Voir 0045 et 0095.';

-- ── Post-condition ──────────────────────────────────────────────────────────
-- Sur l'EFFET qu'on peut mesurer sans écrire dans auth.users : la fonction
-- déployée lit bien `full_name`, le déclencheur est toujours attaché, et anon
-- ne peut toujours pas l'appeler. L'effet sur un vrai compte est mesuré par
-- PS12 en CI, sous un vrai insert dans auth.users, annulé ensuite.
do $$
declare
  v_lit_full_name boolean;
  v_trigger       boolean;
  v_anon          boolean;
begin
  select p.prosrc like '%full_name%' and p.prosrc like '%zabelie_safe_display_name%'
    into v_lit_full_name
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'zabelie_handle_new_user';

  select exists (
    select 1 from pg_trigger t
     where t.tgname = 'trg_zabelie_profile_on_signup'
       and t.tgrelid = 'auth.users'::regclass
       and not t.tgisinternal
  ) into v_trigger;

  select has_function_privilege('anon', 'public.zabelie_handle_new_user()', 'EXECUTE')
    into v_anon;

  if not coalesce(v_lit_full_name, false) then
    raise exception '0095 KO: zabelie_handle_new_user ne lit pas full_name via le filtre'
      using errcode = 'ZB095';
  end if;
  if not v_trigger then
    raise exception '0095 KO: trg_zabelie_profile_on_signup absent de auth.users'
      using errcode = 'ZB095';
  end if;
  if v_anon then
    raise exception '0095 KO: anon peut executer zabelie_handle_new_user — la revocation de 0049 est perdue'
      using errcode = 'ZB095';
  end if;

  raise notice '0095 OK: le profil OAuth porte full_name/name, filtre et revocation intacts';
end $$;
