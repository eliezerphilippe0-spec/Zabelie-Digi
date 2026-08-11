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
* **B — `StaleWhileRevalidate` avec bandeau d'âge.** « Informations du
  *[date]* — reconnectez-vous pour le prix à jour », et le bouton d'achat
  désactivé tant que la revalidation n'a pas répondu. *(Recommandation.)*
* **C — `StaleWhileRevalidate` nu.** Le plus rapide, et il ment en silence.

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
qui est précisément le cœur du risque. **Dépendance nouvelle → validation
porteur** (règle « aucun service externe non listé »), même si celle-ci est une
bibliothèque de build et non un service.

## 6. Hors périmètre — PR 3/3

Page de repli hors-ligne, file d'attente d'actions différées, notifications
push. Probablement jamais nécessaires en v1 ; à ne pas glisser dans la PR 2.
