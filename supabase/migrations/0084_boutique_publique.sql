select zabelie_migration_garde('0084_boutique_publique.sql');

-- ============================================================================
-- 0084 — LA FICHE PUBLIQUE D'UNE BOUTIQUE, PAR UNE PORTE QUI SAIT FILTRER
-- ============================================================================
-- ⚠️ CETTE MIGRATION RÉPARE QUATRE CHEMINS MORTS EN PRODUCTION. Mesuré le
-- 2026-08-18 contre `ddditxykopuxxqzgkqwy`, sous le rôle `anon` réel — pas
-- déduit du code :
--
--   A/ getCreator, 1re tentative  (…, zone_id, pwen_repe, boutik_slug)
--                                          → REFUS 42501 permission denied
--   B/ getCreator, repli          (…, zone_id, pwen_repe)
--                                          → REFUS 42501
--   C/ getCreatorBySlug           where boutik_slug = 'x'
--                                          → REFUS 42501
--   E/ getSellerIdsInZone         where zone_id in (…)
--                                          → REFUS 42501
--   F/ attribuerSlug              select boutik_slug where id = …
--                                          → REFUS 42501
--   ── les deux connus-négatifs, sans lesquels ce qui précède ne prouve rien ─
--   D/ select id, display_name, bio, avatar_url from profiles
--                                          → PASSE
--   G/ update profiles set pwen_repe='x', zone_id=null where id = …
--                                          → PASSE   (0015 n'a révoqué que
--                                             le SELECT — enregistrer son
--                                             profil marche toujours)
--
-- Ce que ça donne, écran par écran :
--   1. `/createur/[id]`  → 404 pour tout le monde.
--   2. `/boutik/[slug]`  → 404.
--   3. le filtre acheteur par zone → **zéro vendeur, toujours**. Celui-là
--      journalisait (`[zones] vendeurs introuvables`) et personne ne l'a lu :
--      un avertissement qui ressemble à « cette zone est vide ».
--   4. l'attribution d'adresse à l'enregistrement du profil → aucun vendeur
--      inscrit après `0083` n'a jamais reçu de `boutik_slug`.
--
-- Une seule cause pour les quatre. C'est ce qui rend ce cas instructif : le
-- défaut n'est pas dans un écran, il est dans une hypothèse partagée par
-- quatre morceaux de code écrits par quatre chantiers différents.
--
-- ⚠️ CE QUI N'EST PAS MESURÉ — corrigé à l'audit du même jour. La première
-- rédaction datait chaque panne (« depuis le 2026-08-14 »). C'étaient les
-- dates des COMMITS sur `main`, pas celles d'un déploiement observé : l'egress
-- du conteneur est fermé, aucune page n'a pu être chargée. Ce qui EST attesté,
-- outre les refus ci-dessus : les journaux Postgres de production portent des
-- `permission denied for table profiles` ORGANIQUES le 2026-08-17 à 10:52 et
-- 11:44 UTC — ni sonde de l'agent (son travail commence le 18 vers 05:00), ni
-- conséquence de `0083` (appliquée le 17 à 20:32, après). Du code déployé
-- heurtait donc déjà la liste blanche. La fenêtre de journaux est plafonnée à
-- 24 h : « depuis au moins le 2026-08-17 » est vrai, « depuis le 14 » est
-- vraisemblable et non attesté. → `docs/39` §1.
--
-- ─── POURQUOI PERSONNE N'A RIEN VU, ET POURQUOI RIEN NE POUVAIT LE DIRE ────
-- `pg_policies` dit de `profiles` : `profiles_public_read USING (true)`.
-- Lecture publique totale. C'est vrai, et ça ne décrit pas le système : la
-- RLS filtre des LIGNES, jamais des COLONNES. Le vrai filtre est une **liste
-- blanche de colonnes** posée par `0015` :
--
--     revoke select on profiles from anon, authenticated;
--     grant  select (id, role, display_name, bio, avatar_url, tier, created_at)
--       on profiles to anon, authenticated;
--
-- Une liste blanche est une liste FERMÉE. `0069` a ajouté `zone_id` et
-- `pwen_repe`, `0083` a ajouté `boutik_slug` — aucune des trois n'y est
-- entrée. Postgres n'a rien dit : ajouter une colonne à une table sous liste
-- blanche ne lève aucune erreur, n'écrit aucun journal, ne ralentit rien. La
-- colonne naît simplement invisible, pour toujours. C'est très exactement le
-- défaut silencieux que `CLAUDE.md` traque partout ailleurs, à un endroit que
-- rien ne regardait — le garde `rls_toutes_tables` (C3.4) lit `rowsecurity`,
-- les tests SQL lisent des policies, et les GRANTS de colonne n'étaient lus
-- par personne. `supabase/tests/colonnes_liste_blanche.test.sql` les lit
-- désormais, à chaque commit.
--
-- ─── POURQUOI UNE FONCTION, ET PAS TROIS `GRANT` DE PLUS ───────────────────
-- Le réflexe serait d'élargir la liste blanche. Il est faux, et c'est le
-- fond du sujet : `profiles_public_read` vaut `true` pour TOUTE ligne, donc
-- **un grant de colonne est public pour tout le monde** — acheteurs compris.
-- `pwen_repe` (« kay ble a bò legliz la ») est saisi sur le même formulaire
-- que les informations de livraison, par n'importe quel compte. L'ouvrir
-- rendrait le point de repère de chaque ACHETEUR lisible par le premier
-- venu, pour réparer la fiche d'un VENDEUR. Un grant de colonne ne sait pas
-- faire cette différence : il n'a pas de prédicat.
--
-- Cette fonction l'a. Elle ne rend une fiche que si le profil est un
-- marchand — `role = 'creator'` OU au moins un produit — et ne rend que les
-- sept champs de la vitrine. `suspended_reason`, `suspended_by`,
-- `country_code`, `region_code` restent hors d'atteinte : `0015` les
-- réservait au `service_role` (tableau `/admin/geo`) et cette décision-là
-- n'est pas rouverte ici.
--
-- Conséquence assumée : la page d'un compte qui n'a jamais rien vendu répond
-- 404 au lieu d'afficher une vitrine vide. C'est la vérité — un acheteur
-- n'est pas une boutique — et c'est de toute façon mieux que le 404 que tout
-- le monde reçoit aujourd'hui.
--
-- ⚠️ `security definer` exposée à `anon` : la garde est ici le prédicat
-- marchand, la liste de colonnes FIXE (aucune interpolation, aucun `select *`)
-- et `set search_path = public`. `revoke all ... from public` précède le
-- `grant`, comme `0022`.
-- ============================================================================

