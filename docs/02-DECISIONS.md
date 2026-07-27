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
| V-12 | **Tiers de commission — statu quo** | Décision porteur (2026-07) : **2 tiers** (standard 10 %, elite 6 %) avec **maturation J+7 uniforme** restent la référence. Le schéma « 4 tiers Starter/Standard/Pro/Elite (J+14/J+7/J+5/J+3) » évoqué en brief n'est PAS retenu ; y revenir serait une nouvelle décision + chantier financier dédié (PR à relecture humaine). |

---

## Décisions ouvertes `[À CONFIRMER]`

| ID | Question | Impact | Statut |
|----|----------|--------|--------|
| **D-1** | `[À CONFIRMER]` _(à préciser — issue de la synthèse)_ | — | Ouverte |
| **D-2** | `[À CONFIRMER]` _(à préciser — issue de la synthèse)_ | — | Ouverte |
| ~~**D-3**~~ | ~~Lien auth/wallet avec Zabelie 1~~ | **VERROUILLÉE → V-9.** Séparé, fusion possible plus tard. | ✅ Tranchée |
| **D-4** | **Sens de l'arrondi de la commission** — `round` (état actuel) ou `floor` (l'arrondi va au vendeur) | Commercial. Migration `0044` **écrite, non appliquée** ; constante `ROUNDING_IN_FORCE` en TS. Coût de `floor` : ≤ 1 HTG par vente. | **Ouverte — en attente d'arbitrage porteur** |
| **D-5** | **Seuil zéro : faut-il une commission minimale de 1 gourde ?** | Commercial. Sous `round`, une vente < 5 HTG ne rapporte rien ; sous `floor`, une vente < 10 HTG (17 en Elite) non plus. Découper une vente en petites unités devient donc une stratégie. Deux sorties : **prix plancher** ou **commission minimale de 1 HTG dès qu'il y a vente** — la seconde ferme le seuil sans abîmer l'argument « l'arrondi va au vendeur ». | **Ouverte — en attente d'arbitrage porteur** |

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

**Statut : en attente d'arbitrage du porteur.** Personne n'a tranché. Le
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

> ⚠️ D-1 et D-2 étaient marquées `[À CONFIRMER]` dans la synthèse mais leur libellé
> exact n'a pas été fourni. À renseigner par le porteur du projet.
>
> ⚠️ Ne pas trancher unilatéralement ces décisions, surtout **D-3** (impact schéma).
