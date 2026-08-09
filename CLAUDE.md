# CLAUDE.md — Zabelie

Version condensée « toujours en contexte ». Le détail est dans `docs/`.

## C'est quoi
**Zabelie** = **marketplace haïtienne** — produits **physiques**, produits
**digitaux** et **talents**, avec paiement **mobile money haïtien** et registre
vendeur. Marché : **Haïti** + **diaspora**. Terrain : Android d'entrée de
gamme, bande passante faible, coupures fréquentes.

**Naming (tranché, 2026-07-24)** : le nom officiel et UNIQUE est « **Zabelie** ».
« Zabelie Digi » est **éliminé**. Le repo GitHub `uniondigitale` est une
étiquette technique **à renommer** par le porteur.

⚠️ **Ne jamais écrire « Zabely »** à la place de « Zabelie ». En revanche
`zabely` / `zabelie` coexistent dans les **identifiants techniques** existants :
**aucun grep-replace global**.

⚠️ **Piège de renommage** : ne jamais remplacer la sous-chaîne `Digi` seule —
**`Digicel`** est l'opérateur télécom partenaire (MonCash, recharge). Ne
remplacer que la chaîne exacte `Zabelie Digi`.

### Décision d'identité (2026-07-24)
Ce repo **est** Zabelie. Règle appliquée : *on garde le repo qui porte
l'infrastructure financière* (ledger append-only, RLS, triple vérification des
montants, 34 migrations, tests money-path, Stripe intégré). L'ancienne règle
d'indépendance vis-à-vis d'un « projet 1 » est **caduque** : il n'y a plus
qu'un seul projet Zabelie. → `docs/18-SPEC-BUILD-V1.md` §4.1.

## Stack
Next.js (App Router, TS, Tailwind) + Supabase (Postgres/Auth/Storage/RLS) +
Vercel (dont crons). **Aucun service externe non listé sans validation** —
notamment **pas de fournisseur SMS**. Design : **Higgsfield** pour les visuels.

## Règles dures (ne jamais enfreindre)
1. **Paiement — 3 invariants** : (a) idempotence garantie **en base** ;
   (b) confirmation **serveur-à-serveur** obligatoire (jamais le retour
   navigateur seul) ; (c) **réconciliation** totale, aucun paiement orphelin.
   → `docs/03-PAIEMENTS.md`.
