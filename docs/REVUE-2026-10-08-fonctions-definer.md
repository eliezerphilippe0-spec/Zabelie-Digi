# Revue de sécurité — fonctions `SECURITY DEFINER` exposées — 2026-10-08

**Mode** : CIBLÉ (sécurité) · **Périmètre** : les fonctions `security definer` du schéma `public` exécutables par `anon` ou `authenticated` · **Stack** : Supabase (Postgres, RLS) · **Source** : production `ddditxykopuxxqzgkqwy`, lecture seule, et dépôt à `d8ba896`.

## Résumé exécutif

Une fonction `security definer` s'exécute avec les droits de son propriétaire, RLS contournée. Exposée à un client, c'est une porte. La production en compte **99**, toutes avec un `search_path` fixé. **Douze** sont exécutables par un client : 7 par les visiteurs (`anon`), 5 par les seuls comptes connectés.

Toutes les douze sont saines :

- elles identifient l'appelant par `auth.uid()` ou par un jeton secret, **jamais par un identifiant fourni en paramètre** pour écrire ;
- elles ne rendent que des données de vitrine ou des booléens ;
- leurs écritures se limitent à la ligne de l'appelant ou à celle du jeton.

Aucune exposition n'est à retirer : les quatre aides de politiques RLS doivent rester exécutables, sinon le catalogue et le support se vident.

Un défaut est trouvé, et il va dans l'autre sens : `zabelie_commission_taux()` est fermée aux visiteurs, alors que `/vendre`, devenue publique, la lit pour eux. C'est un **arbitrage porteur** (SEC-D1).

Un garde permanent fige désormais la liste revue : `supabase/tests/definer_exposition.test.sql`.

## Tableau de bord

| Axe | Posture | Constats (🔴/🟠/🟡/🔵) |
|-----|---------|------------------------|
| Sécurité | Solide | 0 / 0 / 1 / 1 |

## Les douze fonctions

Lues dans le corps déployé (`pg_get_functiondef`) le 2026-10-08. Les droits de la base de test CI sont identiques à ceux de la production, mesurés le même jour.

| Fonction | Exposée à | Migration | Identité | Ce qu'elle rend ou écrit | Verdict |
|----------|-----------|-----------|----------|--------------------------|---------|
| `seller_is_active(uuid)` | anon, auth | `0017` | — | un booléen : profil non suspendu | **Garder** : aide de la politique `products_public_read_published` |
| `zabelie_vendeur_essai(uuid)` | anon, auth | `0101` | — | un booléen : compte d'essai | **Garder** : même politique |
| `zabelie_order_participant(uuid)` | auth | `0113` | `auth.uid()` | un booléen : acheteur ou vendeur de la commande | **Garder** : politiques du support |
| `zabelie_biz_get_invoice_by_token(text)` | anon, auth | `0022` | jeton | facture non brouillon : numéro, montants, lignes, nom du professionnel ; lecture seule | **Garder** : facture payable sans compte ; jeton de 144 bits (`lib/business.ts:72`, `randomBytes(18)`) |
| `zabelie_email_desabonner(uuid)` | anon, auth | `0124` | jeton | met `relances = false` sur la ligne du jeton, rend un booléen | **Garder** : jeton `gen_random_uuid()` |
| `zabelie_boutik_public(uuid, text)` | anon, auth | `0112` | — | profil public d'un vendeur actif : nom, bio, avatar, zone, point de repère, slug | **Garder** : vitrine `/boutik/[slug]` |
| `zabelie_domaine_boutik(text)` | anon, auth | `0125` | — | le slug d'un domaine vendeur actif | **Garder** : appelée par le proxy sans session (`lib/domaines.ts:63`) |
| `zabelie_vande_nan_zon(uuid[])` | anon, auth | `0084` | — | jusqu'à 1 000 identifiants de vendeurs d'une zone | **Garder** : filtre par zone du catalogue (`lib/zones.ts:160`) ; voir SEC-D2 |
| `zabelie_accept_account_legal(…)` | auth | `0133` | `auth.uid()` | enregistre l'acceptation des CGU de l'appelant, compte actif exigé | **Garder** |
| `zabelie_cart_add(uuid)` | auth | `0058` | `auth.uid()` | ajoute un produit publié au panier de l'appelant, jamais le sien | **Garder** |
| `zabelie_cart_remove(uuid)` | auth | `0058` | `auth.uid()` | retire du panier de l'appelant | **Garder** |
| `zabelie_commission_taux()` | anon (`0135`), auth | `0066` | — | deux entiers publics (10 %, 6 %) pour l'affichage | **Garder** ; ouverte aux visiteurs sur décision du porteur (SEC-D1) |

