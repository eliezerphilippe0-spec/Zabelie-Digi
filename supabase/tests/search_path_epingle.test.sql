-- Garde GÉNÉRALE du search_path (0093). Transaction annulée à la fin.
--
-- Pourquoi ce contrôle existe : onze fonctions de `public` avaient un
-- `search_path` mutable, réparties sur SEPT migrations successives (0042,
-- 0055, 0071, 0073, 0080, 0081, 0090), chacune relue. Un défaut qui survit à
-- sept revues n'est pas un défaut d'attention ; il se répétera tant que rien
-- ne le voit à la migration suivante. Ce test regarde donc TOUTES les
-- fonctions de `public` hors extension — pas une liste de onze noms, qui
-- serait exacte aujourd'hui et périmée à la douzième.
--
--   S1. Connu-NÉGATIF d'abord : une fonction sans search_path, créée ici même,
--       DOIT être vue par la requête de garde. Sans ce cas, S2 pourrait être
--       vert parce que la requête ne trouve jamais rien.
--   S2. Connu-POSITIF : après suppression de la fonction témoin, aucune
--       fonction de `public` (hors extension) n'a de search_path mutable.
--   S3. `seller_is_active` reste exécutable par `anon` — nécessité documentée
--       par 0093 (policy 0017 évaluée sous le rôle du lecteur).
begin;

-- ── S1 — la requête de garde voit un cas fabriqué ───────────────────────────
create function public.zabelie_temoin_sans_search_path()
returns integer language sql as $$ select 1 $$;

do $$
declare v_n integer;
begin
  select count(*) into v_n
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and p.proname = 'zabelie_temoin_sans_search_path'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');
  if v_n <> 1 then
    raise exception 'S1 KO : la requête de garde ne voit pas la fonction témoin (%)', v_n;
  end if;
  raise notice 'S1 OK — la garde voit un search_path mutable';
end $$;

drop function public.zabelie_temoin_sans_search_path();

-- ── S2 — plus aucune fonction de public sans search_path ────────────────────
do $$
declare v_restantes text[];
begin
  select coalesce(array_agg(p.proname::text || '(' || pg_get_function_identity_arguments(p.oid) || ')'
                            order by p.proname), '{}')
    into v_restantes
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');
  if cardinality(v_restantes) > 0 then
    raise exception 'S2 KO : search_path mutable sur % — ajouter `set search_path = public` à la migration qui les crée', v_restantes;
  end if;
  raise notice 'S2 OK — toutes les fonctions de public ont un search_path épinglé';
end $$;

-- ── S3 — seller_is_active : la nécessité tient ──────────────────────────────
do $$
begin
  if not has_function_privilege('anon', 'public.seller_is_active(uuid)', 'EXECUTE') then
    raise exception 'S3 KO : anon ne peut plus exécuter seller_is_active — le catalogue public serait VIDE (policy products_public_read_published, 0017)';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'seller_is_active'
       and obj_description(p.oid, 'pg_proc') like '%PAR NÉCESSITÉ%'
  ) then
    raise exception 'S3 KO : le commentaire qui explique la nécessité a disparu de seller_is_active';
  end if;
  raise notice 'S3 OK — seller_is_active reste lisible par anon, et la raison est écrite';
end $$;

rollback;
