-- ============================================================================
-- 0048 — Présence des objets dont le code déployé dépend
-- ============================================================================
-- ✅ ÉTAT : APPLIQUÉE le 2026-07-31, **CONFIRMÉ CONTRE LA BASE** le
-- 2026-08-04 — pour la première fois. Les sessions précédentes n'avaient
-- aucun accès Postgres et l'écrivaient honnêtement (« d'après le journal de
-- session, non confirmé »). Cette ligne-ci repose sur deux lectures
-- indépendantes, parce que l'une seule ne suffit jamais :
--
--   • LE REGISTRE DÉCLARE — zabelie_schema_migrations porte ce fichier ;
--   • LE CATALOGUE ATTESTE — la sonde elle-même répond, c'est sa propre attestation.
--
-- ⚠️ ET SA COUVERTURE EST PÉRIMÉE — ajouté le 2026-08-18. Cette sonde
-- surveille les DEUX objets qui existaient quand elle a été écrite, à 48
-- migrations. Le dépôt en compte 83, et le code déployé appelle **53**
-- fonctions par leur nom. Rien n'est cassé ; c'est ce qui rend le défaut
-- dangereux plutôt qu'urgent : `/api/admin/coherence` annonçait « tous les
-- objets requis existent en base » en ayant vérifié 4 % de la surface.
-- Une sonde qui ne grandit pas avec le système qu'elle observe finit par
-- mesurer son propre passé.
-- → `0085_objets_requis_v2.sql` porte la liste à 56, et
--   `tests/objets-requis-couverture.test.ts` la tient synchrone des `.rpc()`
--   du code, dans les deux sens — c'est la seule chose qui empêche le gel de
--   recommencer.
--
-- ⚠️ Un en-tête reste écrit une fois et jamais revérifié : c'est vrai de
-- celui-ci comme des autres. Il porte sa date et sa méthode pour qu'on
-- puisse le contredire, pas pour qu'on le croie.
--
-- Pourquoi il ne peut pas en être une : un en-tête est écrit une fois et jamais
-- revérifié. Il portait « NON APPLIQUÉE » alors que `0049` disait, deux fichiers
-- plus loin, « appliquée le 2026-07-31, juste après `0045` ». Le dépôt s'est
-- contredit pendant deux jours sans que rien ne le signale.
--
-- LA SOURCE DE VÉRITÉ EST LE REGISTRE (`0041`) — et le registre lui-même peut
-- diverger du réel, c'est tout l'objet de `0048`. VÉRIFIER LES DEUX avant
-- d'exécuter quoi que ce soit :
--
--   select * from zabelie_schema_migrations
--    where filename = '0048_objets_requis.sql';       -- ce qui est DÉCLARÉ
--   select to_regprocedure('public.zabelie_objets_requis()');  -- ce qui EXISTE
--
-- SI ELLE EST DÉJÀ APPLIQUÉE ET QU'ON LA REJOUE : sans dommage.
-- Un seul `create or replace function`, aucun objet créé. Rejouer la
-- redéfinit à l'identique.
--
-- POURQUOI, ALORS QUE LE REGISTRE `0041` EXISTE DÉJÀ
-- --------------------------------------------------
-- Le registre dit ce qui est **déclaré** appliqué, pas ce qui **existe**.
-- Vérifié le 2026-07-27 : seule `0041` écrit dans `zabelie_schema_migrations` ;
-- `0046` et `0047` ne s'y enregistrent pas, c'est une main humaine qui insère
-- la ligne. Les deux peuvent donc diverger, dans les deux sens :
--
--   * ligne présente, objet absent — restauration partielle, retour arrière
--     manuel, base de prévisualisation reconstruite depuis un instantané plus
--     ancien. Le contrôle serait VERT pendant que toute création de fiche
--     échoue. C'est le pire des deux.
--   * objet présent, ligne oubliée — fausse alerte, qu'on apprend vite à
--     ignorer, et le contrôle cesse d'être lu.
--
-- `to_regprocedure` interroge le catalogue lui-même et rend NULL quand
-- l'objet manque, au lieu de lever. On vérifie donc la PRÉSENCE, pas la
-- DÉCLARATION.
--
-- Ce contrôle ne remplace pas le registre : celui-ci garde la trace de QUAND
-- et de QUOI, avec son empreinte. Les deux répondent à des questions
-- différentes, et c'est la confusion entre les deux qui rend un contrôle
-- rassurant sans être informatif.
-- ============================================================================

create or replace function zabelie_objets_requis()
returns table (objet text, present boolean, pourquoi text)
language sql
stable
set search_path = public, pg_temp
as $$
  -- La signature complète est obligatoire : `to_regprocedure` ne résout pas
  -- un nom nu, et une signature approximative rendrait NULL — donc « absent »
  -- pour un objet bien présent.
  select
    'zabelie_record_policy_acceptance(uuid, text)'::text,
    to_regprocedure('public.zabelie_record_policy_acceptance(uuid, text)') is not null,
    'sans elle, TOUTE création de fiche échoue (0046) — et l''échec tombe '
    'devant l''un des vingt premiers vendeurs, recrutés un par un'::text
  union all
  select
    'zabelie_search_normalize(text)'::text,
    to_regprocedure('public.zabelie_search_normalize(text)') is not null,
    'sans elle, le capteur de demande et son rattrapage dégradent en '
    'silence (0047) — rien ne casse, mais rien n''est mesuré'::text;
$$;

comment on function zabelie_objets_requis() is
  'Présence RÉELLE des objets dont le code déployé dépend, lue dans le '
  'catalogue et non dans le registre des migrations. Le registre déclare, '
  'ceci constate. Voir 0048.';

revoke all on function zabelie_objets_requis() from public, anon, authenticated;
