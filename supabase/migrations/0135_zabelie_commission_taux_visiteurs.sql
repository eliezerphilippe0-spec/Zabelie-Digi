select zabelie_migration_garde('0135_zabelie_commission_taux_visiteurs.sql');

-- 0135 — Les visiteurs lisent le taux de commission en vigueur
-- (revue du 2026-10-08, SEC-D1 ; docs/REVUE-2026-10-08-fonctions-definer.md).
--
-- ─── LA DÉCISION QUE 0066 RÉSERVAIT ─────────────────────────────────────────
-- `0066` a ouvert `zabelie_commission_taux()` à `authenticated` seulement, « par
-- moindre privilège », parce que `/vendre` exigeait alors un compte, et elle
-- l'a écrit : « le jour où une page publique en aura besoin, ce sera une
-- décision, pas un héritage ». Ce jour est venu : `/vendre` et
-- `/vendre/physique` sont publiques et annoncent la commission au futur
-- vendeur AVANT l'inscription, avec le client de session (`anon` hors
-- connexion).
--
-- Mesuré en production le 2026-10-08 : `set local role anon` puis l'appel
-- rendent `permission denied`. Chaque visite non connectée retombait sur la
-- constante compilée et journalisait `[commission] taux de repli utilisé`.
-- Rien de visible tant que la table vaut 1000/600 — mais un taux changé en
-- base n'aurait pas atteint le prospect, sur la page qui précède sa décision.
--
-- Décision du porteur, le 2026-10-09 : « Oui ouvre le aux visiteurs ».
--
-- ─── CE QUI S'OUVRE, ET RIEN DE PLUS ────────────────────────────────────────
-- * EXECUTE sur la seule fonction, pour `anon`. Elle rend deux entiers déjà
--   publics (10 %, 6 %), pour AFFICHAGE : le calcul d'argent reste
--   `commission_rate_bps` + `confirm_payment`.
-- * La TABLE `zabelie_commission_config` reste fermée aux rôles client : ses
--   colonnes futures ne s'ouvrent pas par ricochet.
-- * `PUBLIC` reste sans droit : l'ouverture est nommée, rôle par rôle.

grant execute on function public.zabelie_commission_taux() to anon;

comment on function public.zabelie_commission_taux() is
  'Taux de commission en vigueur, pour AFFICHAGE uniquement (estimation du net vendeur). Le calcul d''argent reste commission_rate_bps + confirm_payment. security definer car zabelie_commission_config est fermée aux rôles client ; accordée à authenticated (0066) et à anon (0135, décision porteur du 2026-10-09 : /vendre est publique).';

-- ─────────── POST-CONDITIONS ────────────────────────────────────────────────
do $$
begin
  if not has_function_privilege('anon', 'public.zabelie_commission_taux()', 'execute') then
    raise exception 'ZB135 : anon ne peut toujours pas lire les taux';
  end if;
  if not has_function_privilege('authenticated', 'public.zabelie_commission_taux()', 'execute') then
    raise exception 'ZB135 : authenticated a perdu la lecture des taux';
  end if;
  if exists (select 1 from information_schema.role_routine_grants
              where routine_name = 'zabelie_commission_taux' and grantee = 'PUBLIC') then
    raise exception 'ZB135 : zabelie_commission_taux exposee a PUBLIC';
  end if;
  if has_table_privilege('anon', 'public.zabelie_commission_config', 'select') then
    raise exception 'ZB135 : la table zabelie_commission_config est lisible par anon';
  end if;
end $$;