create or replace function zabelie_boutik_public(p_id uuid default null,
                                                 p_slug text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_p profiles;
begin
  -- Un seul critère à la fois, et au moins un : sans ça, deux paramètres nuls
  -- rendraient la première ligne venue.
  if (p_id is null) = (p_slug is null) then
    return null;
  end if;

  select * into v_p from profiles
   where (p_id   is not null and id          = p_id)
      or (p_slug is not null and boutik_slug = p_slug);

  if not found then return null; end if;

  -- LE PRÉDICAT — c'est lui qui distingue un vendeur d'un acheteur, et c'est
  -- ce qu'un grant de colonne ne peut pas faire. `role` seul ne suffit pas :
  -- `0015` fige le rôle côté client, un vendeur peut donc rester `buyer` tant
  -- qu'un admin ne l'a pas promu — ses produits, eux, ne mentent pas.
  if v_p.role <> 'creator'
     and not exists (select 1 from products pr where pr.seller_id = v_p.id)
  then
    return null;
  end if;

  return jsonb_build_object(
    'id',           v_p.id,
    'display_name', v_p.display_name,
    'bio',          v_p.bio,
    'avatar_url',   v_p.avatar_url,
    'zone_id',      v_p.zone_id,
    'pwen_repe',    v_p.pwen_repe,
    'boutik_slug',  v_p.boutik_slug
  );
end;
$$;

comment on function zabelie_boutik_public(uuid, text) is
  'Fiche publique d''une boutique (0084). Rend NULL pour un profil non marchand. Sept champs de vitrine seulement — jamais suspended_*, country_code ni region_code, réservés au service_role depuis 0015.';

revoke all on function zabelie_boutik_public(uuid, text) from public;
grant execute on function zabelie_boutik_public(uuid, text)
  to anon, authenticated, service_role;

-- ── Le filtre acheteur par zone — même porte, même prédicat ────────────────
-- `getSellerIdsInZone` filtrait `where zone_id in (…)`. Il suffit de CITER
-- une colonne non accordée dans un `where` pour se faire refuser toute la
-- requête : la colonne n'a pas besoin d'être demandée en sortie. Le filtre
-- rendait donc systématiquement zéro vendeur, avec un avertissement au
-- journal qui se lisait comme « cette zone est vide ».
--
-- Cette fonction ne rend que des identifiants de MARCHANDS : elle n'apprend
-- donc rien sur la localisation des acheteurs, ce qu'un `grant select
-- (zone_id)` aurait fait pour tout le monde.
create or replace function zabelie_vande_nan_zon(p_zone_ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id from profiles p
   where p.zone_id = any(p_zone_ids)
     and (p.role = 'creator'
          or exists (select 1 from products pr where pr.seller_id = p.id))
   limit 1000;
$$;

comment on function zabelie_vande_nan_zon(uuid[]) is
  'Identifiants des MARCHANDS declarant une des zones donnees (0084). Ne dit rien des acheteurs : leur zone reste hors de portee de anon/authenticated.';

revoke all on function zabelie_vande_nan_zon(uuid[]) from public;
grant execute on function zabelie_vande_nan_zon(uuid[])
  to anon, authenticated, service_role;

-- ── Post-conditions — la migration se prouve avant de se déclarer faite ─────
-- Elle prouve le CÂBLAGE (existence, definer, droits, exécutabilité sous
-- `anon`). Elle ne prouve pas la DISCRIMINATION acheteur/vendeur : celle-là
-- exige un jeu d'essai, elle vit dans `supabase/tests/boutique_publique.test.sql`
-- où la transaction est annulée. Les deux sont nécessaires.
do $$
declare
  v_definer boolean;
  v_public  boolean;
  v_anon    boolean;
  v_appel   jsonb;
begin
  select p.prosecdef into v_definer
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'zabelie_boutik_public';
  if v_definer is null then
    raise exception '0084 KO: zabelie_boutik_public absente apres creation';
  end if;
  if not v_definer then
    raise exception '0084 KO: la fonction n''est pas security definer — elle lirait profiles avec les droits de l''appelant, donc rien';
  end if;

  v_public := has_function_privilege('public', 'zabelie_boutik_public(uuid, text)', 'execute');
  if v_public then
    raise exception '0084 KO: execute encore ouvert a PUBLIC — le revoke n''a pas pris';
  end if;

  v_anon := has_function_privilege('anon', 'zabelie_boutik_public(uuid, text)', 'execute');
  if not v_anon then
    raise exception '0084 KO: anon ne peut pas executer — les deux pages resteraient en 404';
  end if;

  -- Le seul contrôle qui exerce vraiment le chemin de privilège : appeler
  -- SOUS `anon`. Un uuid qui n'existe pas doit rendre NULL sans erreur ; une
  -- erreur ici dirait que la fonction ne lit pas `profiles`.
  set local role anon;
  select zabelie_boutik_public('00000000-0000-0000-0000-000000000000'::uuid, null)
    into v_appel;
  reset role;
  if v_appel is not null then
    raise exception '0084 KO: un uuid inexistant a rendu une fiche (%)', v_appel;
  end if;

  -- Même triplet pour la seconde fonction. Répété, pas factorisé : une garde
  -- qui n'inspecte qu'un objet sur deux est le défaut que `CLAUDE.md` appelle
  -- « un objet vérifié n'est pas le bon objet ».
  if has_function_privilege('public', 'zabelie_vande_nan_zon(uuid[])', 'execute') then
    raise exception '0084 KO: zabelie_vande_nan_zon encore ouverte a PUBLIC';
  end if;
  if not has_function_privilege('anon', 'zabelie_vande_nan_zon(uuid[])', 'execute') then
    raise exception '0084 KO: anon ne peut pas executer zabelie_vande_nan_zon — le filtre par zone resterait vide';
  end if;
  set local role anon;
  perform zabelie_vande_nan_zon(array['00000000-0000-0000-0000-000000000000'::uuid]);
  reset role;

  raise notice '0084 OK: deux fonctions definer, publique revoquee, anon habilite, appels sous anon sans erreur';
end $$;
