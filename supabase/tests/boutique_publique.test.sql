-- ============================================================================
-- 0084 — la fiche publique de boutique DISCRIMINE, et on le prouve des deux
-- côtés
-- ============================================================================
-- La migration prouve son câblage (definer, revoke, grant, appel sous `anon`).
-- Elle ne peut pas prouver qu'elle distingue un vendeur d'un acheteur : ça
-- demande un jeu d'essai, donc une transaction annulée. C'est ici.
--
-- Ce qui est en jeu — et pourquoi le connu-NÉGATIF compte plus que le positif :
-- la fonction remplace trois `grant select` de colonne qu'on aurait pu poser à
-- la place. Ces grants auraient rendu `pwen_repe` (« kay ble a bò legliz la »,
-- saisi sur le même formulaire que la livraison, par n'importe quel compte)
-- lisible par le premier venu, pour tout le monde. Toute la valeur de la
-- fonction tient dans B2 : **un acheteur ne rend rien**. Si B2 devenait vert
-- en rendant une fiche, la fonction ne vaudrait pas mieux qu'un grant.
--
-- ⚠️ Comme `orders_rls_isolation`, ce fichier exerce le MOTEUR de privilèges
-- avec une identité choisie (`set local role`), pas la chaîne
-- « jeton → PostgREST → policy ». Aucun JWT n'est émis ni vérifié.
-- ============================================================================

begin;

-- ─────────────────────────── Jeu d'essai ────────────────────────────────────
-- Le profil naît du déclencheur d'inscription (0045) : on insère dans
-- auth.users, puis on complète par UPDATE. Insérer dans `profiles` en direct
-- se heurterait à la clé primaire déjà posée par le déclencheur.
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000b0001', '{"display_name":"Mari Jakmèl"}'),
  ('00000000-0000-0000-0000-0000000b0002', '{"display_name":"Achtè Senp"}'),
  ('00000000-0000-0000-0000-0000000b0003', '{"display_name":"Vandè Non Promi"}');

-- V — vendeur en règle : rôle creator, zone, point de repère, adresse publique.
update profiles set role = 'creator',
                    zone_id = null,
                    pwen_repe = 'kay ble a bò legliz Sen Jan',
                    boutik_slug = 'mari-jakmel',
                    suspended_reason = 'note de moderation qui ne doit jamais sortir',
                    country_code = 'HT',
                    region_code  = 'HT-SD'
 where id = '00000000-0000-0000-0000-0000000b0001';

-- A — acheteur : aucun produit, rôle buyer. Il a un point de repère, parce que
-- c'est exactement le cas qui rendait un grant de colonne inacceptable.
update profiles set pwen_repe = 'dèyè mache a, kay wouj la',
                    boutik_slug = 'achte-senp'
 where id = '00000000-0000-0000-0000-0000000b0002';

-- N — vendeur NON promu : rôle resté `buyer` (0015 fige le rôle côté client),
-- mais il a un produit. Sa boutique doit vivre.
update profiles set boutik_slug = 'vande-non-promi'
 where id = '00000000-0000-0000-0000-0000000b0003';

insert into products (id, seller_id, slug, title, kind, price_htg, status) values
  ('00000000-0000-0000-0000-0000000b00d1', '00000000-0000-0000-0000-0000000b0001',
   'pwodwi-mari', 'Pwodwi Mari', 'physical', 1000, 'published'),
  ('00000000-0000-0000-0000-0000000b00d2', '00000000-0000-0000-0000-0000000b0003',
   'pwodwi-non-promi', 'Pwodwi N', 'physical', 1000, 'published');

-- ── B1. Connu-POSITIF — le vendeur est rendu, par id ET par adresse ─────────
do $$
declare v_id jsonb; v_slug jsonb;
begin
  v_id   := zabelie_boutik_public('00000000-0000-0000-0000-0000000b0001'::uuid, null);
  v_slug := zabelie_boutik_public(null, 'mari-jakmel');

  assert v_id is not null,
    'B1 KO : la fiche du vendeur est nulle par id — /createur/[id] resterait en 404';
  assert v_slug is not null,
    'B1 KO : la fiche du vendeur est nulle par adresse — /boutik/[slug] resterait en 404';
  assert v_id = v_slug,
    format('B1 KO : les deux portes ne rendent pas la meme fiche (%s vs %s)', v_id, v_slug);
  assert v_id->>'display_name' = 'Mari Jakmèl',
    format('B1 KO : display_name inattendu (%s)', v_id->>'display_name');
  assert v_id->>'pwen_repe' = 'kay ble a bò legliz Sen Jan',
    format('B1 KO : pwen_repe du VENDEUR absent — la fiche perdrait ce que 0069 a mis dedans (%s)', v_id);
  assert v_id->>'boutik_slug' = 'mari-jakmel',
    format('B1 KO : boutik_slug absent (%s)', v_id);
  raise notice 'B1 OK — le vendeur est rendu par id et par adresse, fiche identique';
end $$;

-- ── B2. Connu-NÉGATIF — l'acheteur ne rend RIEN ────────────────────────────
-- C'est l'assertion qui justifie la fonction plutôt que trois grants.
do $$
declare v_id jsonb; v_slug jsonb;
begin
  v_id   := zabelie_boutik_public('00000000-0000-0000-0000-0000000b0002'::uuid, null);
  v_slug := zabelie_boutik_public(null, 'achte-senp');

  assert v_id is null,
    format('B2 KO : un ACHETEUR est rendu comme boutique — son pwen_repe fuite (%s)', v_id);
  assert v_slug is null,
    format('B2 KO : un ACHETEUR est joignable par adresse publique (%s)', v_slug);
  raise notice 'B2 OK — l''acheteur ne rend rien, ni par id ni par adresse';
end $$;

-- ── B3. Le vendeur NON PROMU vit quand même ────────────────────────────────
-- `role = creator` seul aurait 404 cette boutique. Le produit fait foi.
do $$
declare v jsonb;
begin
  v := zabelie_boutik_public(null, 'vande-non-promi');
  assert v is not null,
    'B3 KO : un vendeur dont le role est reste buyer perd sa boutique — le predicat ne doit pas se fier au seul role';
  assert v->>'display_name' = 'Vandè Non Promi',
    format('B3 KO : mauvaise fiche (%s)', v);
  raise notice 'B3 OK — un produit suffit, la promotion de role n''est pas exigee';
end $$;

-- ── B4. La fiche ne porte QUE les sept champs de vitrine ───────────────────
-- Assertion sur les CLÉS, pas sur une valeur : une colonne ajoutée demain à
-- `jsonb_build_object` sans qu'on y pense fera rougir ce test.
do $$
declare v jsonb; v_cles text; v_attendu text;
begin
  v := zabelie_boutik_public('00000000-0000-0000-0000-0000000b0001'::uuid, null);
  select string_agg(k, ',' order by k) into v_cles from jsonb_object_keys(v) k;
  v_attendu := 'avatar_url,bio,boutik_slug,display_name,id,pwen_repe,zone_id';
  assert v_cles = v_attendu,
    format('B4 KO : la fiche publique porte « %s » au lieu de « %s » — toute cle en plus est une fuite a arbitrer, pas a decouvrir', v_cles, v_attendu);
  raise notice 'B4 OK — sept champs, ni suspended_*, ni country_code, ni region_code, ni role';
end $$;

-- ── B5. Le chemin de PRIVILÈGE, sous le rôle réel du client SSR ────────────
-- B1→B4 tournent en superutilisateur : ils prouvent la logique, pas le droit.
-- C'est ce cas-ci qui reproduit ce que fait le navigateur d'un visiteur.
do $$
declare v jsonb;
begin
  set local role anon;
  v := zabelie_boutik_public(null, 'mari-jakmel');
  reset role;
  assert v is not null,
    'B5 KO : sous le role anon la fiche est nulle — c''est exactement la panne que 0084 repare';
  assert v->>'pwen_repe' is not null,
    'B5 KO : anon obtient une fiche amputee — la fonction definer ne lit pas les colonnes reservees';
  raise notice 'B5 OK — anon obtient la fiche complete via la fonction, sans droit sur les colonnes';
end $$;

-- ── B6. Deux critères nuls ne rendent pas « la première ligne venue » ──────
do $$
declare v jsonb;
begin
  v := zabelie_boutik_public(null, null);
  assert v is null, format('B6 KO : sans critere, une fiche est rendue (%s)', v);
  v := zabelie_boutik_public('00000000-0000-0000-0000-0000000b0001'::uuid, 'mari-jakmel');
  assert v is null, 'B6 KO : deux criteres a la fois devraient etre refuses';
  raise notice 'B6 OK — un critere, un seul, sinon rien';
end $$;

-- ── B7. `anon` n'a toujours PAS de droit direct sur les colonnes ───────────
-- La fonction ouvre une porte ; elle ne doit pas avoir ouvert le mur. Si ce
-- cas passait, 0084 aurait fait exactement ce qu'elle refuse de faire.
do $$
declare v_err text := 'aucune';
begin
  begin
    set local role anon;
    perform pwen_repe from profiles limit 1;
    reset role;
    raise exception 'B7 KO : anon lit pwen_repe EN DIRECT — la liste blanche de 0015 a ete elargie par erreur';
  exception when insufficient_privilege then
    v_err := 'refus';
  end;
  reset role;
  assert v_err = 'refus', 'B7 KO : le refus attendu n''a pas eu lieu';
  raise notice 'B7 OK — la lecture directe reste refusee, seule la fonction passe';
end $$;

-- ── B8. Le filtre par zone ne rend QUE des marchands ──────────────────────
-- Même défaut réparé, même prédicat, et le même connu-négatif : un acheteur
-- déclarant la zone ne doit pas en sortir. Sans B8b, `zabelie_vande_nan_zon`
-- serait un `.in("zone_id", …)` déguisé — c'est-à-dire la fuite qu'on refuse.
insert into zabelie_zones (parent_id, level, slug, label_kr, label_fr)
select id, 'komin', 'komin-boutik-b8', 'Komin B8', 'Commune B8'
  from zabelie_zones where code = 'HT-OU';

update profiles set zone_id = (select id from zabelie_zones where slug = 'komin-boutik-b8')
 where id in ('00000000-0000-0000-0000-0000000b0001',   -- vendeur
              '00000000-0000-0000-0000-0000000b0002');  -- acheteur

do $$
declare v_zone uuid; v_ids uuid[];
begin
  select id into v_zone from zabelie_zones where slug = 'komin-boutik-b8';

  set local role anon;
  select array_agg(x order by x) into v_ids
    from zabelie_vande_nan_zon(array[v_zone]) x;
  reset role;

  assert v_ids @> array['00000000-0000-0000-0000-0000000b0001'::uuid],
    'B8a KO : le VENDEUR de la zone est absent — le filtre acheteur resterait vide, ce qui est la panne mesuree le 2026-08-18';
  assert not (v_ids @> array['00000000-0000-0000-0000-0000000b0002'::uuid]),
    format('B8b KO : un ACHETEUR de la zone est rendu — la fonction dit ou habitent les acheteurs, exactement ce qu''un grant de colonne aurait fait (%s)', v_ids);
  raise notice 'B8 OK — le vendeur de la zone sort, l''acheteur de la meme zone non';
end $$;

rollback;
