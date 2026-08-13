# 32 — PWA, PR 2/3 : le service worker

> **Statut : SPÉCIFIÉ, NON COMMENCÉ.** Deux verrous avant la première ligne —
> un geste porteur et un arbitrage porteur. Détail en §1.
>
> PR 1/3 (`app/manifest.ts`) est livrée et **indépendante** : elle donne
> l'icône sur l'écran d'accueil, elle ne cache rien.

## 0. Ce que ce chantier achète, et ce qu'il risque

**Achète** : le catalogue qui survit à la coupure. Sur le terrain visé —
Android d'entrée de gamme, 3G, coupures fréquentes — une page qui se recharge
au lieu de s'afficher est un acheteur perdu.

**Risque** : un service worker est **le pire artefact adressé par chaîne du
répertoire**. Il vit dans le navigateur du client, survit aux déploiements, et
un SW défectueux sert du HTML périmé **indéfiniment** — sans qu'aucun journal
de la plateforme ne s'en aperçoive, puisque les requêtes n'arrivent jamais. On
ne peut pas le corriger par un redéploiement : il faut que le client repasse.

C'est pourquoi la discipline de versionnage et d'invalidation n'est pas un
détail d'implémentation. **C'est le cœur du chantier.**

## 1. Les deux verrous

**V-1 — geste porteur : `SUPABASE_SERVICE_ROLE_KEY`.** Mesuré le 2026-08-11 :
`storage.objects` a la RLS active et zéro policy, donc tout passe par
service-role, et **zéro objet existe dans tous les buckets**. Le catalogue n'a
aucune image. Un cache d'images testé sur un catalogue sans image mesurerait
zéro et paraîtrait sain — c'est la règle 3 de `CLAUDE.md` mot pour mot :
*avant d'instrumenter un chemin, le parcourir une fois de bout en bout.*

**V-2 — arbitrage porteur : la liste `NetworkOnly` (§2).** À trancher **avant**
la première ligne, pas pendant la revue.

## ✅ ARBITRAGE RENDU — 2026-08-13

> **Porteur** : « fais le meilleur choix pour Zabelie, inspire-toi des géants
> sur le marché africain. » Décision déléguée à l'agent, avec sa référence.

**Ce que font les géants du terrain.** Jumia et Konga ont fait de leur PWA une
pièce maîtresse sur exactement ce marché — bande passante chère, réseau qui
tombe, Android d'entrée de gamme. Leur motif converge : **on parcourt le
catalogue hors réseau, on ne paie jamais depuis un cache.** Et ils s'appuient
sur Workbox plutôt que de réécrire la gestion de version.

* **§2 — option B retenue** : fiche produit cachée AVEC bandeau d'âge et
  revalidation au tap.
* **§5 — Serwist retenu** (successeur de `next-pwa`, bâti sur Workbox).

**⚠️ Séquencement imposé, et il n'est pas cosmétique.** La PR livrée le
2026-08-13 met `/produit/` dans la liste `NetworkOnly` — donc l'option A **à
titre provisoire**. Raison : livrer le cache de la fiche AVANT son bandeau
d'âge, ce serait livrer l'option C, celle que cette spec rejette parce qu'elle
« ment en silence ». Les deux arrivent dans le même geste ou pas du tout.

**Ce que la PR du 2026-08-13 livre donc** : installabilité, précache des
fichiers de build (le gain réel de données), page hors réseau en quatre
langues, sortie de secours, et la liste `NetworkOnly` complète, croisée par
`tests/pwa-service-worker.test.ts` (5 mutations, 5 rouges).

**Ce qu'elle ne livre pas** : le cache de la fiche produit et son bandeau —
c'est le geste suivant. Et V-1 reste entier : `SUPABASE_SERVICE_ROLE_KEY`, donc
aucune image au catalogue, donc aucune règle de cache d'images (elle
mesurerait zéro et paraîtrait saine).

## 2. ⚖️ ARBITRAGE — les chemins JAMAIS cachés

> **Un service worker qui sert une page de paiement périmée n'est pas un bug
> d'affichage, c'est un incident financier.**

Liste **fermée**, proposée. Tout ce qui porte une session, de l'argent, ou un
état qui change sous les pieds de l'utilisateur :

| Chemin | Pourquoi jamais de cache |
|---|---|
| `/api/**` | toutes les routes serveur, sans exception ni liste d'exclusion |
| `/api/checkout`, `/api/moncash/**` | un montant ou un lien de passerelle périmé engage de l'argent |
| `/api/download` | l'URL signée expire en 5 min ; la resservir donne un 403 incompréhensible |
| `/panier`, `/mes-achats`, `/mes-ventes` | état propre à la session, faux dès qu'il vieillit |
| `/admin/**`, `/tableau-de-bord` | idem, plus le risque de montrer l'état d'un autre |
| `/connexion`, `/auth/**`, `/reinitialiser-mot-de-passe` | une page d'authentification périmée bloque l'accès sans le dire |
| `/produit/[slug]` | ⚠️ **le cas discutable** — voir ci-dessous |

