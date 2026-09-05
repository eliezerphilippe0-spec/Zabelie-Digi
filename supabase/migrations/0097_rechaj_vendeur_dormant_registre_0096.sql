select zabelie_migration_garde('0097_rechaj_vendeur_dormant_registre_0096.sql');

-- ============================================================================
-- 0097 — La section « recharge » du CATALOGUE VENDEUR, semée DORMANTE (D-7)
--        + ligne de registre de 0096
-- ============================================================================
-- ⛔ CETTE MIGRATION N'OUVRE RIEN. Elle prépare, elle n'autorise pas.
--
-- ─── LES TROIS CHOSES QUE LE MOT « RECHARGE » CONFOND ───────────────────────
-- 1. **Zabelie vend des minutes elle-même** (V-11, `app/rechaj`, rail Reloadly).
--    FERMÉ par V-17 le 2026-08-01 : Zabelie est un intermédiaire, pas un
--    marchand. Drapeau `ZABELIE_TOPUP_FIRSTPARTY_ENABLED`, défaut `false`.
--    Cette migration ne le touche pas et ne le rouvre pas.
-- 2. **Un VENDEUR vend du crédit Digicel/Natcom**, et Zabelie prélève sa
--    commission comme sur toute vente — le modèle que le porteur a réaffirmé
--    le 2026-09-05 : « Zabelie est un intermédiaire […] le vendeur crée sa
--    boutique et Zabelie a une commission sur chaque vente ». C'est **D-7**,
--    OUVERTE et NON TRANCHÉE. C'est ce que cette migration prépare.
-- 3. **Revendre du SOLDE MonCash ou NatCash** — « m ap vann balans », agent de
--    dépôt ou de retrait. ⛔ **INTERDIT, sans appel, aucun cas particulier** :
--    c'est de la monnaie électronique, pas un bien (BRH circ. 121,
--    `docs/07-TOPUP.md` §3, `docs/17`). Déjà publié sur `/produits-interdits`.
--
-- ─── POURQUOI DORMANTE, ET PAS ACTIVE ───────────────────────────────────────
-- D-7 est marquée « commercial + réglementaire ». Le porteur peut trancher le
-- commercial — il vient de le faire. Le RÉGLEMENTAIRE ne se tranche pas par
-- préférence : il demande un avis sur le statut de revendeur télécom en Haïti.
-- Semer actif reviendrait à ouvrir un rayon qui frôle la monnaie électronique
-- avant que quiconque ait dit où passe la ligne — et avant que Zabelie ait
-- encaissé sa première gourde.
--
-- ⚠️ **CE QU'IL FAUT AVOIR FAIT AVANT D'ACTIVER** (l'`UPDATE` est trivial,
-- les préalables ne le sont pas) :
--   a. trancher D-7 par écrit dans `docs/02-DECISIONS.md` ;
--   b. obtenir l'avis juridique sur la revente de crédit télécom par un tiers ;
--   c. écrire, en FR et en KR, la ligne qui sépare « rechaj / minit » (permis)
--      de « vann balans » (interdit) — avec les mots que les gens emploient,
--      pas le vocabulaire juridique. Sans elle, ouvrir l'un ouvre l'autre :
--      c'est le même vendeur, la même page, le même prix.
-- Le geste d'activation, le jour venu, est au journal des rayons d'`OPS_TODO`.
--
-- ─── CE QUE ÇA CHANGE POUR UN VENDEUR AUJOURD'HUI : RIEN ────────────────────
-- Et ça mérite d'être dit, parce que c'est contre-intuitif : un vendeur peut
-- DÉJÀ vendre du crédit, sans cette migration et sans aucun code. Il publie un
-- `service` (« Rechaj Digicel 100 HTG »), l'acheteur paie, il recharge le
-- numéro depuis son propre compte revendeur, Zabelie prélève sa commission.
-- Rien ne le bloque : la liste des produits interdits bannit la revente de
-- SOLDE, pas le crédit télécom. Ces deux rayons ne rendent donc pas possible
-- ce qui l'était déjà — ils rendront ce commerce RANGEABLE et TROUVABLE le
-- jour où il sera explicitement autorisé.
-- ============================================================================

-- ── 1. Registre : 0096 ───────────────────────────────────────────────────────
-- `sha256` = empreinte CANONIQUE (`scripts/zabelie-migration-hash.mjs`). La
-- `note` porte le croisement brut (méthode 0086) relevé le jour même.
insert into zabelie_schema_migrations
  (filename, sha256, applied_at, applied_by, statut, preuve, note)
