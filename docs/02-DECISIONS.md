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
| V-15 | **Arrondi de la commission — `floor`, en faveur du vendeur** | Tranchée par l'agent le 2026-07-27, ex-D-4 — le porteur a explicitement rendu la décision **et** donné son avis (`floor`) sans « go ». `round()` (défaut PostgreSQL hérité, jamais choisi) envoyait la fraction à la plateforme sur **une vente sur deux** ; `floor` la rend au vendeur pour au plus **1 gourde par vente** (0,45 à 0,49 en moyenne, mesuré sur 0→5 000 HTG). La règle vit désormais dans **une seule** fonction, `zabelie_commission_htg` (migration `0044`), appelée par le marketplace **et** la facturation pro. Communication : « l'arrondi est toujours en votre faveur » — l'effet, pas la méthode. Conséquence assumée : commission nulle sous 10 HTG standard / 17 HTG Elite. |
| V-16 | **Le taux Elite n'est plus annoncé tant que le palier n'a pas de porte** | Décision agent (2026-07-27). `tier` existe depuis `0005` et est **gelé côté client** par les triggers `0015`/`0017` (« pas d'auto-attribution elite ») ; vérifié le 2026-07-27 : **aucun chemin de code, aucun écran d'administration n'attribue `elite`**, et **aucun document ne dit ce qui y donne droit**. Annoncer « 6 % pour les vendeurs Elite » en FAQ était donc une promesse sans critère et sans porte — un vendeur qui demande comment y accéder n'obtient aucune réponse. Le taux est retiré de `faq.a3` (FR + KR) ; la colonne, l'enum et `rateBps` restent (un octroi manuel en back-office fonctionne, et l'estimation vendeur s'y adapte). **Réannoncer le 6 % suppose d'abord d'écrire qui y a droit** — règle commerciale, donc décision du porteur. |
| V-12 | **Tiers de commission — statu quo** | Décision porteur (2026-07) : **2 tiers** (standard 10 %, elite 6 %) avec **maturation J+7 uniforme** restent la référence. Le schéma « 4 tiers Starter/Standard/Pro/Elite (J+14/J+7/J+5/J+3) » évoqué en brief n'est PAS retenu ; y revenir serait une nouvelle décision + chantier financier dédié (PR à relecture humaine). |

---

## Décisions ouvertes `[À CONFIRMER]`

| ID | Question | Impact | Statut |
|----|----------|--------|--------|
| **D-1** | `[À CONFIRMER]` _(à préciser — issue de la synthèse)_ | — | Ouverte |
| **D-2** | `[À CONFIRMER]` _(à préciser — issue de la synthèse)_ | — | Ouverte |
| ~~**D-3**~~ | ~~Lien auth/wallet avec Zabelie 1~~ | **VERROUILLÉE → V-9.** Séparé, fusion possible plus tard. | ✅ Tranchée |
| ~~**D-4**~~ | ~~Sens de l'arrondi de la commission~~ | **TRANCHÉE → V-15** : `floor`, l'arrondi va au vendeur. | ✅ Tranchée |

### D-4 (tranchée) — l'arrondi penchait systématiquement du côté de la plateforme

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

**Décision (2026-07-27) : `floor`.** Prise par l'agent, le porteur ayant
explicitement rendu la décision — « la décision t'appartient, je n'ai jamais
donné de *go* dans ce fil et je n'ai pas à en donner sur une règle
commerciale » — tout en donnant son avis, `floor`, pour une raison qui n'est
pas financière : **c'est la seule des deux règles qu'on n'aura jamais à
défendre**. Sur ce marché, ce qui compte est ce qu'un vendeur peut répéter
sans nuance dans un groupe WhatsApp. « L'arrondi vous revient » tient en cinq
mots ; « on arrondit au plus proche, donc parfois en notre faveur » demande
une explication chaque fois qu'on la donne — et une règle qui demande une
explication à chaque fois finit par ne plus être donnée du tout.

Le coût est borné et connu : **au plus 1 gourde par vente**, 0,45 à 0,49 en
moyenne. Face à ça, `round` n'a d'autre mérite que d'être l'état actuel — et
il n'a jamais été choisi : c'est le défaut hérité de PostgreSQL.

→ migration `0044`, **non appliquée**, à passer **avant la première vente**
(registre append-only : chaque ligne écrite avant porte l'ancienne règle pour
toujours).

**Le changement était plus large qu'annoncé** : la règle était recopiée à
**deux** endroits — `confirm_payment` (marketplace) et
`zabelie_biz_confirm_invoice_payment` (facturation pro, `0022`). Deux copies
d'une règle commerciale finissent toujours par diverger ; elles appellent
désormais une fonction unique, `zabelie_commission_htg`.

**Conséquence assumée** : sous `floor`, la commission est **nulle** en dessous
de 10 HTG (standard) et de 17 HTG (Elite) — la plateforme ne prélève rien
quand sa part n'atteint pas une gourde entière. C'est la traduction exacte de
la règle, pas une anomalie ; un test l'avait figée en sens inverse
(`commission ≥ 1`), il a été corrigé.

> ⚠️ D-1 et D-2 étaient marquées `[À CONFIRMER]` dans la synthèse mais leur libellé
> exact n'a pas été fourni. À renseigner par le porteur du projet.
>
> ⚠️ Ne pas trancher unilatéralement ces décisions, surtout **D-3** (impact schéma).