2. **Dépendances bloquantes** : MonCash ✅ · Stripe ✅ construit (⚠️ exige une
   entité étrangère *merchant of record*) · Zelle ✅ semi-manuel ·
   **NatCash ⛔** (aucune API publique) · **BRH ⛔**. Ne pas coder un rail qui
   ne peut pas exister. **Tout nouveau rail passe par la checklist
   `docs/03-PAIEMENTS.md` §9** (étape 0 éliminatoire : prouver que l'API existe).
3. **Argent** : tout calcul de prix est **serveur**. Tout paramètre commercial
   (commission, plafonds, seuils, taux de change) vit en **table de config**,
   jamais en dur. Commission **10 % / 6 % Elite**, maturation **J+7**. Montants
   en entiers, jamais en flottant.
4. **Base** : préfixe `zabelie_` pour tout nouvel objet · **RLS dès la
   création** · aucune fonction `SECURITY DEFINER` exposée à `anon` sans garde ·
   ledger **append-only** protégé par trigger · migrations à la suite
   (dernière écrite : **`0053`**. **État MESURÉ en base le 2026-08-04** — registre
   ET catalogue croisés, concordance totale ; les états précédents reposaient sur
   le journal de session, faute d'accès Postgres.
   **Appliquées** : groupe A + B1, `0039`, `0041`, `0042`, `0045`→`0050`, et
   **`0044`** (D-4 `floor`, 2026-08-03).
   **Non appliquées, et leur absence est attestée** : `0031` (fidélité,
   volontairement sautée) · **B2** `0037`/`0038`/`0040` — `products.in_stock`
   n'existe pas, prérequis à l'ouverture de la vente physique · `0043`
   (`zabelie_shipments` absente, trois valeurs à arbitrer, `docs/21`) ·
   `0051`/`0052` (`categories.label_es` absente) · `0053`
   (`retention_days` vaut encore 180).
   ⚠️ Le repli de `lib/products.ts` sur `in_stock` est **actif en production**,
   observé dans les journaux d'API : chaque page catalogue fait un 400 puis
   rejoue sans le filtre. C'est la dégradation prévue, pas une panne — elle
   cessera avec B2. Registre : `zabelie_schema_migrations`.)

## Registre vendeur — invariant comptable (0033)
```
Σ(wallet_transactions) = wallets.balance_htg + wallets.pending_htg
```
Vrai après **chaque** opération d'argent. Tout écart = un solde qui a bougé
hors du grand livre. Contrôlé quotidiennement (`/api/admin/coherence`).
**Toute nouvelle écriture sur un solde doit préserver cette identité** — une
correction se fait par **écriture compensatoire**, jamais par modification du
grand livre. → `docs/19-CHANTIER-0-RETRAIT-VENDEUR.md`.

## Conformité BRH — Circulaire 121
Le registre Zabelie est un **registre comptable**, pas un instrument de
paiement. **Aucun cash-in, cash-out, ni P2P.**

⚠️ **Dossier juridique ouvert, sans réponse à ce jour** : la plateforme
encaisse sur un **compte marchand unique** (fonds vendeurs et revenus
plateforme **mêlés**, aucun cantonnement) et retient le net vendeur jusqu'au
règlement. La voie de sortie existe depuis le chantier 0, mais la
**qualification reste à trancher par un conseil**.
→ `docs/17-DOSSIER-BRH-RETENTION.md`. Ne rien construire qui **aggrave** la
rétention sans avis écrit.

## Topup — recharge téléphonique (V-11)
Service **first-party** de revente de recharge **Digicel/Natcom**
(`app/rechaj`, `lib/zabelie-topup/`, migration `0010`). Cadre **BRH Circ. 121,
non négociable** : Zabelie = **revendeur télécom, jamais émetteur de monnaie
électronique**. Interdits absolus (REFUSER si demandé) : solde rechargeable
acheteur, P2P, cash-in/cash-out, remboursement vers un solde interne (moyen
d'origine uniquement + checkpoint humain), montants en float, prix venant du
client. Ledger `zabelie_topup_ledger` **append-only** (trigger). Fournisseur :
Reloadly (adapter pattern), idempotence transmise au fournisseur
(customIdentifier = order.id). Plafonds : 5 000 HTG/tx · 25 000 HTG/j ·
5 bénéficiaires/h (configurables en base). → `docs/07-TOPUP.md`.

## Points de fidélité — non monétaires (vérifié 2026-07-24)
Système en base (`0021`, `0031`) mais **débranché** : aucune attribution,
aucune UI, **aucun point jamais émis**. Non convertibles en valeur : seule
sortie = remise **en pourcentage** (`coupon_type` mono-valeur), non
achetables, non transférables, non remboursables, expirants (90 j, plafond
180), solde plafonné. **4 garde-fous normatifs** →
`docs/CASHBACK-GARDE-FOUS.md`. ⛔ **Bloqué par D-6** : les garde-fous disent ce
qu'un point *est*, aucun ne dit ce qu'une remise *coûte ni à qui*. En l'état,
une remise de points réduirait `orders.amount_htg`, donc le net du **vendeur**
— il financerait la rétention de la plateforme sans l'avoir choisie. Ne pas
câbler l'attribution ni l'UI avant arbitrage porteur ; garde en place :
`tests/fidelite-discipline.test.ts`.

## Documents
- `docs/00-CONTEXTE.md` · `01-PRD.md` · `02-DECISIONS.md`
- `docs/03-PAIEMENTS.md` — architecture paiement **+ §9 checklist nouveau rail**
- `docs/04-DEPLOIEMENT.md` · `07-TOPUP.md` · `11-SECRETS.md` (registre des clés)
- `docs/15-CHANTIER-A-INVENTAIRE.md` — inventaire du rebrand
- `docs/16-TAXONOMIE-CATALOGUE.md` — 16 départements, activation par vagues
- `docs/17-DOSSIER-BRH-RETENTION.md` — ⚠️ dossier juridique ouvert
- `docs/18-SPEC-BUILD-V1.md` — **spécification autoritaire du chantier en cours**
- `docs/19-CHANTIER-0-RETRAIT-VENDEUR.md` — voie de sortie vendeur
- `docs/CASHBACK-GARDE-FOUS.md` · `REVUE-2026-07-22-rails-paiement.md`
- `docs/21-EXPEDITION-ET-REMISE.md` — état d'expédition (`0043`, non appliquée)
- `docs/22-PREMIERE-COMMANDE-REELLE.md` — ⭐ le seul essai qui manque
- `docs/25-BOUCLE-DE-TRAVAIL.md` — **la boucle de travail** (§2 les huit
  contrôles, §4 les zones d'arrêt, §7.1 le journal des chantiers)
- `OPS_TODO.md` — actions opérationnelles porteur + écarts de réconciliation

## Méthode
→ **`docs/25-BOUCLE-DE-TRAVAIL.md`** porte la boucle complète. Trois choses
en tête : rien ne démarre sans **objectif vérifiable, arrêt ferme, périmètre**
(§0) ; **une seule mutation par tour** (§1) ; et la boucle **s'arrête net**
devant argent, migration à appliquer, variable d'environnement, promesse
commerciale, positionnement, dépense, merge (§4) — analyse et options, jamais
trancher. Ce qui est rendu au porteur s'inscrit au **registre en tête
d'`OPS_TODO.md`**, relu à l'ouverture de chaque chantier.

Un chantier à la fois, dans l'ordre de `docs/18` §11. Tests écrits avec le
code. Migration rédigée **non appliquée** tant que le porteur ne l'a pas
exécutée. Signaler toute contradiction plutôt que trancher seul ; demander
plutôt qu'inventer une règle métier, **surtout financière**.

**Toute PR ouverte se donne avec son lien cliquable**, systématiquement et sans
qu'on le demande — le numéro seul oblige à aller le chercher. Idem quand
plusieurs attendent : la liste des liens, dans l'ordre de fusion.

**Le point de contrôle humain est la PR, jamais le commit.** Un hook `Stop`
du dépôt exige de commiter et pousser tout travail en cours : « montre-moi
avant de commiter » n'est donc pas un contrôle disponible ici. Un commit sur
une branche de travail n'engage rien — la revue se fait sur la PR, et une
correction se fait par un commit de plus, pas par un retour arrière. Marquer
en tête de message les commits qui attendent un arbitrage.

### Un instrument non éprouvé ne prouve rien
Quatre fois dans le chantier B, l'outil de vérification a menti : des fixtures
SQL qui encodaient le bug (suite verte confirmant le mensonge), un serveur
recyclé qui a fait passer une vérification par mutation, un `union all` dont
toutes les branches partagent l'instantané — « après » relisait l'état d'avant.
Le motif est constant : **le code de vérification est écrit une fois, sous
pression, et n'est jamais vérifié lui-même.**

Règle : **toute sonde, tout harnais, tout test de garde doit être passé sur un
cas connu-positif ET un cas connu-négatif avant qu'on lui fasse confiance.**
Concrètement — retirer le garde et voir le test échouer ; amputer les données
et voir la sonde le dire. Un instrument qui n'a jamais échoué n'a pas encore
démontré qu'il pouvait.

#### La mutation qui n'a pas muté — assurer la post-condition, pas la vérifier

Quatre fois dans la session du 2026-08-01/02, une mutation destinée à éprouver
un test **n'a pas été appliquée** : ancre écrite avec des guillemets simples au
lieu de doubles, `\n` passé littéralement par le shell, désalignement d'espaces
dans un fichier SQL aligné en colonnes. À chaque fois la commande a rendu un
succès, la suite est restée verte, et ce vert a été lu comme « le test résiste
à la mutation » alors qu'il signifiait « le fichier n'a pas changé ».

C'est le même défaut que les fixtures qui encodaient le bug : **l'instrument
ment, et son mensonge ressemble exactement à une réussite.** « pass 0 » n'est
pas non plus « le test a échoué » — c'est souvent « le fichier ne compile
plus ».

Règle : **toute édition programmatique assure sa post-condition avant qu'on
lise quoi que ce soit d'autre.** Pas « vérifier ensuite » — une assertion qui
échoue, dans le même geste :

* `assert s.count(ancre) == 1` **avant** de remplacer — zéro occurrence et dix
  occurrences sont deux fautes différentes, toutes deux silencieuses ;
* après écriture, relire la zone et assurer que la modification y est ;
* pour une mutation de test : afficher la ligne mutée avant de lancer la suite.

La vigilance ne suffit pas ici, et c'est précisément la leçon : quatre
occurrences en une session, par quelqu'un qui connaissait le piège dès la
deuxième.

#### Le drapeau qui filtre et le drapeau qui agit portent le même nom

`npm audit fix --omit=dev` ne filtre pas l'audit : il **réinstalle** sans les
dépendances de développement. `@types/react` a disparu, `tsc` s'est mis à
écrire « Cannot find namespace 'React' », et les tests chargés sont tombés à
0 succès sur 14 — le correctif de sécurité avait l'air d'avoir cassé le
projet. C'était le drapeau.

Règle : **avant d'ajouter un drapeau à une commande qui MODIFIE quelque chose,
vérifier ce qu'il fait à la commande, pas à sa sortie.** Le même `--omit=dev`
est inoffensif sur `npm audit` (il filtre un rapport) et destructeur sur
`npm audit fix` (il réinstalle). Vérifier avant, pas après.

C'est la troisième forme du même défaut dans une seule session, et c'est la
classe dominante de ce projet : la mutation qui rend un succès sans avoir
modifié le fichier, le taux périmé qui produit une confirmation au lieu d'une
erreur, la commande qui réussit en ayant fait autre chose que ce que son nom
annonce. **Le point commun n'est pas l'échec — c'est que l'échec se présente
comme une réussite.**

Corollaire d'observabilité : **l'absence de signal doit être un signal.** Une
branche par défaut journalise ce qu'elle a reçu (`lib/product-kind.ts`) ; un
cron journalise chaque passage, y compris à zéro (`app/api/stock/expire`).
Sinon « n'a pas tourné » et « a tourné, rien trouvé » produisent le même vide.

#### Le code sans appelant — croiser, parce que rien ne le signalera

`zabelie_purge_search_misses()` est née avec `0047` : correcte, révoquée,
journalisant même à zéro. **Sans aucun appelant.** Ses deux seules invocations
du dépôt étaient dans `supabase/tests/search_demand.test.sql`. La suite SQL
était verte, la purge était *prouvée*, et elle n'avait jamais tourné une fois.
Quatre mois de rétention non bornée seraient passés en silence — parce que
migration, tests et revue regardaient tous **la fonction**, et rien ne
regardait **l'endroit d'où elle devait être appelée**.

Le motif se généralise : un artefact jamais invoqué ne lève rien, ne
journalise rien, ne ralentit rien. Son défaut est invisible *par nature* — le
corollaire d'observabilité ci-dessus ne l'attrape pas, puisqu'il n'y a même pas
de passage à journaliser. Seule une **vérification croisée entre deux endroits
du dépôt** le rend visible.

Règle : **tout artefact dont l'appelant vit ailleurs se croise
mécaniquement avec la liste de ses appelants, et l'absence d'appelant
échoue.** Premier cas câblé : `tests/crons-appelants.test.ts` croise les
fonctions de maintenance (`purge|expire|sweep|mature|reconcil|_job`) de
`supabase/migrations/` avec les RPC appelées par les routes déclarées dans
`vercel.json` → `crons`.

Deuxième cas câblé, et le plus coûteux : `tests/i18n-cles-mortes.test.ts`
croise les clés de `lib/i18n.ts` avec leurs sites d'appel. `home.cta.sell` et
`nav.logout` étaient traduites dans quatre langues sans aucun appelant — le
bouton vendeur avait disparu du hero (le `h1` acheteur restait seul au-dessus
d'une page entièrement vendeur, ce qui se lisait comme un choix de
positionnement à trancher), et `sign-out-button.tsx` affichait « Déconnexion »
**en dur** à un utilisateur kreyòl. `Record<I18nKey, string>` vérifie que chaque
langue porte chaque clé, jamais qu'une clé atteint un écran.

Deux points qui font la différence entre ce contrôle et un vœu :

* **Les exemptions se périment dans les deux sens.** Une liste qui ne sait que
  grandir devient une conformité par usure. Le test échoue donc aussi quand une
  fonction exemptée a *gagné* un appelant.
* **Un appelant n'est pas une exécution.** Ce croisement prouve que le code
  existe, pas que le cron tourne — secret absent, déploiement non promu, projet
  dont les crons sont désactivés le laissent vert. La preuve d'exécution est le
  journal de la route, et elle se lit dans Vercel. Les deux sont nécessaires.

#### `\b` ne connaît pas le kreyòl — propriété du produit, pas leçon d'un tour

En JavaScript, `\w` vaut `[A-Za-z0-9_]` : **les lettres accentuées ne sont pas
des caractères de mot.** Une frontière `\b` posée contre `è`, `é`, `ò`, `ô`
tombe donc du mauvais côté et le motif ne s'applique pas.

⚠️ **Et le piège est pire qu'un accent qui casse tout** — mesuré, pas déduit :

```js
/\bvandè\b/.test("vandè")                      // false  ← accent EN FRONTIÈRE
/\bvérifiés\b/.test("vendeurs vérifiés près")  // true   ← accent AU MILIEU
/\bmachann\b/.test("machann nan")              // true   ← sans accent
```

Seules les frontières **contre** un accent tombent. Un motif accentué marche
donc la plupart du temps, et échoue précisément sur les mots dont l'accent est
au bout — `vandè`, `sètifye`, `bagay yo`. Un contrôle mixte semble
fonctionner, et son unique trou est invisible.

Ce que ça donne, mesuré : le détecteur de `tests/promesse-vendeur.test.ts` a
été aveugle à « Vandè verifye toupre w » — c'est-à-dire **exactement en kreyòl,
la langue de référence du produit**, tout en fonctionnant parfaitement en
anglais. Sans cas connu-positif, il serait passé vert en ne voyant rien, et son
vert aurait été lu comme « aucune promesse non tenue ».

C'est le pire endroit possible pour un angle mort : un dépôt kreyòl-first dont
les instruments ne voient que l'anglais valide toujours la langue qui compte le
moins. Et rien ne le signale — le motif ne lève pas d'erreur, il ne trouve
simplement rien.

Règle : **toute expression régulière portant sur du texte d'interface se
vérifie sur une chaîne accentuée connue, en kreyòl et en français, avant qu'on
lui fasse confiance.** En pratique : remplacer `\b…\b` par
`(?<![\p{L}])…(?![\p{L}])` **avec les drapeaux `u` ET `i`** — vérifié, la
forme corrigée sans `i` rend encore `false` sur « **V**andè » à cause de la
seule majuscule. Puis poser l'assertion qui aurait échoué
(`tests/promesse-vendeur.test.ts` la porte pour les quatre langues).

**Choisir les cas de test à l'œil ne marche pas ici** — et c'est le même défaut
une couche plus haut. Un jeu constitué en repérant « des mots accentués »
contiendra surtout des `vérifiés`, des `sètifye`, des `sekirite` : tous
accentués, tous **passants**, et l'impression d'avoir couvert le sujet.

Le critère n'est pas « porte un accent », c'est **accent sur la dernière lettre,
ou sur la première** — les deux seules positions qui touchent une frontière :

* finale (fréquent en kreyòl) : `vandè`, `machandè`, `bò`, `lè`, `pè`, `dyò` ;
* finale en français : `café`, `marché`, `santé`, `côté`, `déjà`, `là`, `où` ;
* initiale (plus rare, réel) : `èske`, `élève`, `être`.

Ces listes ont été **exécutées**, pas composées : la première version portait
`journée`, qui PASSE — son accent est au milieu, le `e` final est nu. Idem
`forêt` et `année`. La faute a été commise en rédigeant la règle qui la
décrit, ce qui dit assez qu'on ne s'en protège pas par attention.

La liste est bien plus courte qu'elle n'en a l'air, et c'est exactement ce qui
la rend facile à manquer.

Vaut aussi pour `\w`, `[a-z]` et toute classe écrite en ASCII sur des données
qui ne le sont pas.

### `product_kind` — le module est obligatoire
Comparer un type de produit **hors de `lib/product-kind.ts`** est interdit et
vérifié par `tests/product-kind-discipline.test.ts`. Raison : ajouter une
valeur à l'union ne casse **aucune** compilation — un ternaire avec `else`
reste typé. Le compilateur n'énumère donc pas les sites, et un `grep` ne
prouve rien sur ce qu'il n'a pas trouvé. La garantie vient des `switch`
exhaustifs du module, pas du type. Toute valeur ajoutée à l'énumération SQL
doit l'être aussi dans `lib/sample-data.ts`, `lib/database.types.ts` et la
liste `KINDS` du test.
