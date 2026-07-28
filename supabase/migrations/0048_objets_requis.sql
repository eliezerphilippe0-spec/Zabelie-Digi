-- ============================================================================
-- 0048 — Présence des objets dont le code déployé dépend
-- ============================================================================
-- ⚠️ NON APPLIQUÉE. À exécuter par le porteur (docs/14).
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
