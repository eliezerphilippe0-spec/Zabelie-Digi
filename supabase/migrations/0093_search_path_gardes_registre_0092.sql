select zabelie_migration_garde('0093_search_path_gardes_registre_0092.sql');

-- ============================================================================
-- 0093 — Ligne de 0092 au registre + search_path épinglé sur 11 gardes
--        + la nécessité de `seller_is_active` écrite noir sur blanc
-- ============================================================================
-- Trois gestes, tous mesurés en production le 2026-09-03 avant d'être écrits.
--
--   1. `0092` n'a AUCUNE ligne au registre — 92 fichiers sur disque, 91
--      lignes. C'est la convention (une migration de registre n'inscrit pas sa
--      propre ligne), pas un défaut, et `0092` l'avait nommé. Sa ligne arrive
--      ici. Empreinte croisée (méthode `0086`) : SHA-256 du fichier de `main`
--      = SHA-256 de `statements[1]` dans le journal Supabase =
--      9ce90cc984e0aa59df9d5194b337bb7d695ae2ba71d9f609b712fc4cb183c0fd.
--      Appliquée le 2026-09-02 14:42:11 UTC (version 20260902144211).
--
--   2. Onze fonctions de `public` ont un `search_path` MUTABLE — mesuré par
--      `pg_proc.proconfig`, pas seulement lu dans le linter : les quatre de
--      `0042` que `OPS_TODO` connaissait, plus SEPT qu'il ne connaissait pas
--      (`0055`, `0071`, `0073`, `0080`, `0081` ×2, `0090`). Toutes sont des
--      fonctions-trigger ou des aides de génération, aucune n'est `security
--      definer` — le risque est donc faible — mais c'est la règle dure n°4
--      non tenue sur SEPT migrations successives, chacune relue. Un défaut
--      qui survit à sept revues n'est pas un défaut d'attention : il faut un
--      contrôle qui le voie. Il est dans `supabase/tests/search_path_epingle.
--      test.sql`, et il est GÉNÉRAL — toute fonction de `public` hors
--      extension — pour qu'une douzième n'attende pas la prochaine passe du
--      linter.
--
--      `set search_path = public`, rien d'autre : c'est ce que ces corps
--      supposent déjà (tables non qualifiées), et ce que `0018` et `0026` ont
--      posé sur leurs prédécesseurs. `''` casserait chaque `insert into
--      orders` non qualifié — un correctif qui fabrique une panne.
--
--   3. `seller_is_active(uuid)` est `security definer` et exécutable par
--      `anon`. `OPS_TODO` demandait « à confirmer ou révoquer ». La réponse est
--      mesurée, pas devinée : elle est appelée par la policy
--      `products_public_read_published` (`0017:80`), et une policy s'évalue
--      sous le rôle du LECTEUR. Révoquer `anon` ne fermerait pas une fuite,
--      il viderait le catalogue public pour tout visiteur non connecté —
--      silencieusement, puisque RLS ne lève pas, elle filtre. La nécessité
--      est donc écrite là où elle se lit (`comment on function`) et
--      ASSERTÉE ci-dessous, pour qu'une révocation future échoue bruyamment
--      avec sa raison sous les yeux.
--
-- Cette migration n'inscrit pas sa propre ligne (même convention).
-- ============================================================================

-- ── 1. Ligne de 0092 ───────────────────────────────────────────────────────
insert into zabelie_schema_migrations
  (filename, sha256, applied_at, applied_by, statut, preuve, note)
values
  ('0092_registre_0091_et_restes_audit.sql',
   '9ce90cc984e0aa59df9d5194b337bb7d695ae2ba71d9f609b712fc4cb183c0fd',
   '2026-09-02 14:42:11+00',
   'porteur — autorisation permanente du 2026-08-17, appliquee par agent via MCP (PR #190)',
   'appliquee', 'journal_supabase',
   'Migration de registre : elle a inscrit 0091, revoque le trigger de 0090 '
   'et pose reviews_buyer_idx. Empreinte croisee (methode 0086) = '
   '9ce90cc984e0aa59df9d5194b337bb7d695ae2ba71d9f609b712fc4cb183c0fd des deux '
   'cotes (fichier de main = statements[1] du journal, version 20260902144211). '
   'Sa propre ligne arrive ici par convention — 92 fichiers, 91 lignes au '
   'controle du 2026-09-03. Le signal de la session qui l a appliquee n a pas '
   'ete relu par la presente ; le journal Supabase atteste l application.')
on conflict (filename) do nothing;

-- ── 2. search_path épinglé ─────────────────────────────────────────────────
alter function public.zabelie_order_ref_candidate(date)  set search_path = public;
alter function public.zabelie_assign_order_ref(date)     set search_path = public;
alter function public.zabelie_orders_ref_on_insert()     set search_path = public;
alter function public.zabelie_orders_ref_immutable()     set search_path = public;
alter function public.zabelie_admin_actions_guard()      set search_path = public;
alter function public.zabelie_ai_surplus_guard()         set search_path = public;
alter function public.zabelie_product_media_guard()      set search_path = public;
alter function public.zabelie_flash_garde()              set search_path = public;
alter function public.zabelie_affiliate_rate_garde()     set search_path = public;
alter function public.zabelie_attribution_figee()        set search_path = public;
alter function public.zabelie_messages_append_only()     set search_path = public;

-- ── 3. seller_is_active — la nécessité, là où elle se lit ──────────────────
comment on function public.seller_is_active(uuid) is
  'SECURITY DEFINER exécutable par anon PAR NÉCESSITÉ, pas par oubli : '
  'appelée par la policy products_public_read_published (0017), évaluée sous '
  'le rôle du lecteur. Révoquer anon viderait le catalogue public en silence. '
  'Ne lit qu''un booléen (suspended_at is null). Asserté par 0093.';

-- ── Post-condition ──────────────────────────────────────────────────────────
-- On assert sur l'EFFET, jamais sur la seule absence d'erreur : un `alter
-- function … set` sur une fonction déjà épinglée ne dit rien, et un `on
-- conflict do nothing` rend un succès silencieux quand la ligne était déjà là
-- avec autre chose.
do $$
declare
  v_ok_ligne     boolean;
  v_restantes    text[];
  v_anon_lecteur boolean;
begin
  select exists (
    select 1 from zabelie_schema_migrations
     where filename = '0092_registre_0091_et_restes_audit.sql'
       and sha256   = '9ce90cc984e0aa59df9d5194b337bb7d695ae2ba71d9f609b712fc4cb183c0fd'
       and statut   = 'appliquee'
       and preuve   = 'journal_supabase'
  ) into v_ok_ligne;

  select coalesce(array_agg(p.proname::text order by p.proname), '{}')
    into v_restantes
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'zabelie_order_ref_candidate', 'zabelie_assign_order_ref',
       'zabelie_orders_ref_on_insert', 'zabelie_orders_ref_immutable',
       'zabelie_admin_actions_guard', 'zabelie_ai_surplus_guard',
       'zabelie_product_media_guard', 'zabelie_flash_garde',
       'zabelie_affiliate_rate_garde', 'zabelie_attribution_figee',
       'zabelie_messages_append_only')
     and not exists (
       select 1 from unnest(coalesce(p.proconfig, '{}')) c
        where c = 'search_path=public');

  select has_function_privilege('anon', 'public.seller_is_active(uuid)', 'EXECUTE')
    into v_anon_lecteur;

  if not v_ok_ligne then
    raise exception '0093 KO: la ligne de 0092 est absente ou divergente au registre'
      using errcode = 'ZB093';
  end if;
  if cardinality(v_restantes) > 0 then
    raise exception '0093 KO: search_path encore mutable sur %', v_restantes
      using errcode = 'ZB093';
  end if;
  if not v_anon_lecteur then
    raise exception '0093 KO: anon ne peut plus executer seller_is_active — la policy products_public_read_published rendrait le catalogue VIDE aux visiteurs'
      using errcode = 'ZB093';
  end if;

  raise notice '0093 OK: 0092 inscrite, 11 search_path epingles, seller_is_active documentee';
end $$;
