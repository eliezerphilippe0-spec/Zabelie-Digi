select zabelie_migration_garde('0101_compte_essai.sql');

-- ============================================================================
-- 0101 — Un compte d'essai peut tout faire, sauf être vu
-- ============================================================================
-- LA CAUSE, restée ouverte après `0100`. Rien ne séparait les données d'essai
-- des données publiques : le compte de test du porteur publiait DIRECTEMENT
-- dans le catalogue en ligne, et aucune marque ne le distinguait. C'est ce qui
-- a fait lire trois essais comme un inventaire — y compris par l'agent, qui a
-- écrit dans `docs/49` qu'il restait « une offre crédible ». `0100` a retiré
-- les trois fiches ; il restait à empêcher que ça recommence au prochain test.
--
-- ─── LE DESSIN, ET L'OBJECTION QUI L'A CHANGÉ ───────────────────────────────
-- Premier réflexe : interdire à un compte d'essai de PUBLIER. Mauvais dessin —
-- un compte d'essai qui ne peut pas publier ne sert plus à tester la
-- publication, c'est-à-dire à ce pour quoi il existe.
--
-- Le bon dessin sépare deux questions qu'on confondait : « le vendeur peut-il
-- publier ? » (oui, toujours) et « le PUBLIC voit-il sa fiche ? » (non, s'il
-- est d'essai). Un compte d'essai parcourt donc le tunnel entier — publier,
-- payer, remettre — et n'apparaît nulle part.
--
-- ─── POURQUOI DANS LA RLS, ET NULLE PART AILLEURS ───────────────────────────
-- Mesuré avant d'écrire : **41 sites lisent `products`**, dont 19 filtrent sur
-- `status = 'published'`. Ajouter un filtre à chacun serait exactement
-- l'artefact adressé par CHAÎNE que `CLAUDE.md` dit de ne jamais confier à la
-- vigilance : la 42ᵉ lecture, écrite dans six mois, l'oublierait, et rien ne
-- le signalerait — la fiche d'essai réapparaîtrait simplement.
--
-- La policy `products_public_read_published` est le SEUL endroit où se décide
-- ce que le public voit. Elle portait déjà `status = 'published' AND
-- seller_is_active(seller_id)`. Elle porte désormais un troisième terme. Aucune
-- requête de l'application ne change — les 41 sites sont couverts, ceux
-- d'aujourd'hui comme ceux de demain, parce que la base refuse la ligne avant
-- que le code la demande.
--
-- ─── PAS DE SECONDE SOURCE DE VÉRITÉ ────────────────────────────────────────
-- La marque vit sur le COMPTE, pas recopiée sur chaque fiche. Une colonne
-- `products.is_test` maintenue par trigger aurait évité un appel de fonction
-- par ligne, au prix d'une valeur qui peut DÉRIVER de sa source — le défaut
-- que `0099` a refusé pour l'opérateur d'une recharge, pour la même raison.
--
-- `zabelie_vendeur_essai` calque exactement `seller_is_active` : `stable`,
-- `security definer`, `search_path` épinglé, exécutable par `anon`. Ces trois
-- propriétés ne sont pas décoratives — une policy est évaluée SOUS L'IDENTITÉ
-- DE L'APPELANT, donc `anon` doit pouvoir exécuter la fonction, et la fonction
-- doit franchir la RLS de `profiles` sans récursion. Sa garde est la même que
-- celle de sa jumelle : elle ne rend qu'un booléen déjà impliqué par ce que le
-- catalogue montre.
-- ============================================================================

-- ── 0. Registre : 0100 ───────────────────────────────────────────────────────
insert into zabelie_schema_migrations
  (filename, sha256, applied_at, applied_by, statut, preuve, note)
values
  ('0100_retirer_fiches_essai.sql',
   '9a19111a618702756af67f731bbbfdab8c999a994fc4775423a9049a46f3bb54',
   '2026-09-06 19:42:20+00',
   'porteur — « tu peux eliminer tous les faux comptes » puis « Fusionne et applique » du 2026-09-06 (autorisation permanente du 2026-08-17), appliquee par agent via MCP apres fusion de la PR #225 (CI verte, merge 7d2db72)',
   'appliquee', 'journal_supabase',
   'Les trois fiches publiees du compte d''essai passent en archived. Mesure '
   'avant/apres : publiees 3 -> 0, archivees 0 -> 3, et INTACTS commandes 15, '
   'paiements 15, ecritures de grand livre 1, profils 4 (invariant 0033 : '
   'ecart 0). Les comptes n''ont PAS pu etre supprimes : orders.buyer_id et '
   'orders.product_id sont en RESTRICT, et zabelie_wallet_ledger_immutable '
   'fait echouer la chaine profil -> portefeuille -> grand livre. Empreinte '
   'croisee (methode 0086) : SHA-256 BRUT du fichier de main sans saut de '
   'ligne final = statements[1] du journal (version 20260906194220) = '
   '52a71ba0f9002436417cc00eae95ce5f52b8ef93ed0e7dac101fdc866e749938.')
on conflict (filename) do nothing;

-- ── 1. La marque ─────────────────────────────────────────────────────────────
alter table profiles
  add column if not exists is_test boolean not null default false;

comment on column profiles.is_test is
  'Compte d''ESSAI (0101). Il peut tout faire — publier, acheter, remettre — '
  'mais ses fiches sont invisibles du public : la policy '
  'products_public_read_published les exclut. Se pose et se retire par UPDATE. '
  'Marquer un compte n''archive PAS ses fiches deja publiees : elles cessent '
  'simplement d''etre visibles, et redeviennent visibles si la marque tombe.';

-- ── 2. La question, posée là où la policy peut l'entendre ────────────────────
create or replace function zabelie_vendeur_essai(p_seller uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_test from profiles where id = p_seller), false);
$$;