**La question ouverte, et elle est réelle.** La fiche produit porte le **prix**
et la **disponibilité** (`in_stock`, `0040`). En `StaleWhileRevalidate`, un
acheteur hors réseau voit une fiche d'hier : prix modifié, produit épuisé,
vendeur suspendu. Il clique « acheter », et le serveur — qui recalcule tout
(règle dure n°3) — refuse. **Aucun risque d'argent** : le prix affiché n'engage
rien. Mais une promesse d'affichage non tenue, sur le marché visé, est un coût
de confiance.

Trois options, à trancher :

* **A — `NetworkOnly`.** La fiche ne s'affiche jamais hors réseau. Le plus sûr,
  et ça vide le chantier de la moitié de sa valeur.
* **B — `StaleWhileRevalidate`, bandeau d'âge, et revalidation AU TAP.**
  *(Recommandation.)* Voir ci-dessous : la forme compte autant que le choix.
* **C — `StaleWhileRevalidate` nu.** Le plus rapide, et il ment en silence.

### La forme de l'option B — et le piège qu'elle doit éviter

La première rédaction de cette spec proposait « bouton d'achat **désactivé**
tant que la revalidation n'a pas répondu ». **C'est faux sur ce terrain, et
d'une façon qui retourne le remède contre lui-même.**

Sur un réseau qui rame ou qui tombe, la revalidation peut ne **jamais**
répondre de toute la session. Un bouton mort, sans explication, ne se lit pas
« données périmées » — il se lit **« le site est cassé »**. On aurait échangé
un prix douteux contre une panne apparente, ce qui est pire : le prix douteux
n'engage rien, la panne apparente fait partir l'acheteur.

La forme qui tient :

* le **bandeau d'âge** reste — « Enfòmasyon yo soti *[date]* » ;
* le **bouton d'achat reste actif**, toujours ;
* le **tap** déclenche la revalidation **bloquante**, avec un état d'attente
  honnête — « N'ap verifye pri a… » — et non un blocage silencieux ;
* sans réseau, ce tap échoue et **le dit**. Ce n'est pas une régression :
  MonCash exige le réseau de toute façon. L'acheteur hors-ligne peut
  **regarder** le catalogue ; il ne peut simplement pas franchir la porte du
  paiement, ce qui était déjà vrai avant toute PWA.

Même garantie financière — aucun prix périmé n'atteint jamais le serveur — et
zéro faux « cassé ». La différence entre les deux formes ne tient pas au
mécanisme, elle tient à **qui attend et à ce qu'on lui dit pendant ce
temps-là**.

## 3. Discipline de versionnage — non négociable

* **`skipWaiting` + `clients.claim` désactivés par défaut.** Un SW qui prend la
  main immédiatement peut servir un mélange d'ancien et de nouveau bundle sur
  une page déjà ouverte.
* **Cache nommé par version de build**, et purge de tout cache dont le nom ne
  correspond pas à la version courante, à chaque `activate`.
* **Un chemin de secours qui désinstalle**, joignable sans le SW : le jour où
  un SW défectueux est déployé, c'est la seule sortie.
* **Aucun `NetworkFirst` sur du HTML de navigation** sans délai d'expiration
  borné.

## 4. L'épreuve — pas de « Lighthouse dit installable »

Lighthouse valide une *forme*, pas un *comportement*. Critères verts :

1. **Playwright, réseau coupé** (`context.setOffline(true)`) : recharger le
   catalogue → il s'affiche. Recharger le checkout → il **refuse**, sans écran
   blanc ni page périmée.
2. **Mutation** : retirer une entrée de la liste `NetworkOnly` → le test doit
   rougir en nommant le chemin. La liste seule ne prouve rien — c'est la règle
   2 de `CLAUDE.md` : l'assertion porte sur ce qui commande.
3. **Le cycle de mise à jour** : déployer une version B derrière un SW en
   version A, recharger deux fois, vérifier qu'aucun mélange n'est servi.
4. **Le chemin de désinstallation**, exécuté une fois.

## 5. Outillage

**Serwist** — successeur maintenu de `next-pwa`, compatible App Router. Une
implémentation vanilla est possible, mais réinventerait la gestion de version,
qui est précisément le cœur du risque.

**⚖️ ARBITRAGE — et il mérite mieux qu'un oui automatique.** Ce n'est pas une
dépendance de build ordinaire : elle **génère du code qui s'exécute chez le
client et survit aux déploiements**. C'est la classe la plus lourde possible
pour une bibliothèque — plus lourde qu'un service externe, qu'on peut couper.

La question à poser avant le oui n'est pas « est-elle maintenue ? » (elle
l'est) mais **« que se passe-t-il si le projet meurt dans deux ans ? »**.
Réponse honnête, et elle est rassurante : le service worker déjà généré
**continue de fonctionner** — c'est un fichier statique, pas un runtime — et
la sortie est **pénible mais bornée**, parce que le protocole Service Worker
est un standard du navigateur ; seule la *génération* est propriétaire.
Réécrire à la main ce que Serwist génère est un chantier fini, pas une
impasse.

C'est un oui raisonnable. **Mais c'est le sien.**

## 6. Hors périmètre — PR 3/3

Page de repli hors-ligne, file d'attente d'actions différées, notifications
push. Probablement jamais nécessaires en v1 ; à ne pas glisser dans la PR 2.
