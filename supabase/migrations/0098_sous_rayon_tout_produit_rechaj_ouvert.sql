select zabelie_migration_garde('0098_sous_rayon_tout_produit_rechaj_ouvert.sql');

-- ============================================================================
-- 0098 — Un sous-rayon pour TOUT produit, et la section « Recharge » s'ouvre
-- ============================================================================
-- DÉCISION PORTEUR, 2026-09-05, en toutes lettres : « rajoute la section, en
-- cas d'interdit je vais l'enlever ». Elle a été précédée de deux mises en
-- garde (avis juridique, ligne entre « rechaj » et « vann balans ») et
-- réaffirmée. C'est donc SA décision, prise en connaissance de cause, et le
-- retour arrière tient en trois `update … set active = false` — consignés au
-- journal des rayons d'`OPS_TODO`.
--
-- ─── POURQUOI UNE COLONNE, ET PAS SEULEMENT TROIS UPDATE ────────────────────
-- Activer « Recharge Digicel » et « Recharge Natcom » (0097) ne les aurait
-- fait apparaître NULLE PART pour un service — mesuré avant d'écrire :
--   • `products.category` ne porte que le DÉPARTEMENT (niveau 1) ;
--   • le formulaire `/vendre` n'offre que le niveau 1 (`lireRayonsPublication`) ;
--   • les facettes du catalogue ne lisent que `zabelie_physical_products`.
-- Un service n'avait donc aucun moyen de se ranger dans un sous-rayon, et
-- aucune facette ne pouvait le montrer. Les douze feuilles de services de
-- 0057 souffraient déjà du même défaut : le catalogue les affichait, la
-- publication les ignorait.
--
-- CE QUE FAIT CETTE MIGRATION :
--   1. `products.category_id` — le sous-rayon (niveau 2 ou 3), pour TOUT type,
--      nullable : une fiche peut s'arrêter au département. Clé étrangère vers
--      `zabelie_categories`, `on delete restrict` — on ne perd pas un rangement
--      en supprimant un rayon par mégarde ;
--   2. backfill depuis `zabelie_physical_products.category_id`, qui reste la
--      source pour ce que le physique a en propre (fitment, stock) et qui est
--      désormais écrit EN MÊME TEMPS que `products.category_id` à la création
--      (`app/api/products/physical/route.ts`) ;
--   3. ouverture des trois rayons de recharge : `rechaj-telefon` (fermé par
--      0096 au titre de V-17 — V-17 fermait la vente EN PROPRE, et ce rayon
--      sert désormais des VENDEURS) et ses deux enfants de 0097.
--
-- CE QU'ELLE NE FAIT PAS : elle ne rouvre pas la vente de recharge par Zabelie
-- elle-même (`ZABELIE_TOPUP_FIRSTPARTY_ENABLED` inchangé, `/rechaj` redirige
-- toujours). Elle ne touche pas à l'interdiction de revendre du SOLDE MonCash
-- ou NatCash, qui reste sur `/produits-interdits`.
--
-- ⚠️ CE QUI RESTE À FAIRE, et que le porteur porte : l'avis juridique sur la
-- revente de crédit télécom par un tiers, et la phrase — FR et KR — qui sépare
-- « rechaj / minit » de « vann balans » sur `/produits-interdits`. D-7 est
-- tranchée dans son volet commercial ; le réglementaire reste ouvert, et
-- c'est écrit dans `docs/02-DECISIONS.md`.
-- ============================================================================

-- ── 0. Registre : 0097 ───────────────────────────────────────────────────────
-- `sha256` = empreinte CANONIQUE (`scripts/zabelie-migration-hash.mjs`). La
-- `note` porte le croisement brut (méthode 0086) relevé après application.
insert into zabelie_schema_migrations
  (filename, sha256, applied_at, applied_by, statut, preuve, note)
