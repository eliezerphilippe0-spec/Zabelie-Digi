-- Fonctions SECURITY DEFINER exposées aux clients — revue du 2026-10-08,
-- `docs/REVUE-2026-10-08-fonctions-definer.md`. EXÉCUTÉE, connu-positif et
-- connu-négatif. Transaction annulée : rien ne persiste.
--
-- Une fonction `security definer` s'exécute avec les droits de son
-- propriétaire, RLS contournée. Exposée à `anon` ou `authenticated`, c'est une
-- porte : la revue a lu les douze qui le sont (identité par `auth.uid()` ou
-- par un jeton secret, jamais par un paramètre ; données rendues ; écritures).
-- Ce test FIGE cette liste. Une treizième exposition — une fonction neuve
-- oubliée par un `revoke`, ou un `grant` ajouté — rougit ici et appelle une
-- revue, au lieu de passer en silence.
--
-- Mesuré le 2026-10-08 : la base de ce harnais rend EXACTEMENT les douze
-- signatures et les mêmes droits que la production. Sans cette égalité, le
-- test garderait une liste qui n'est pas celle qui tourne.
begin;

create function pg_temp.definer_exposees()
returns text[] language sql stable as $$
  select coalesce(array_agg(sig), '{}') from (
    select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || '):'
           || case when has_function_privilege('anon', p.oid, 'execute') then 'anon,' else '' end
           || case when has_function_privilege('authenticated', p.oid, 'execute') then 'auth' else '' end
           as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and (has_function_privilege('anon', p.oid, 'execute')
            or has_function_privilege('authenticated', p.oid, 'execute'))
  ) s;
$$;

create function pg_temp.definer_sans_search_path()
returns text[] language sql stable as $$
  select coalesce(array_agg(p.proname::text), '{}')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c
                      where c like 'search_path=%');
$$;

do $$
declare
  v_revue constant text[] := array[
    -- Aides des politiques RLS du catalogue (`products_public_read_published`) :
    -- `anon` DOIT pouvoir les exécuter, sinon le catalogue public se vide.
    'seller_is_active(p_seller uuid):anon,auth',
    -- Identité par auth.uid(), compte actif exigé, n'écrit que pour soi.
    'zabelie_accept_account_legal(p_conditions_version text, p_confidentialite_version text, p_conditions_accepted boolean, p_confidentialite_read boolean):auth',
    -- Facture payable sans compte : jeton de 144 bits (`invoiceToken`), lecture seule.
    'zabelie_biz_get_invoice_by_token(p_token text):anon,auth',
    -- Vitrine publique : champs de profil choisis, vendeur actif seulement.
    'zabelie_boutik_public(p_id uuid, p_slug text):anon,auth',
    -- Panier : auth.uid(), produit publié, jamais son propre produit.
    'zabelie_cart_add(p_product_id uuid):auth',
    'zabelie_cart_remove(p_product_id uuid):auth',
    -- Deux entiers publics, pour AFFICHAGE. ⚠️ Fermée à `anon` par 0066 alors
    -- que `/vendre` est devenue publique : arbitrage porteur ouvert (revue).
    'zabelie_commission_taux():auth',
    -- Domaine vendeur → boutique, appelée par le proxy sans session.
    'zabelie_domaine_boutik(p_hote text):anon,auth',
    -- Désabonnement par jeton gen_random_uuid() : ne touche que sa ligne.
    'zabelie_email_desabonner(p_jeton uuid):anon,auth',
    -- Aide RLS du support : auth.uid() acheteur ou vendeur de la commande.
    'zabelie_order_participant(p_order_id uuid):auth',
    -- Filtre catalogue par zone : identifiants de vendeurs, déjà publics.
    'zabelie_vande_nan_zon(p_zone_ids uuid[]):anon,auth',
    -- Aide RLS du catalogue (comptes d'essai masqués).
    'zabelie_vendeur_essai(p_seller uuid):anon,auth'
  ];
  v_reel  text[];
  v_trop  text[];
  v_moins text[];
  v_sans  text[];
begin
  -- ── P1 — la liste exposée EST la liste revue (comparaison d'ENSEMBLES :
  -- l'ordre de tri dépend de la collation, pas la présence) ────────────────────
  v_reel  := pg_temp.definer_exposees();
  v_trop  := array(select x from unnest(v_reel) x where x <> all (v_revue));
  v_moins := array(select x from unnest(v_revue) x where x <> all (v_reel));
  if cardinality(v_reel) = 0 then
    raise exception 'ECHEC P0 : aucune fonction lue — le contrôle regarderait le vide';
  end if;
  if cardinality(v_trop) > 0 or cardinality(v_moins) > 0 then
    raise exception E'ECHEC P1 : les fonctions SECURITY DEFINER exposées ont changé.\nen trop : %\nen moins : %\nLire chaque nouvelle venue (identité, données rendues, écritures), puis mettre à jour la liste ET la revue.',
      v_trop, v_moins;
  end if;

  -- ── P2 — aucune fonction SECURITY DEFINER sans search_path fixé ────────────
  -- Sans lui, un objet homonyme placé plus tôt dans le chemin de recherche
  -- serait appelé avec les droits du propriétaire.
  v_sans := pg_temp.definer_sans_search_path();
  if cardinality(v_sans) > 0 then
    raise exception 'ECHEC P2 : SECURITY DEFINER sans search_path fixé : %', v_sans;
  end if;
end $$;

-- ── N1 — connu-négatif : une fonction neuve, oubliée par un revoke ───────────
-- Par défaut, une fonction est exécutable par PUBLIC — donc par `anon`. Le
-- contrôle P1 doit la voir. S'il ne la voyait pas, ses verts ne prouveraient
-- rien.
create function public.zz_definer_oubliee() returns integer
language sql security definer set search_path = public as 'select 1';

do $$
begin
  if not ('zz_definer_oubliee():anon,auth' = any (pg_temp.definer_exposees())) then
    raise exception 'ECHEC N1 : une fonction SECURITY DEFINER exposée à anon n''est pas vue';
  end if;
end $$;

-- ── N2 — connu-négatif : une fonction sans search_path ───────────────────────
create function public.zz_definer_sans_chemin() returns integer
language sql security definer as 'select 1';

do $$
begin
  if not ('zz_definer_sans_chemin' = any (pg_temp.definer_sans_search_path())) then
    raise exception 'ECHEC N2 : une fonction SECURITY DEFINER sans search_path n''est pas vue';
  end if;
end $$;

rollback;
