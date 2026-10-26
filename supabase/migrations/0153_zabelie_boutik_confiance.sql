select zabelie_migration_garde('0153_zabelie_boutik_confiance.sql');

-- 0153 — Signaux de confiance de la vitrine (audit REA 2026-10-26, #5).
--
-- La fiche publique d'une boutique (`zabelie_boutik_public`, 0084 puis 0112)
-- ne rendait que nom, bio, avatar, zone, point de repère et slug. L'acheteur
-- « trust-first » décidait donc sans les preuves qu'il cherche : ni note
-- agrégée, ni ancienneté. Le modèle les INTERDISAIT à la source — rien à
-- afficher, quoi que fasse le composant.
--
-- Ce fichier MODIFIE la fonction EN PLACE (même signature uuid,text) : aucun
-- nouveau nom de RPC, donc la sonde `zabelie_objets_requis()` reste inchangée
-- (l'entrée `zabelie_boutik_public(uuid,text)` la couvre déjà).
--
-- Ce qu'on ajoute, et pourquoi c'est FIABLE :
--   • `created_at` du profil (0001) → ancienneté « membre depuis » ;
--   • `rating_sum` / `rating_count` AGRÉGÉS sur les produits PUBLIÉS du
--     vendeur (colonnes dénormalisées déjà portées par `products`). La
--     fonction rend les AGRÉGATS BRUTS, jamais une moyenne : le seuil
--     d'affichage (3 avis) reste une décision côté applicatif, en un seul
--     endroit (`lib/note-affichee.ts`), comme pour les fiches produit.
--
-- Ce qu'on N'AJOUTE PAS, volontairement : les « ventes totales ». `sales_count`
-- n'est pas adossé au paiement (audit #2.5) ; un comptage payé par vendeur est
-- une décision séparée (jointure commandes/escrow), pas un geste d'affichage.
--
-- Rien n'est réécrit, aucune donnée touchée : seul le corps de la fonction
-- change. `security definer` conservé (la fonction ne rend une fiche que pour
-- un marchand non suspendu), ACL conservées (anon/authenticated/service_role).

begin;

create or replace function public.zabelie_boutik_public(p_id uuid default null, p_slug text default null)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare
  v_p profiles;
  v_rating_sum bigint;
  v_rating_count bigint;
begin
  if (p_id is null) = (p_slug is null) then return null; end if;
  select * into v_p from profiles
    where ((p_id is not null and id=p_id) or (p_slug is not null and boutik_slug=p_slug))
      and suspended_at is null;
  if not found then return null; end if;
  if v_p.role <> 'creator' and not exists(select 1 from products where seller_id=v_p.id) then
    return null;
  end if;
  -- Note agrégée de la boutique : somme des avis sur ses produits PUBLIÉS.
  -- Agrégats bruts seulement — le seuil d'affichage vit dans l'applicatif.
  select coalesce(sum(rating_sum), 0), coalesce(sum(rating_count), 0)
    into v_rating_sum, v_rating_count
    from products where seller_id = v_p.id and status = 'published';
  return jsonb_build_object(
    'id',v_p.id,'display_name',v_p.display_name,'bio',v_p.bio,'avatar_url',v_p.avatar_url,
    'zone_id',v_p.zone_id,'pwen_repe',v_p.pwen_repe,'boutik_slug',v_p.boutik_slug,
    'created_at',v_p.created_at,'rating_sum',v_rating_sum,'rating_count',v_rating_count);
end;
$$;
revoke all on function public.zabelie_boutik_public(uuid,text) from public;
grant execute on function public.zabelie_boutik_public(uuid,text) to anon,authenticated,service_role;

-- Known-positive à l'application : la fonction compile, s'exécute sur les deux
-- contrats existants sans lever, et ses ACL restent publiques. La correction
-- de l'AGRÉGAT se prouve sur données réelles (harnais SQL / production), pas
-- ici — ce bloc atteste que le remplacement n'a rien cassé du contrat 0084/0112.
do $$
begin
  if public.zabelie_boutik_public(null, null) is not null then
    raise exception '0153: boutik_public(null,null) doit rester null (contrat exclusif)';
  end if;
  if public.zabelie_boutik_public('00000000-0000-0000-0000-000000000000'::uuid, null) is not null then
    raise exception '0153: boutik_public sur un id inexistant doit rendre null';
  end if;
  if not has_function_privilege('anon', 'public.zabelie_boutik_public(uuid,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.zabelie_boutik_public(uuid,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.zabelie_boutik_public(uuid,text)', 'EXECUTE') then
    raise exception '0153: boutik_public doit rester exécutable par anon, authenticated et service_role';
  end if;
  if has_function_privilege('public', 'public.zabelie_boutik_public(uuid,text)', 'EXECUTE') then
    raise exception '0153: boutik_public ne doit pas être exécutable par public';
  end if;
end $$;

commit;
