# Parcours acheteur — rejoué le 2026-09-05, avant la première vente

Demande du porteur : « joue le rôle d'un acheteur, passe une commande sur
chaque département — physique, digital, service — et montre-moi des captures ».

## ⚠️ Ce que ce rejeu EST, et ce qu'il n'est PAS

**zabelie.com et la base de production ne sont pas joignables depuis
l'exécuteur** (proxy d'egress, `403`). Aucune commande réelle n'a donc été
passée, aucun compte réel créé, aucun paiement MonCash lancé. Ce rejeu tourne
sur le **build de production de `main` (`ea1c275`)**, en local, dans les deux
environnements que le dépôt sait faire vivre sans Supabase :

| Environnement | Ce qu'il contient | Ce qu'il prouve | Ce qu'il ne prouve pas |
|---|---|---|---|
| **Démo** (`ZABELIE_DEMO_FIXTURES=true`, sans clés Supabase) | le catalogue d'exemple : 4 fichiers, 2 services | l'affichage, la navigation, les boutons, le chemin jusqu'à l'appel `/api/checkout` et la redirection passerelle (simulée) | tout ce qui touche la base : connexion, panier, création de commande |
| **Stub** (`e2e/fixtures/stub-supabase.mjs`, acheteur connecté par cookie) | 1 produit physique publié, 1 commande payée | la fiche physique (stock, compatibilité, variante), « Mes achats », la route de checkout jusqu'à la réservation de stock | la réservation elle-même (le stub ne porte pas la fonction SQL) |

Et un point qui change la lecture des captures : **l'accueil premium (PR
#201→#205) n'est pas fusionné**. Les captures montrent l'en-tête et l'accueil
**actuels** de zabelie.com, pas la refonte.

Enfin, en production : **3 produits publiés, tous dans « Digital & services »,
aucun produit physique publié**. Un acheteur réel ne peut donc pas, aujourd'hui,
commander un produit physique sur zabelie.com — non parce qu'un bouton casse,
mais parce qu'aucun vendeur n'en a publié.

## Résultat en une ligne

**Tous les boutons cliqués font ce qu'ils annoncent** : 18 étapes vertes, 11
constats d'information, 0 bouton mort, 23 liens internes crawlés, tous
répondent. Trois
observations utiles, aucune bloquante — détaillées plus bas.

## Le parcours, capture par capture

| # | Capture | Ce qu'on a fait | Résultat |
|---|---|---|---|
| 01–02 | `accueil-mobile` | ouverture de `/` à 390 px | ✓ h1, carrousel, recherche, liens Catalogue · Talents · Aide, puces de catégories, bloc vendeur |
| 03 | `catalogue-mobile` | clic « Catalogue » dans l'en-tête | ✓ arrive sur `/catalogue` (vérifié à la main : deux liens « Catalogue », en-tête et pied, tous deux visibles et fonctionnels) |
| 04–05 | `fiche-digital` | clic sur la carte « Pack 24 presets Lightroom » | ✓ fiche : image, badges « Fichier digital · Photo », titre, vendeur, ventes, prix, **Payer 1 500 HTG avec MonCash**, **Ajouter au panier**, code promo, partage WhatsApp, copier le lien, bloc « Écrire au vendeur » qui demande la connexion |
| 06 | `apres-clic-moncash-non-connecte` | clic MonCash, **sans base**, non connecté | · le serveur répond 500 (pas de Supabase en démo) et le bouton affiche « Connexion impossible. Réessayez. » — **artefact du mode démo**. En production, le même clic non connecté rend 401 et renvoie vers `/connexion?next=…` (`app/api/checkout/route.ts:102`, `components/buy-button.tsx:139`), ce que la CI e2e éprouve avec un 401 simulé |
| 07 | `connexion-mobile` | page `/connexion?next=/produit/…` | ✓ onglets Connexion · Inscription, formulaire, bouton « Se connecter ». Aucun bouton Google/Microsoft : voulu, `NEXT_PUBLIC_AUTH_PROVIDERS` non posé |
| 08 | `redirection-passerelle-moncash-simulee` | clic MonCash avec `/api/checkout` simulé (acheteur connecté, passerelle joignable) | ✓ le navigateur part vers `…/Moncash-middleware/Payment/Redirect` — c'est le dernier pas que le site contrôle |
| 09–11 | `paiement-succes` · `en-attente` · `echec` | les trois pages de retour | ✓ « Paiement confirmé », « Paiement en cours de vérification », « Paiement non confirmé » avec le motif |
| 12–13 | `fiche-service` | carte « Mentorat design produit » → fiche | ✓ fiche service, 3 500 HTG, MonCash → passerelle (simulée) ; aucune promesse de fichier |
| 14–15 | `apres-ajout-panier` · `panier-vide-non-connecte` | « Ajouter au panier », puis `/panier` | · 500 et page « Quelque chose s'est mal passé » — **mode démo sans base**. Voir observation 3 |
| 16 | `recherche-presets` | saisie « presets » + Entrée | ✓ `/catalogue?q=presets` |
| 17 | `accueil-apres-bascule-langue` | bouton **KR** | ✓ h1 passe à « Machandiz, sèvis ak pwodui dijital — peye ak MonCash » |
| 18 | `accueil-theme-bascule` | bouton ☀ | ✓ `data-theme="light"` |
| 19–20 | `aide-mobile` · `vendre-mobile` | pages secondaires | ✓ FAQ, contacts, étapes vendeur |
| 21–22 | `fiche-physique` (stub) | fiche « Filtre à huile Corolla », acheteur connecté | ✓ badge « Produit physique · Pièces détachées auto », **4 en stock**, « Compatible avec Toyota Corolla 2008–2015 », « Livraison à convenir avec le vendeur », « Le vendeur n'est payé qu'après la remise », MonCash, panier, **Envoyer** un message (connecté), Déconnexion dans l'en-tête |
| 23 | `physique-apres-clic-moncash` | clic MonCash, serveur réel contre le stub | · 409 « Article indisponible » : la route appelle la fonction SQL `zabelie_reserve_stock` (`route.ts:426`) que **le stub ne porte pas** — il répond vide, la route lit « pas de réservation » et refuse, **comme elle doit**. La fonction réelle est éprouvée par `supabase/tests/stock_money_path.test.sql` et `stock_concurrency.sh` en CI |
| 24 | `mes-achats-physique` | `/mes-achats` connecté | ✓ la commande payée, « Remise à convenir avec le vendeur », « Laisser un avis » ; aucun bouton de téléchargement sur un physique |