comment on function zabelie_vendeur_essai(uuid) is
  'Vrai si le vendeur est un compte d''essai (0101). SECURITY DEFINER et '
  'executable par anon POUR LA MEME RAISON que seller_is_active : une policy '
  'RLS s''evalue sous l''identite de l''appelant, et doit franchir la RLS de '
  'profiles sans recursion. Ne rend qu''un booleen deja implique par ce que le '
  'catalogue montre. Un vendeur INCONNU rend false — fail-open assume : on ne '
  'cache pas une fiche parce qu''un profil manque, on la cache parce qu''il '
  'est marque.';

grant execute on function zabelie_vendeur_essai(uuid) to anon, authenticated;

-- ── 3. Le seul endroit qui décide de ce que le public voit ───────────────────
-- `alter policy` et non `drop` + `create` : atomique, et sans fenêtre pendant
-- laquelle la table serait lisible sans condition.
alter policy products_public_read_published on products
  using (
    status = 'published'
    and seller_is_active(seller_id)
    and not zabelie_vendeur_essai(seller_id)
  );

-- ── 4. Les deux comptes d'essai connus ───────────────────────────────────────
-- Bebeto et Ruby, créés le MÊME JOUR (2026-08-04) : la paire vendeur/acheteur
-- des essais du porteur. Par identifiant, jamais par libellé — un vrai vendeur
-- peut un jour s'appeler comme un compte d'essai.
--
-- ⚠️ Les deux comptes portant le nom du porteur ne sont PAS marqués : lequel
-- des deux est son compte de connexion n'a pas été tranché, et marquer le
-- mauvais rendrait ses futures fiches invisibles sans qu'aucune erreur ne le
-- dise. Marquer trop peu se corrige par un UPDATE ; marquer trop se découvre
-- par un silence.
update profiles set is_test = true
 where id in ('2eedc070-8dc9-4f84-8006-e15b7564d3e8',   -- Bebeto (vendeur d'essai)
              '973ce999-032b-4a07-82ad-9dd0832cd66c')   -- Ruby (acheteur d'essai)
   and not is_test;

-- ── Post-conditions ──────────────────────────────────────────────────────────
do $$
declare
  v_colonne  boolean;
  v_cond     text;
  v_marques  integer;
  v_vrai     boolean;
  v_faux     boolean;
  v_inconnu  boolean;
begin
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_test'
  ) into v_colonne;
  if not v_colonne then
    raise exception '0101 KO: profiles.is_test absente' using errcode = 'ZB101';
  end if;

  -- La policy porte bien le troisième terme. C'est LE point : sans lui, tout
  -- le reste de cette migration est décoratif.
  select pg_get_expr(polqual, polrelid) into v_cond
    from pg_policy where polrelid = 'public.products'::regclass
     and polname = 'products_public_read_published';
  if v_cond is null or v_cond not like '%zabelie_vendeur_essai%' then
    raise exception '0101 KO: la policy publique n''exclut pas les comptes d''essai (%)', v_cond
      using errcode = 'ZB101';
  end if;
  -- Et elle n'a PAS perdu les deux termes qu'elle portait déjà.
  if v_cond not like '%seller_is_active%' or v_cond not like '%published%' then
    raise exception '0101 KO: la policy a perdu une garde preexistante (%)', v_cond
      using errcode = 'ZB101';
  end if;

  /* La fonction répond dans LES DEUX SENS. Une fonction qui rendrait `true`
     partout viderait le catalogue ; une qui rendrait `false` partout ne
     cacherait rien — et les deux passeraient une sonde à un seul cas.

     ⚠️ Formulé SANS identifiant de production. La première version interrogeait
     l'uuid de Bebeto : juste en production, faux en CI où ce compte n'existe
     pas, et la migration y échouait. Même leçon que `0100` — une assertion
     doit dire la même vérité dans les deux mondes, sinon elle n'en garde
     qu'un. Le cas « inconnu » est le seul universel ; les deux autres sont
     conditionnels, et le connu-positif COMPLET vit dans
     `supabase/tests/compte_essai.test.sql`, qui crée ses propres lignes. */
  select zabelie_vendeur_essai('00000000-0000-0000-0000-000000000000') into v_inconnu;
  if v_inconnu is not false then
    raise exception '0101 KO: un vendeur inconnu rend % (attendu false)', v_inconnu
      using errcode = 'ZB101';
  end if;

  select coalesce(bool_and(zabelie_vendeur_essai(id)), true) into v_vrai
    from profiles where is_test;
  if not v_vrai then
    raise exception '0101 KO: un compte marque d''essai n''est pas reconnu par la fonction'
      using errcode = 'ZB101';
  end if;

  select coalesce(bool_or(zabelie_vendeur_essai(id)), false) into v_faux
    from profiles where not is_test;
  if v_faux then
    raise exception '0101 KO: un compte ORDINAIRE est pris pour un compte d''essai'
      using errcode = 'ZB101';
  end if;

  select count(*) into v_marques from profiles where is_test;
  raise notice '0101 OK: policy publique a trois termes, fonction repond vrai/faux, % compte(s) d''essai marque(s), % profil(s) ordinaire(s) presents',
    v_marques, (select count(*) from profiles where not is_test);
end $$;
