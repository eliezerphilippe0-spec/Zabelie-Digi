select zabelie_migration_garde('0141_zabelie_profil_inscription_figee.sql');

-- 0141 — La date d'inscription d'un profil ne se réécrit plus côté client.
--
-- `protect_profile_privileges` (0017) fige le rôle, le niveau et la suspension
-- quand un client modifie son profil. `created_at`, lui, restait modifiable
-- par son propriétaire. Aucun écran ne l'affiche aujourd'hui, mais le jour où
-- l'ancienneté servira de signal de confiance (« vendeur depuis… »), elle doit
-- déjà être celle de l'inscription. `id` est figé du même geste : la RLS
-- l'interdit déjà, le trigger le garantit sans elle.
--
-- Corps repris de la définition EN PRODUCTION (lue le 2026-10-14, identique à
-- 0017), plus les seules lignes `created_at` / `id`. Les rôles privilégiés
-- gardent la main, comme avant.

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Rôles privilégiés (service_role via PostgREST, migrations) : aucun garde-fou.
  if current_user in (
    'service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin'
  ) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.role := 'buyer';       -- pas d'auto-attribution admin/creator à l'inscription
    new.tier := 'standard';    -- pas d'auto-attribution elite
    new.suspended_at     := null;
    new.suspended_reason := null;
    new.suspended_by     := null;
    new.created_at       := now();            -- l'inscription, pas une date choisie
  elsif tg_op = 'UPDATE' then
    new.role := old.role;      -- role figé côté client
    new.tier := old.tier;      -- tier figé côté client
    new.suspended_at     := old.suspended_at;     -- suspension figée côté client
    new.suspended_reason := old.suspended_reason;
    new.suspended_by     := old.suspended_by;
    new.created_at       := old.created_at;       -- date d'inscription figée (0141)
    new.id               := old.id;
  end if;
  return new;
end;
$$;

do $$
declare v_src text;
begin
  select prosrc into v_src from pg_proc
   where proname = 'protect_profile_privileges' and pronamespace = 'public'::regnamespace;
  if v_src is null
     or position('new.created_at       := old.created_at' in v_src) = 0
     or position('new.created_at       := now()' in v_src) = 0
     or position('new.role := old.role' in v_src) = 0
     or position('new.suspended_at     := old.suspended_at' in v_src) = 0 then
    raise exception '0141: protect_profile_privileges ne fige pas created_at, ou a perdu un garde';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgname = 'trg_protect_profile_privileges'
                    and tgrelid = 'public.profiles'::regclass and tgenabled <> 'D') then
    raise exception '0141: trg_protect_profile_privileges absent ou désactivé';
  end if;
end $$;