Journal machine : `journal.json` · liens crawlés : `liens-internes.json`
(23 liens, tous < 400 ; `/messages` renvoie un visiteur vers `/connexion`).

## Trois observations, aucune bloquante

1. **Pas d'entrée « Connexion » dans l'en-tête quand on n'est pas connecté.**
   Sur mobile comme en texte d'en-tête (`Catalogue · Talents · Aide`), un
   acheteur ne trouve la connexion qu'en cliquant « Payer » (renvoi
   automatique) ou depuis « Écrire au vendeur ». Ça marche, mais c'est un
   détour. **L'accueil premium le règle** : le menu compte de l'en-tête porte
   le lien `/connexion` (`components/account-menu.tsx`, PR #202).
2. ~~**Le message d'erreur générique dit « Connexion impossible » pour une
   erreur serveur.**~~ `buy-button.tsx:145-169` : une réponse non-JSON (500)
   tombait dans le `catch` réseau. En production, un vrai 500 (MonCash
   injoignable sans le code `provider_unavailable`) affichait donc « Connexion
   impossible. Réessayez. » — vrai au sens large, trompeur au sens strict.
   ✅ **CORRIGÉ le 2026-09-05** par `lib/appel-session.ts` : les quatre issues
   d'un appel authentifié sont distinguées, et `reseau` ne couvre plus que le
   cas où la requête n'est jamais partie. Revérifié dans le navigateur, mêmes
   conditions que ci-dessus : 500 → « Une erreur est survenue », requête
   avortée → « Connexion impossible », 401 → `/connexion?next=…`, 409 → le
   motif du serveur.
3. **`/panier` sans base rend la page d'erreur au lieu d'un panier vide.**
   Uniquement observable sans Supabase, donc jamais en production configurée.
   Le reste du site se dégrade proprement dans ce cas (catalogue, fiches) ;
   cette page non. Effort S, valeur faible.

Déjà connu, rappelé parce qu'il est sur la capture 24 : **« NatCash — bientôt »**
au pied de page (A10 de l'accueil premium, zone d'arrêt, options a/b/c dans
`OPS_TODO`).

## Ce que ce rejeu ne peut pas remplacer

La **première commande réelle** (`docs/22`) : un compte réel, un produit à
petit prix, un vrai paiement MonCash en production, la confirmation
serveur-à-serveur, la ligne dans `orders` et dans le grand livre. Aucun
environnement local ne la simule — et c'est tout l'intérêt de la faire.
Prérequis toujours ouvert : les identifiants MonCash **production** (portail
Business, activation Digicel).

Pour commander un **produit physique** en production, il faut d'abord qu'un
vendeur en publie un — aujourd'hui, zéro.

## Reproduire

```bash
npm run build
ZABELIE_DEMO_FIXTURES=true PORT=3000 npm run start &
node e2e/fixtures/stub-supabase.mjs &
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x PORT=3001 npm run start &
# puis le script de parcours (Playwright, Chromium local), qui écrit dans ce dossier
```

Le script n'est pas versionné : il est un rejeu daté, pas un test. Les tests
qui gardent ces chemins en CI sont `e2e/money-path.spec.ts`,
`e2e/parcours-service.spec.ts`, `e2e/parcours-physique.spec.ts`.