## Constats

### 🟡 Moyens

#### [SEC-D1] `/vendre` lit le taux de commission pour des visiteurs qui n'y ont pas droit
- **Axe** : Sécurité (droits) et exactitude de l'affichage
- **Emplacement** :
  - `supabase/migrations/0066_commission_taux_lecture.sql:81-82` (`revoke … from public, anon` ; `grant … to authenticated`) ;
  - `app/vendre/page.tsx:221` et `app/vendre/physique/page.tsx:59` (`lireTauxCommission` avec le client de session) ;
  - repli dans `lib/commission-config.ts:44-67`.
- **Constat** : `0066` a fermé la fonction à `anon` « par moindre privilège », parce que « `/vendre` exige un compte ». Elle ajoutait : « le jour où une page publique en aura besoin, ce sera une décision, pas un héritage ». Depuis, `/vendre` est publique, et elle annonce la commission au futur vendeur **avant** l'inscription.
- **Preuve** :
  - en production, `set local role anon; select * from zabelie_commission_taux()` rend `permission denied for function zabelie_commission_taux` ;
  - chaque visite non connectée tombe donc dans le repli et journalise `[commission] taux de repli utilisé` ;
  - ce message apparaît aussi dans la CI.
- **Impact** : aujourd'hui, rien de visible, car la table vaut 1000/600, comme la constante. Le jour où le taux change en base, le prospect lit l'ancien taux : l'affiché et le facturé divergent sur la page qui précède la décision du vendeur. Entre-temps, chaque visite non connectée laisse une erreur dans le journal.
- **Correctif** : ⚖️ **tranché par le porteur le 2026-10-09** (« Oui ouvre le aux visiteurs »). La migration `0135_zabelie_commission_taux_visiteurs.sql` accorde `EXECUTE` à `anon` sur la seule fonction. `PUBLIC` reste sans droit, et la table reste fermée ; les deux sont vérifiés par sa post-condition et par `supabase/tests/commission_taux.test.sql` (P3 et N4, éprouvés par mutation). La liste du garde porte désormais `zabelie_commission_taux():anon,auth`. Le fichier de `0066` ne bouge pas : il est appliqué.
- **Effort** : S

### 🔵 Faibles

#### [SEC-D2] Le filtre par zone énumère aussi les vendeurs suspendus
- **Axe** : Sécurité (minimisation)
- **Emplacement** : `supabase/migrations/0084_boutique_publique.sql` (`zabelie_vande_nan_zon`)
- **Constat** : la fonction rend les identifiants des vendeurs d'une zone sans filtrer `suspended_at`. Leurs produits restent masqués par la politique RLS du catalogue : rien d'autre ne fuit qu'un identifiant déjà opaque.
- **Correctif proposé** : `and p.suspended_at is null`, à la prochaine migration qui touche cette fonction.
- **Effort** : S

## Ce qui reste hors de ce lot, et pourquoi

D'après les conseillers Supabase lus le 2026-10-08 :

- **Protection contre les mots de passe divulgués désactivée** : c'est un réglage Auth du projet, donc une configuration de production réservée au porteur (`CLAUDE.md`, règle dure n°5).
- **`pg_trgm` dans `public`** : la déplacer touche les index de recherche. C'est une migration à part, à mesurer avant.
- **38 tables avec RLS et sans politique** : c'est voulu. Elles ne sont lues que par le serveur, avec la clé de service.

## Le garde

`supabase/tests/definer_exposition.test.sql` tourne dans la suite SQL de la CI. Il vérifie :

- **P1** : la liste des fonctions exposées **est** la liste revue ci-dessus, à la signature et au rôle près. Une treizième exposition rougit, un droit retiré aussi.
- **P2** : aucune fonction `security definer` sans `search_path` fixé.
- **N1** et **N2**, ses cas connus-négatifs, exécutés à chaque passage : une fonction neuve laissée exécutable par défaut, puis une fonction sans `search_path`. Les deux doivent être vues, sinon le garde échoue.

Trois mutations ont été jouées à la main, et chacune nomme la fonction en cause :

| Mutation | Résultat | Fonction nommée |
|----------|----------|-----------------|
| Ouvrir `zabelie_commission_taux` à `anon` | rouge | celle-ci |
| Retirer une ligne de la liste revue | rouge | celle de la ligne retirée |
| Retirer `anon` d'une aide RLS | rouge | l'aide RLS concernée |

⚠️ **Limite.** Le garde lit la base de la CI, construite depuis les migrations. Un `grant` passé à la main en production, hors migration, ne s'y voit pas. Le croisement production–CI de ce jour, identique, est à refaire à chaque revue.
