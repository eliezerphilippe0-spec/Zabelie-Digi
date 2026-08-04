# Zabelie — Registre des décisions

> Suivi des décisions **verrouillées** (✅) et **ouvertes** (`[À CONFIRMER]`).
> Référencé par `00-CONTEXTE.md §13`.

---

## Décisions verrouillées ✅

| ID | Décision | Détail |
|----|----------|--------|
| V-1 | **Stack** | Next.js (App Router, TS, Tailwind) + Supabase (Postgres/Auth/Storage/RLS). |
| V-2 | **Rail paiement MVP** | MonCash uniquement. NatCash et BRH différés (dépendances bloquantes). |
| V-3 | **Idempotence** | Garantie au niveau base de données (contrainte d'unicité sur clé d'idempotence), pas seulement applicative. |
| V-4 | **Source de vérité paiement** | Webhook / vérification serveur-à-serveur, jamais le seul retour de redirection navigateur. |
| V-5 | **Réconciliation** | Réconciliateur + test « redirect coupé » dans les critères d'acceptation du module paiement. |
| V-6 | **Nommage** | `zabely` / `zabelie` coexistent. Aucun grep-replace global. |
| V-7 | **Design** | Higgsfield pour les visuels ; objectif plateforme ultra-moderne. |
| V-8 | **Distinction projets** | Zabelie (digital) ≠ Zabelie (physique, projet 1). |
| V-9 | **D-3 — Lien avec Zabelie 1** | **INDÉPENDANCE TOTALE (durci).** Zabelie est un projet à part : **aucune fusion** — comptes, wallet, schéma, code — avec Zabelie 1 ni aucun autre projet. La passerelle dormante `zabelie1_user_id` a été retirée (migration `0007_standalone.sql`). Ne pas réintroduire de couplage sans décision explicite du porteur. |
| V-10 | **Rails diaspora USD (Stripe + Zelle)** | Demande porteur (2026-07). Le **ledger reste en HTG** ; montant USD figé au checkout (`payments.expected_usd_cents`, taux `USD_HTG_RATE`) et vérifié **en base** par `confirm_payment`. Zelle = flux **semi-manuel** (pas d'API) : mémo + confirmation admin, même fonction idempotente. Stripe ⚠️ exige une **entité US** (Haïti non supporté marchand) — construit, activable en test. Ceci ne modifie PAS V-2 : MonCash reste le rail principal HTG ; NatCash/BRH toujours ⛔. Voir `03-PAIEMENTS.md` + migration `0009_rails_diaspora.sql`. |
| V-11 | **Recharge téléphonique (topup first-party)** | Demande porteur (2026-07). Zabelie = **revendeur** de recharge Digicel/Natcom, **jamais émetteur de monnaie électronique** (BRH Circ. 121). Décisions : Reloadly sandbox (P1, adapter pattern), rails HTG MonCash + USD Zelle (NatCash ⛔ inchangé), plafonds 5 000 HTG/tx · 25 000 HTG/j · 5 bénéf./h, marge ~5 %. Pipeline séparé du money-path marketplace ; ledger append-only ; remboursement moyen d'origine + checkpoint humain. Voir `07-TOPUP.md` + migration `0010_topup.sql`. |
| V-13 | **Barre de catégories de l'accueil — suppression, pas réparation** | Décision porteur (2026-07-26). Elle affiche six libellés **digitaux en dur** (Photo, Business, Musique, Design, Carrière, Marketing) sur une marketplace qui bascule vers le physique : elle n'annonce pas seulement des pages vides, elle annonce **le mauvais commerce**. La brancher sur `zabelie_categories` la ferait passer de six catégories fausses à seize catégories vides — donc la migration `0035` **ne débloque pas** cette barre. Ne pas rouvrir le sujet « barre alimentée par la taxonomie » avant qu'il existe une offre réelle à ranger dedans. Condition posée par le porteur : livrer d'abord un **état vide de recherche** utilisable. |
| V-14 | **Application des migrations — catalogue et money-path jamais dans le même lot** | Décision porteur (2026-07-26). `0037`/`0038`/`0040` remplacent `confirm_payment` et `refund_order` : les mêler au catalogue fait perdre la capacité de **dire ce qui a changé sur les flux financiers** le jour où un vendeur conteste un montant. Le groupe B est coupé en **B1** (`0035`·`0036`, aucun effet money-path — sert à **débloquer la saisie** des fiches, le formulaire vendeur lisant `zabelie_categories`) et **B2** (money-path, **revue séparée**, après exécution des versements manuels). Voir `20-APPLICATION-MIGRATIONS-0032-0038.md`. |
| V-16 | **Le taux Elite n'est plus annoncé tant que le palier n'a pas de porte** | Décision agent (2026-07-27). `tier` existe depuis `0005` et est **gelé côté client** par les triggers `0015`/`0017` (« pas d'auto-attribution elite ») ; vérifié le 2026-07-27 : **aucun chemin de code, aucun écran d'administration n'attribue `elite`**, et **aucun document ne dit ce qui y donne droit**. Annoncer « 6 % pour les vendeurs Elite » en FAQ était donc une promesse sans critère et sans porte — un vendeur qui demande comment y accéder n'obtient aucune réponse. Le taux est retiré de `faq.a3` (FR + KR) ; la colonne, l'enum et `rateBps` restent (un octroi manuel en back-office fonctionne, et l'estimation vendeur s'y adapte). **Réannoncer le 6 % suppose d'abord d'écrire qui y a droit** — règle commerciale, donc décision du porteur. |
| V-17 | **Zabelie est une marketplace pure — la vente de recharge en propre cesse** | **Décision porteur (2026-08-01).** Zabelie est un INTERMÉDIAIRE entre vendeurs vérifiés et acheteurs (modèle Amazon / Mercado Libre / Jumia / Etsy) : elle ne détient aucun stock et ne vend rien en son nom propre. La recharge téléphonique first-party (`/rechaj`, rail Reloadly, V-11) était la **seule** activité où Zabelie était marchand plutôt qu'intermédiaire — elle contredit le modèle, donc elle ferme. **Rien n'est supprimé** : drapeau `ZABELIE_TOPUP_FIRSTPARTY_ENABLED`, défaut `false`. Raison du drapeau plutôt que de la suppression : `0010` et `0029` sont **appliquées en production** et des commandes payées peuvent exister — le suivi et le remboursement restent ouverts. Supprimer coûterait 21 fichiers, 5 routes, 2 migrations, et ne serait pas réversible. **Pour renverser : poser le drapeau à `true`.** Garde : `tests/topup-firstparty-closed.test.ts`. |
| V-12 | **Tiers de commission — statu quo** | Décision porteur (2026-07) : **2 tiers** (standard 10 %, elite 6 %) avec **maturation J+7 uniforme** restent la référence. Le schéma « 4 tiers Starter/Standard/Pro/Elite (J+14/J+7/J+5/J+3) » évoqué en brief n'est PAS retenu ; y revenir serait une nouvelle décision + chantier financier dédié (PR à relecture humaine). |

---

## Décisions ouvertes `[À CONFIRMER]`

| ID | Question | Impact | Statut |
|----|----------|--------|--------|
| **D-1** | `[À CONFIRMER]` _(à préciser — issue de la synthèse)_ | — | Ouverte |
| **D-2** | `[À CONFIRMER]` _(à préciser — issue de la synthèse)_ | — | Ouverte |
| ~~**D-3**~~ | ~~Lien auth/wallet avec Zabelie 1~~ | **VERROUILLÉE → V-9.** Séparé, fusion possible plus tard. | ✅ Tranchée |
| **D-4** | **Sens de l'arrondi de la commission** | Commercial. `floor` — l'arrondi va au **vendeur**. Coût borné : ≤ 1 HTG par vente, 0,5 en moyenne. | ✅ **TRANCHÉE le 2026-08-03 par le porteur : `floor`.** Application de `0044` en cours. |
| **D-6** | **Qui paie la remise de fidélité ?** | Commercial + comptable. La commission porte sur `orders.amount_htg`, le prix **remisé**. Une remise de points y entrerait comme une autre : le **vendeur** financerait la rétention de la plateforme, sans l'avoir choisie ni le savoir. Sorties : commission sur le **prix affiché**, remise **supportée par Zabelie**, ou **participation choisie** par le vendeur. Aucun point n'a jamais été émis — la décision est encore gratuite. Garde : `tests/fidelite-discipline.test.ts`. | **Ouverte — en attente d'arbitrage porteur** |
| **D-7** | **Un vendeur vérifié peut-il vendre du crédit Digicel/Natcom ?** | Commercial + réglementaire. Distincte de V-17 : « Zabelie ne vend plus de minutes » ne dit **pas** « des vendeurs peuvent en vendre ». Un crédit télécom est un **bien**, pas de la monnaie électronique — la question est donc recevable, contrairement à la revente de solde MonCash/NatCash qui reste **interdite** (`docs/07-TOPUP.md` §3, `docs/17`). Ouverte par effet de bord de V-17 ; **volontairement non implémentée** et non tranchée. | **Ouverte — à ne pas ouvrir sans arbitrage porteur** |
| **D-5** | **Seuil zéro : faut-il une commission minimale de 1 gourde ?** | Commercial. ⚠️ **Un minimum de 1 HTG rétablit exactement ce que `floor` corrige** : sur une vente à 5 HTG il ramène le taux réel à **20 %**, au seul endroit où ça se voit — et il abîme le message (« l'arrondi vous revient, sauf qu'il y a un minimum » n'est plus une phrase de cinq mots). Le risque de découpage, lui, suppose que l'ACHETEUR passe vingt commandes et vingt paiements MonCash : personne ne le fera. | **Ouverte — DÉCLENCHEUR NOMMÉ : à trancher quand des articles sous 10 HTG apparaissent au catalogue, pas avant.** Contrairement à D-4, c'est une règle tarifaire ordinaire, qu'on annonce à l'avance ; elle ne se défend pas mal si elle arrive plus tard. |

### D-4 (OUVERTE) — l'arrondi penche systématiquement du côté de la plateforme

`commission = round(brut × bps / 10000)` : PostgreSQL arrondit le demi **vers
le haut**, donc 2,5 → 3. **La fraction va toujours à la plateforme, jamais au
vendeur.** Ce n'est pas un choix qui a été fait — c'est le défaut de `round()`
dont on a hérité, et c'est une règle qu'il faudra défendre une fois écrite.

Mesuré sur 1 → 5 000 HTG :

| | `round` (actuel) | `floor` (proposé) |
|---|---|---|
| Ventes où les deux diffèrent | **2 500 sur 5 000** (une sur deux) | — |
| Écart maximum par vente | **1 gourde** | — |
| Total sur ces 5 000 ventes | — | la plateforme cède **2 500 HTG**, soit 0,5 en moyenne par vente |
| 25 HTG | commission 3 → **12 %** | commission 2 → **8 %** |
| 5 HTG | commission 1 → **20 %** | commission 0 → **0 %** |
| 50 HTG et au-delà (multiples de 10) | identiques | identiques |

**Argument pour `floor`** : « l'arrondi vous revient » s'explique en cinq mots
à un vendeur ; « on arrondit au plus proche, donc parfois en notre faveur » se
défend moins bien. Le coût maximal est d'**une gourde par vente**.

**Argument pour `round`** : c'est l'état actuel, et le taux affiché est plus
proche du taux réel en moyenne.

**Aucune conséquence sur le registre** dans les deux cas : `net = brut −
commission` par soustraction, donc l'identité de `0033` tient quel que soit
l'arrondi. C'est bien une décision **commerciale**, pas technique — d'où
l'arbitrage plutôt qu'un correctif.

**Statut : ✅ TRANCHÉE le 2026-08-03 — `floor`, par le porteur, explicitement
(« go floor »).** La recommandation de l'agent et la décision coïncident, mais
ce sont deux choses distinctes et le registre note laquelle est laquelle.
Bascule en trois gestes, **et l'ordre est la protection** : (1) `0044`
appliquée en base, (2) `ROUNDING_IN_FORCE` passée à `"floor"`, (3)
redéploiement. Dans cet ordre l'intervalle donne au vendeur **plus** que ce
qui lui est annoncé ; dans l'autre on lui promet une gourde qu'on ne verse
pas. Contrôle mécanique de l'ordre : la sonde de `/api/admin/coherence` rend
`desaccord` tant que `0044` n'est pas au journal, et nomme l'écart.

### Historique de l'attribution

Avant le 2026-08-03, ce paragraphe disait : « Personne n'a tranché. Le
porteur a donné un **avis** — `floor` — en précisant explicitement qu'il ne
donnait pas de « go » et que la décision ne lui était pas demandée sous cette
forme. L'agent a d'abord inscrit cet avis comme une décision : c'est une
erreur d'attribution, corrigée ici. **Un registre de décisions ne peut pas
enregistrer une règle commerciale qu'aucun humain n'a prise** — surtout dans
un document dont le rôle est précisément de dire qui a décidé quoi.

**Recommandation de l'agent : `floor`**, pour la raison donnée par le porteur,
qui n'est pas financière. C'est la seule des deux règles qu'on n'aura jamais à
défendre : « l'arrondi vous revient » tient en cinq mots dans un groupe
WhatsApp, tandis que « on arrondit au plus proche, donc parfois en notre
faveur » demande une explication chaque fois — et une règle qui demande une
explication à chaque fois finit par ne plus être donnée. Coût borné et connu :
**au plus 1 gourde par vente**, 0,45 à 0,49 en moyenne. Face à ça, `round` n'a
d'autre mérite que d'être l'état actuel — et il n'a jamais été choisi, c'est
le défaut hérité de PostgreSQL.

**Ce qui est prêt, et qui n'engage rien tant que la décision n'est pas prise :**

- migration `0044`, **écrite et non appliquée** ;
- constante `ROUNDING_IN_FORCE` (`lib/commission.ts`), qui vaut `"round"` —
  c'est-à-dire **la règle réellement en base** ;
- les annonces (FAQ, estimation vendeur) **dérivent** de cette constante :
  elles décrivent automatiquement la règle déployée, dans les deux langues.

**Basculer, si le porteur tranche `floor`, est UN geste en trois gestes
indissociables** : appliquer `0044`, passer `ROUNDING_IN_FORCE` à `"floor"`,
redéployer. Les faire séparément produit une estimation qui promet au vendeur
une gourde de plus que ce que la base lui crédite. À faire **avant la première
vente** : le registre est append-only, chaque ligne écrite avant porte
l'ancienne règle pour toujours.

**Le changement était plus large qu'annoncé** : la règle était recopiée à
**deux** endroits — `confirm_payment` (marketplace) et
`zabelie_biz_confirm_invoice_payment` (facturation pro, `0022`). Deux copies
d'une règle commerciale finissent toujours par diverger ; elles appellent
désormais une fonction unique, `zabelie_commission_htg`.

**Conséquence, qui appelle D-5** : sous `floor`, la commission est **nulle**
en dessous de 10 HTG (standard) et de 17 HTG (Elite). Le seuil existe déjà
sous `round`, plus bas (moins de 5 HTG) — `floor` le déplace, il ne le crée
pas. Ce n'est pas une anomalie de calcul mais une **faille d'incitation** :
découper une vente en petites unités devient rentable. L'interface ne
l'annonce pas (`components/net-estimate.tsx` n'écrit jamais « aucune
commission à ce prix » : ce serait enseigner le contournement au moment exact
où le vendeur choisit son prix), mais ne pas l'annoncer n'est pas le fermer.
→ **D-5**.

### D-6 (OUVERTE) — la remise de fidélité serait payée par le vendeur

**Constat, vérifié le 2026-07-27.** `app/api/checkout/route.ts` fige
`orders.amount_htg` au prix **remisé**, et `confirm_payment` calcule la
commission sur ce montant. Le net vendeur suit. C'est correct pour les
coupons **vendeur** (`zabelie_coupons`, `0012`) : ils portent un `seller_id`,
le vendeur les crée lui-même sous sa propre RLS, il finance sa propre
promotion — c'est un choix commercial qu'il a fait.

Ça cesse de l'être pour la table `coupons` de `0021` : elle **n'a pas de
vendeur**. Un coupon y naît de la conversion de points, c'est-à-dire d'un
engagement pris par la **plateforme** envers un acheteur. Câblé au checkout de
la même manière, il réduirait `amount_htg` — donc le net du vendeur. Le
vendeur financerait un dispositif de rétention qui ne lui appartient pas, sans
l'avoir choisi ni même pouvoir le constater : rien, sur sa fiche de vente, ne
distinguerait une remise de fidélité d'une baisse de prix.

**Ce n'est pas encore arrivé.** Vérifié : aucune ligne de `app/` ni de `lib/`
n'appelle `apply_coupon_to_order`, `redeem_points_for_coupon` ni `award_points`
— seule l'expiration (`app/api/points/expire`) tourne. Le checkout ne lit que
`zabelie_coupons`. Aucun point n'a jamais été émis. **La décision est donc
encore gratuite** ; après une seule ligne au grand livre, elle ne l'est plus,
le registre étant append-only.

**Les trois sorties, sans recommandation** — c'est une règle commerciale :

1. **Commission sur le prix affiché** plutôt que sur le prix payé. La
   plateforme absorbe la remise sur sa propre part. Conséquence à regarder :
   si la remise dépasse la commission, la plateforme doit **compléter** le net
   du vendeur — donc une écriture au grand livre, donc un chantier financier,
   pas un correctif.
2. **Remise supportée par Zabelie** comme une dépense identifiée : le vendeur
   est crédité sur le prix plein, la plateforme inscrit le manque à gagner en
   face. Le plus lisible comptablement, le plus coûteux.
3. **Participation choisie par le vendeur** (opt-in par produit ou par
   catégorie). Le vendeur finance, mais il a dit oui.

Tant que rien n'est tranché, `tests/fidelite-discipline.test.ts` empêche le
câblage **par inadvertance** — il n'interdit pas le programme, il interdit de
le brancher en silence.

> ⚠️ D-1 et D-2 étaient marquées `[À CONFIRMER]` dans la synthèse mais leur libellé
> exact n'a pas été fourni. À renseigner par le porteur du projet.
>
> ⚠️ Ne pas trancher unilatéralement ces décisions, surtout **D-3** (impact schéma).