values
  ('0097_rechaj_vendeur_dormant_registre_0096.sql',
   '1a557024cd305ca5e11b8408511398047cdecf249b79ab1d8ba38f90abcb64b5',
   '2026-09-05 19:56:05+00',
   'porteur — « rajoute la section » du 2026-09-05 (autorisation permanente du 2026-08-17), appliquee par agent via MCP apres fusion de la PR #216 (CI verte, merge 49e0f5d)',
   'appliquee', 'journal_supabase',
   'Deux sous-rayons de recharge (rechaj-digicel, rechaj-natcom) semes DORMANTS '
   'sous rechaj-telefon ; ligne de registre de 0096. Mesure apres : 584 rayons, '
   '2 enfants, 0 actif, parent ferme. Empreinte croisee (methode 0086) : '
   'SHA-256 BRUT du fichier de main sans saut de ligne final = statements[1] du '
   'journal (version 20260905195605) = '
   'e027cfcc343a3f5d63cf9d7eca667d6d35818eb4d6ee333c6bf7068b40d92166.')
on conflict (filename) do nothing;

-- ── 1. La colonne ────────────────────────────────────────────────────────────
alter table products
  add column if not exists category_id uuid references zabelie_categories (id) on delete restrict;

create index if not exists products_category_id_idx on products (category_id);

comment on column products.category_id is
  'Sous-rayon (niveau 2 ou 3 de zabelie_categories), pour tout type de produit '
  '(0098). Null = la fiche s''arrete au departement porte par `category`. Pour '
  'un physique, recopie de zabelie_physical_products.category_id.';

-- ── 2. Backfill depuis le physique ───────────────────────────────────────────
-- Idempotent : ne touche que les lignes encore nulles.
update products p
   set category_id = pp.category_id
  from zabelie_physical_products pp
 where pp.product_id = p.id
   and p.category_id is null;

-- ── 3. La section « Recharge » s'ouvre ───────────────────────────────────────
update zabelie_categories
   set active = true
 where slug in ('rechaj-telefon', 'rechaj-digicel', 'rechaj-natcom')
   and not active;

-- ── Post-conditions ──────────────────────────────────────────────────────────
do $$
declare
  v_col        boolean;
  v_fk         boolean;
  v_physiques  integer;
  v_recopies   integer;
  v_ouverts    integer;
  v_parent     boolean;
begin
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'products' and column_name = 'category_id'
  ) into v_col;
  if not v_col then
    raise exception '0098 KO: products.category_id absente' using errcode = 'ZB098';
  end if;

  select exists (
    select 1 from pg_constraint c
     where c.conrelid = 'public.products'::regclass and c.contype = 'f'
       and c.confrelid = 'public.zabelie_categories'::regclass
  ) into v_fk;
  if not v_fk then
    raise exception '0098 KO: cle etrangere products.category_id -> zabelie_categories absente'
      using errcode = 'ZB098';
  end if;

  -- Le backfill : chaque physique doit désormais porter son sous-rayon sur
  -- `products`, égal à celui de son extension. Zéro écart toléré.
  select count(*) into v_physiques from zabelie_physical_products;
  select count(*) into v_recopies
    from zabelie_physical_products pp join products p on p.id = pp.product_id
   where p.category_id = pp.category_id;
  if v_recopies <> v_physiques then
    raise exception '0098 KO: % physique(s) sur % sans sous-rayon recopie', v_physiques - v_recopies, v_physiques
      using errcode = 'ZB098';
  end if;

  -- L'ouverture : les trois, ni plus ni moins, et le parent avec.
  select count(*) into v_ouverts
    from zabelie_categories
   where slug in ('rechaj-telefon', 'rechaj-digicel', 'rechaj-natcom') and active;
  if v_ouverts <> 3 then
    raise exception '0098 KO: % rayon(s) de recharge actif(s), 3 attendus', v_ouverts
      using errcode = 'ZB098';
  end if;
  select active into v_parent from zabelie_categories where slug = 'dijital-sevis';
  if not coalesce(v_parent, false) then
    raise exception '0098 KO: le departement Digital & services est inactif — les rayons de recharge seraient orphelins'
      using errcode = 'ZB098';
  end if;

  if (select count(*) from zabelie_schema_migrations
       where filename = '0097_rechaj_vendeur_dormant_registre_0096.sql'
         and statut = 'appliquee' and preuve = 'journal_supabase') <> 1 then
    raise exception '0098 KO: ligne de registre de 0097 non conforme' using errcode = 'ZB098';
  end if;

  raise notice '0098 OK: products.category_id posee, % physique(s) recopie(s), 3 rayons de recharge ouverts, registre 0097 inscrit', v_recopies;
end $$;