values
  ('0096_taxonomie_doublons_registre_0094_0095.sql',
   'f5f91c9e7952ba802329cad3303c8c3bea9ab35b7f56cb62f4e22885a9ef4bb6',
   '2026-09-05 11:50:06+00',
   'porteur — signal explicite « Applique 0096 » du 2026-09-05, appliquee par agent via MCP apres fusion de la PR #206 (CI verte)',
   'appliquee', 'journal_supabase',
   'Sept sous-categories de niveau 3 en double sous le meme parent retirees ; '
   'index unique (parent_id, label_fr) nulls not distinct ; rechaj-telefon '
   'passe active = false (V-17) ; lignes de registre 0094 et 0095. Mesure '
   'apres : 582 lignes (589 - 7), 70 actives, 0 doublon, 7 jumelles actives '
   'intactes. Empreinte croisee (methode 0086) : SHA-256 BRUT du fichier de '
   'main (724c2e8) sans saut de ligne final = statements[1] du journal '
   '(version 20260905115006) = '
   '75a336f968a2fd38b20bcad02128362265b550fd2a86846a6f2ca695ceccdadf.')
on conflict (filename) do nothing;

-- ── 2. Les deux rayons, DORMANTS ─────────────────────────────────────────────
-- Sous `rechaj-telefon` (niveau 2, lui-même inactif depuis 0096). `0077` avait
-- volontairement EXCLU ce sous-arbre — « catalogue Reloadly, non editable par
-- les vendeurs » — parce qu'à l'époque le vendeur était Zabelie. Le modèle a
-- changé : ce sont désormais des rayons que des VENDEURS rempliraient, donc
-- ils ont un sens. `active = false` : ils n'apparaissent ni à la publication
-- ni dans les filtres (0035).
insert into zabelie_categories
  (parent_id, level, slug, label_kr, label_fr, label_en, label_es, active, position)
select p.id, 3, v.slug, v.kr, v.fr, v.en, v.es, false, v.pos
  from zabelie_categories p
  cross join (values
    ('rechaj-digicel', 'Rechaj Digicel', 'Recharge Digicel', 'Digicel top-up', 'Recarga Digicel', 10),
    ('rechaj-natcom',  'Rechaj Natcom',  'Recharge Natcom',  'Natcom top-up',  'Recarga Natcom',  20)
  ) as v(slug, kr, fr, en, es, pos)
 where p.slug = 'rechaj-telefon' and p.level = 2
on conflict (slug) do nothing;

comment on table zabelie_categories is
  'Taxonomie du catalogue. Un rayon inactif n''apparait ni a la publication ni '
  'dans les filtres. ⚠️ rechaj-digicel / rechaj-natcom (0097) sont DORMANTS et '
  'ne s''activent qu''apres arbitrage de D-7 : avis juridique sur la revente de '
  'credit telecom, et ligne ecrite entre « rechaj » (permis) et « vann balans » '
  '(interdit, monnaie electronique). Voir docs/02-DECISIONS.md et OPS_TODO.';

-- ── Post-conditions ──────────────────────────────────────────────────────────
-- Sur l'EFFET, et surtout sur ce que cette migration NE DOIT PAS avoir fait :
-- rien d'actif, nulle part.
do $$
declare
  v_enfants   integer;
  v_actifs    integer;
  v_parent    boolean;
  v_registre  integer;
begin
  select count(*) into v_enfants
    from zabelie_categories c join zabelie_categories p on p.id = c.parent_id
   where p.slug = 'rechaj-telefon' and c.level = 3;
  if v_enfants <> 2 then
    raise exception '0097 KO: % sous-rayon(s) sous rechaj-telefon, 2 attendus', v_enfants
      using errcode = 'ZB097';
  end if;

  select count(*) into v_actifs
    from zabelie_categories where slug in ('rechaj-digicel', 'rechaj-natcom') and active;
  if v_actifs <> 0 then
    raise exception '0097 KO: % rayon(s) de recharge ACTIF(S) — cette migration ne doit RIEN ouvrir (D-7 non tranchee)', v_actifs
      using errcode = 'ZB097';
  end if;

  -- Le parent doit rester fermé : l'activer par effet de bord rouvrirait un
  -- rayon que 0096 a explicitement fermé au titre de V-17.
  select active into v_parent from zabelie_categories where slug = 'rechaj-telefon';
  if v_parent is null then
    raise exception '0097 KO: rechaj-telefon a disparu' using errcode = 'ZB097';
  end if;
  if v_parent then
    raise exception '0097 KO: rechaj-telefon est redevenu actif — 0096 l avait ferme (V-17)'
      using errcode = 'ZB097';
  end if;

  select count(*) into v_registre
    from zabelie_schema_migrations
   where filename = '0096_taxonomie_doublons_registre_0094_0095.sql'
     and statut = 'appliquee' and preuve = 'journal_supabase';
  if v_registre <> 1 then
    raise exception '0097 KO: ligne de registre de 0096 non conforme (% trouvee)', v_registre
      using errcode = 'ZB097';
  end if;

  raise notice '0097 OK: 2 sous-rayons de recharge semes DORMANTS, parent toujours ferme, registre 0096 inscrit';
end $$;
