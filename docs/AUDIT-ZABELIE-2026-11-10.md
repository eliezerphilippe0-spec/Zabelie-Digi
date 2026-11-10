# Audit Zabelie : marketplace, design, page d'accueil (2026-11-10)

Demande du porteur : audit complet en lecture seule des trois verticales (produits physiques, produits digitaux, services), du design et de la typographie, et de la page d'accueil, avec un plan d'action priorisé. Ce document est un **constat** : il ne tranche rien de ce qui relève du porteur (argent, positionnement, variables d'environnement, promesses commerciales, `docs/25` §4).

Dépôt lu à `8ddcfbe` (`main`, clone superficiel). Aucun fichier du code modifié, aucune migration, aucune écriture en base.

## 1. Résumé exécutif

1. Le chemin de l'argent est au niveau des références : idempotence, confirmation serveur à serveur, réconciliation, séquestre jusqu'à la remise.
2. Ce qui sépare Zabelie d'une vente n'est pas une fonction manquante : MonCash est en test, un seul produit est publié, aucun courriel ne part (`docs/78`, revérifié en production le 2026-11-10 pour les deux premiers points).
3. Trois défauts de conversion se corrigent en quelques jours : résultats exacts masqués par les approchants au catalogue, promotions invisibles sur les cartes, bouton MonCash affiché même quand le rail ne peut pas encaisser.
4. Sur mobile 360 x 800, le catalogue ne montre aucun produit au premier écran et le bouton de paiement de la fiche est à plus d'un écran de défilement.
5. Le digital ne peut rien vendre tant qu'aucun antivirus n'a produit de reçu : paiement et téléchargement répondent 503.
6. Le service est une annonce à prix unique posée sur la machine de remise du colis : ni formules, ni brief, ni livrable, ni révision. `docs/79` le spécifie déjà et attend un go.
7. Un vendeur ne semble pas pouvoir corriger titre, description, prix ni stock après création (hypothèse forte, à confirmer en parcourant l'espace vendeur).
8. Le système de design est sain et gardé par des tests : contrastes conformes, 7 tailles arbitraires dans tout le code. Aucune refonte proposée.
9. L'accueil est rapide et stable, mais son titre décrit le site au lieu de porter la promesse, et un visiteur sans préférence arrive en français.
10. Plan : 6 correctifs P0 côté code, 4 actes P0 côté porteur, puis P1 et P2 (section 5).

## 2. Méthode, et ce que ce document ne prouve pas

| Volet | Comment | Limite |
|---|---|---|
| Code | Lecture de `app/`, `components/`, `lib/`, `supabase/migrations/` ; trois lectures parallèles par parcours, puis relecture directe des constats marqués ✔ | Un « présent » veut dire branché dans le code, pas appliqué en production |
| Absences | Recherche de termes dans `app/`, `components/`, `lib/`, `supabase/migrations/` | Chaque « absent » est une **hypothèse** : une implémentation sous un autre nom reste possible (`CLAUDE.md`, « sans appelant n'est jamais une conclusion de grep ») |
| Design | `npm run check:contrast` exécuté ; polices ouvertes avec fontTools ; copie locale en mode développement, sans Supabase, données de démonstration (`ZABELIE_DEMO_FIXTURES=true`) ; captures et mesures à 360 x 800 et 1280 x 900, en kreyòl | Pas de pages connectées (le panier affiche une erreur sans base), pas de vrai téléphone |
| Accueil en production | zabelie.com ouvert le 2026-11-10, émulation Android 360 x 800, `/ht`, `/fr` et `/` ; LCP et CLS par `PerformanceObserver`, bridage réseau par le navigateur | Mesures prises depuis un centre de données : elles sous-estiment un téléphone en Haïti. La photo du produit publié ne s'est pas chargée (hôte Supabase bloqué par le bac à sable) |
| Références | Amazon, Jumia, Zalando, Gumroad, Etsy, Envato, ComeUp, Fiverr, Malt | Leurs fonctions viennent de la connaissance de l'auditeur, pas d'une vérification du jour |

Non vérifié : migrations appliquées, variables d'environnement et drapeaux de production ; inscription, paiement et téléchargement réels ; traductions kreyòl (aucune relecture native) ; anglais et espagnol.

Les captures (accueil, catalogue, fiche, production) ont été remises en session et ne sont pas versées au dépôt.

Légende des tableaux. État : présent, partiel, absent, défaut. Impact : fort, moyen, faible, ou « atout » quand Zabelie fait au moins aussi bien que la référence. Effort : S jusqu'à 2 jours, M jusqu'à 2 semaines, L au-delà. « Porteur » : touche l'argent, une variable d'environnement, une promesse ou le positionnement.

## 3. Tableaux comparatifs

### 3.0 Socle commun aux trois verticales

Catalogue, fiche, panier, paiement, messagerie, avis et litiges sont partagés (`lib/product-kind.ts:15-19`). Ces lignes valent pour les trois tableaux suivants.

| Fonctionnalité | Référence | État Zabelie | Preuve | Impact | Effort |
|---|---|---|---|---|---|
| Résultats exacts et approchants | Amazon : exacts d'abord, suggestions ensuite | **Défaut** ✔ : avec 1 ou 2 exacts, seule la grille des approchants s'affiche | `app/catalogue/page.tsx:135`, `:465-481`, `:603` | Fort | S |
| Prix promo sur les cartes | Jumia : prix barré et pourcentage sur chaque carte | Absent ✔ : la carte affiche le prix plein | `components/product-card.tsx:121` | Fort | S à M |
| Recherche par pertinence | Amazon : mots dans tout ordre, classement | Partiel : sous-chaîne entière, tri par date | `lib/recherche-synonymes.ts:180-185`, `lib/products.ts:549-551` | Fort | M |
| Fautes et synonymes kreyòl/français | Etsy : tolérance aux fautes | Présent ; kreyòl à faire relire | `lib/recherche-synonymes.ts:45-113`, `supabase/migrations/0047_search_demand.sql:379-438` | Atout | - |
| Autocomplétion | Amazon : produits et requêtes | Partiel : rayons seulement | `components/search-box.tsx:59-65` | Moyen | M |
| Filtre et tri par note, vendeur vérifié | Fiverr, Amazon | Absent | `lib/catalogue-query.ts:3-5` | Moyen | S |
| Recherche sans résultat | Aucune référence ne capte la demande | Présent : demande notée, partage WhatsApp | `app/catalogue/page.tsx:498-538` | Atout | - |
| Achat sans compte | Gumroad : courriel seul ; Etsy : invité | Absent ✔ : 401 puis connexion | `app/api/checkout/route.ts:186-188`, `app/api/panier/route.ts:29-31` | Fort | L, porteur |
| Bouton MonCash si rail indisponible | Bouton masqué ou grisé | **Défaut** ✔ : toujours affiché ; l'échec arrive après création de la commande | `app/produit/[slug]/page.tsx:159-161`, `app/api/checkout/route.ts:1064-1080` | Fort | S, porteur |
| Idempotence, confirmation serveur, réconciliation | Standard | Présent sur tous les rails | `lib/checkout-idempotency.ts:19-38`, `app/api/reconcile/route.ts:46-83` | Atout | - |
| Paiement unique du panier | Standard | Conditionné à un drapeau en base ; 2 à 10 articles, sans variante ni destinataire | `supabase/migrations/0128_zabelie_paiement_groupe.sql:58-87`, `app/api/panier/payer/route.ts:168-172` | Moyen | M, porteur |
| Récapitulatif avant paiement | Écran total et frais | Partiel : prix dans le bouton, aucun écran | `app/panier/page.tsx:209-212` | Moyen | M |
| Reçu acheteur | Reçu téléchargeable | Absent | `app/mes-achats/page.tsx:283-289` | Moyen | S |
| Courriel de confirmation | Adapté au type d'achat | Partiel ✔ : « Télécharger mes achats » pour un objet ou un service ; muet sans clé d'envoi | `lib/zabelie-notify.ts:128-134`, `lib/zabelie-email.ts:264-281` | Moyen | S (clé : porteur) |
| Messagerie | Fiverr : pièces jointes, temps réel, non-lus | Partiel ✔ : texte seul, rechargement manuel, pas de compteur global | `supabase/migrations/0090_messagerie.sql:27-32`, `components/message-form.tsx:69-70` | Moyen | M |
| Avis : achat vérifié | Etsy | Présent, par contrainte en base | `supabase/migrations/0008_reviews.sql:10` | Atout | - |
| Avis : photos, répartition, tri, signalement | Amazon | Absent ✔ ; 20 avis au plus et le titre compte ces 20 | `lib/reviews.ts:30-33`, `app/produit/[slug]/page.tsx:867` | Moyen | M |
| Remboursement | Retour automatique au moyen d'origine | Partiel ✔ : écriture comptable seule, argent rendu à la main, pas de partiel | `app/api/admin/refund/route.ts:14-19`, `supabase/migrations/0081_affiliation.sql:348` | Fort | M, porteur |
| Suivi du dossier de litige | Notification à chaque étape | Partiel : aucun envoi trouvé, l'état se lit dans la page | `app/assistance/commande/[id]/page.tsx:47-49` | Moyen | S |
| Édition d'une fiche par le vendeur | Standard partout | Absent (hypothèse forte, deux recherches concordantes) : seuls statut et photo sont écrits sur `products` | `app/api/products/cover/route.ts:159`, `app/api/admin/product-status/route.ts:108` | Fort | M |
| Historique des versements | Standard | Absent côté vendeur | `app/tableau-de-bord/page.tsx:192` | Moyen | S |
| Statistiques vendeur | Etsy : visites et conversion par fiche | Partiel : cumuls et vues de boutique, pas par produit | `app/tableau-de-bord/boutique/page.tsx:72-101` | Moyen | M |

### 3.1 Produits physiques (Amazon, Jumia, Zalando)

| Fonctionnalité | Référence | État Zabelie | Preuve | Impact | Effort |
|---|---|---|---|---|---|
| Variantes | Zalando : taille x couleur, image par variante | Partiel : un seul axe libre | `components/buy-button.tsx:476-510` | Moyen | M |
| Quantité | Standard | Absent ✔ : le panier impose 1, l'achat direct envoie 1 | `supabase/migrations/0058_panier.sql:39-40`, `components/buy-button.tsx:249` | Moyen | M (migration) |
| Galerie et zoom | Zalando : zoom, balayage | Galerie de 7 images et une vidéo ; zoom écarté par choix | `components/galerie-produit.tsx:12-13`, `:74-105` | Faible | S |
| État du stock | Standard | Présent | `components/buy-button.tsx:421-431` | - | - |
| Gestion du stock après création | Standard | Absent (hypothèse) | `app/api/products/physical/route.ts:423-430` | Fort | M |
| Coût et délai de remise sur la fiche | Amazon : date et frais avant l'achat | Partiel : « à convenir avec le vendeur » par défaut ; frais par zone sous conditions | `app/produit/[slug]/page.tsx:561-583`, `:298-310` | Fort | M |
| Frais de remise dans le total payé | Standard | Absent : seul le prix est encaissé | `app/api/checkout/route.ts:628` | Fort | L, porteur |
| Adresse de livraison | Standard | Partiel : « pour un proche » et zone facultative | `lib/order-recipient.ts:6-19` | Moyen | M |
| Délai réellement constaté | Aucune ne l'affiche par vendeur | Présent, au-dessus d'un seuil | `lib/delai-constate.ts:53-56` | Atout | - |
| Suivi de commande | Amazon : suivi transporteur | Présent : 5 états, sans transporteur (exclu par `docs/26` §0) | `lib/fulfillment.ts:117-123` | - | - |
| Preuve de remise | Jumia : code à la livraison | Présent : code à 6 chiffres qui libère l'argent | `app/api/fulfillment/handover/route.ts:14-26` | Atout | - |
| Points de retrait | Jumia : choix à la commande | Partiel : annuaire, pas un choix de commande | `lib/points-retrait.ts:13-18` | Moyen | M |
| Réception automatique | Standard | Présent à 7 jours, seulement si un courriel est parti | `lib/fulfillment-notices.ts:129-135` | Moyen | porteur (clé) |
| Signalement « non reçu » et gel | Garantie A à Z | Présent | `supabase/migrations/0043_fulfillment.sql:393-416` | Atout | - |
| Retours | Zalando : retour gratuit ; Jumia : 7 à 15 jours | Absent : motif « non conforme » seulement, aucun parcours | `lib/support-case.ts:2`, `lib/policy-terms.ts:173-176` | Fort | L, porteur |
| Produits similaires d'autres vendeurs | Amazon | Absent ; recommandations limitées au même vendeur | `supabase/migrations/0111_purchase_recommendations.sql:28-33` | Moyen | M |
| Achat pour un proche | Aucune ne gère un destinataire dans un autre pays | Présent | `components/buy-button.tsx:459-474` | Atout | - |

### 3.2 Produits digitaux (Gumroad, Etsy, Envato)

| Fonctionnalité | Référence | État Zabelie | Preuve | Impact | Effort |
|---|---|---|---|---|---|
| Vente et téléchargement disponibles | Immédiat | **Bloqué** ✔ sans reçu antivirus de moins de 7 jours ; le scanner est un script hors application, absent des crons | `app/api/checkout/route.ts:384-389`, `lib/digital-file-security.ts:7`, `docs/57-fondations-securite.md:13` | Fort | M, porteur |
| Aperçu du contenu | Envato : aperçu ; Etsy : images | Partiel : texte, liste de fichiers, leçons gratuites ; pas d'extrait du fichier | `components/digital-offer-preview.tsx:6-8` | Fort | M |
| Format, taille, licence | Envato : fiche technique structurée | Partiel : champs libres ; sinon « vérifiez avec le vendeur » | `lib/digital-details.ts:2`, `app/produit/[slug]/page.tsx:791` | Moyen | S |
| Licences à paliers | Envato : standard, étendue | Absent : texte libre | `lib/digital-details.ts:2` | Faible | M |
| Lien de téléchargement | Lien signé | Présent : 5 minutes, bucket privé | `app/api/download/route.ts:89-94` | - | - |
| Bibliothèque d'achats | Gumroad Library | Présent ; accès conservé si le produit est archivé | `lib/purchase-center.ts:5-11` | - | - |
| Lien par courriel | Gumroad | Partiel : renvoie vers « Mes achats » | `lib/zabelie-email.ts:264-281` | Moyen | S |
| Mises à jour de version | Envato | Présent ; aucun avis aux acheteurs trouvé | `lib/digital-studio.ts:41-43` | Faible | S |
| Réviser sans dépublier | Gumroad : immédiat | Absent ✔ : toute révision repasse en brouillon et en revue | `app/api/products/digital-studio/route.ts:35` | Moyen | porteur |
| Limite de téléchargements, filigrane | Gumroad : marquage PDF | Absent | recherche `watermark`, `download_limit` | Faible | M |
| Garde contre la vente sans fichier | Aucune aussi stricte | Présent, quatre gardes | `app/api/checkout/route.ts:371-383` | Atout | - |
| Produit gratuit | Gumroad : prix 0 | Présent | `app/api/checkout/route.ts:420-429` | Atout | - |
| Prix libre | Gumroad | À vérifier (non recherché) | - | Faible | - |
| Mode cours et progression | Gumroad : lecture en ligne | Partiel : leçons texte et cases « terminé » | `app/api/digital/progress/route.ts:13-19` | Faible | - |
| Litige sur fichier défaillant | Envato : remboursement encadré | Partiel : cas par cas, aucun gel, la maturation J+7 continue | `supabase/migrations/0113_haiti_marketplace_operations.sql:137-140` | Moyen | M, porteur |
| Carte pour la diaspora | Standard | Conditionné : Stripe et taux de change | `app/produit/[slug]/page.tsx:187-192` | Fort | porteur |
| Affiliation | Gumroad | Présent mais dormant | `app/tableau-de-bord/affiliation/page.tsx:44` | Faible | porteur |

### 3.3 Services (ComeUp, Fiverr, Malt)

| Fonctionnalité | Référence | État Zabelie | Preuve | Impact | Effort |
|---|---|---|---|---|---|
| Formules (basique, standard, premium) | Fiverr | Absent ✔ : prix unique, variante refusée hors physique | `lib/purchase-price.ts:16-19` | Fort | M, porteur (lot S1 de `docs/79`) |
| Options payantes | ComeUp | Absent ; écartées dans `docs/79` | `docs/79-CHANTIER-SERVICES-V2.md:468` | Moyen | décision prise |
| Délai de réalisation | Fiverr | Présent à l'affichage ; le retard n'y est pas lié (5 jours génériques) | `app/produit/[slug]/page.tsx:396-405`, `supabase/migrations/0068_service_rendu.sql:35-37` | Moyen | M |
| Liste « inclus » | Fiverr | Présent | `app/produit/[slug]/page.tsx:489-503` | - | - |
| Brief après commande | Fiverr : questions obligatoires | Absent | recherche `brief` ; `lib/service-starters.ts:35` | Fort | M (lot S3) |
| Dépôt de livrables | Fiverr | Absent : note libre seulement | `app/mes-ventes/page.tsx:36-39` | Fort | M (lot S2) |
| Révisions | Fiverr : nombre inclus | Absent | recherche `revision` | Moyen | M, porteur (lot S4) |
| Jalons | Malt | Absent | recherche `jalon`, `milestone` | Faible | L |
| Devis sur mesure | Malt, Fiverr | Partiel : factures `/pro` hors marketplace ; lot retiré, question D-S7 ouverte | `app/pro/page.tsx:42-58`, `docs/79-CHANTIER-SERVICES-V2.md:44` | Moyen | porteur |
| Contacter avant commande | Standard | Présent, sous le bloc d'achat, connexion requise | `app/produit/[slug]/page.tsx:824-848` | Moyen | S |
| Délai de réponse du prestataire | Fiverr | Absent | recherche `response_time` | Moyen | M |
| Portfolio, FAQ | Fiverr, Malt | Absent ; la FAQ n'existe que pour le digital | `components/digital-offer-preview.tsx:9` | Moyen | M |
| Profil prestataire | Malt : compétences, disponibilité | Partiel : boutique générique, note agrégée, badge identité | `components/boutique-vue.tsx:85-110` | Moyen | M |
| Niveaux de vendeur | Fiverr | Partiel : palier Elite en base, aucun chemin ne l'attribue | `lib/commission.ts:39-42`, `app/vendre/page.tsx:239-241` | Faible | porteur |
| Prise de rendez-vous | - | Absent ; seule une « prochaine disponibilité » | `lib/product-commitments.ts:14-18` | Moyen | L |
| Acceptation et validation automatique | Fiverr : 3 jours | Présent : 7 jours | `supabase/migrations/0068_service_rendu.sql:35-37` | - | - |
| Séquestre jusqu'à la prestation rendue | Fiverr, ComeUp | Présent | `supabase/migrations/0068_service_rendu.sql:82` | Atout | - |
| Modèles de prestation | - | Présent : 3 modèles, 4 langues | `lib/service-starters.ts:25-29` | Atout | - |

### 3.4 Absents voulus, hors plan d'action

Ces écarts aux références sont des choix écrits dans le dépôt. Ils ne sont pas repris au plan.

- Livraison, étiquettes, suivi transporteur : exclus (`docs/26` §0).
- Portefeuille acheteur, P2P, cash-in et cash-out : exclus (BRH, `CLAUDE.md`).
- Options payantes de service et devis hors fiche : écartés ou en question ouverte (`docs/79`).
- Zoom de galerie : écarté (`components/galerie-produit.tsx:12-13`).
- Détecteur de coordonnées dans la messagerie : écarté (`supabase/migrations/0090_messagerie.sql:32`).

## 4. Design et typographie

### 4.1 Ce qui tient (vérifié)

| Point | Résultat | Preuve |
|---|---|---|
| Contraste WCAG AA | Toutes les paires passent ; une exception nommée à 4,0:1 sur la recharge | `npm run check:contrast` exécuté ; `app/rechaj/page.tsx` |
| Couleurs hors thème | 43 occurrences : images de partage, page d'erreur globale, logo, `components/connexion-form.tsx`, `app/ouvrir-ma-boutique/etal.css` | recherche sur `app/` et `components/` |
| Tailles arbitraires | 7 dans tout le code | idem |
| Débordement horizontal | Aucun à 360 px sur 7 pages | mesure locale |
| Cibles tactiles sous 44 px | Aucune hors lien d'évitement | mesure locale |
| Accents kreyòl et français dans Inter | Aucun glyphe manquant sur 49 testés (à, è, ò, é, ç, œ, guillemets, ★, ✓) | `app/fonts/InterZabelie-4.1.1.woff2`, fontTools |
| Poids des polices | Inter 52,1 Ko, Manrope 24,6 Ko, accent 11,4 Ko : 87,9 Ko pour un budget de 90 | `app/layout.tsx:44-45`, `:73` |
| CLS | 0 à 0,0006 sur l'accueil en production | mesure du 2026-11-10 |

### 4.2 Constats

D1, D2, D3 et D5 ne figurent pas dans `docs/design/RAPPORT-FINAL.md` ; D7 à D10 y sont déjà.

| # | Constat | Mesure ou preuve | Impact | Effort |
|---|---|---|---|---|
| D1 | Catalogue : aucun produit au premier écran mobile. Fil d'Ariane, titre, puces d'univers, filtre et puces de rayon passent avant | Première carte à 743 px ; zone utile 743 px (800 moins la barre de 57) | Fort | S |
| D2 | Fiche : le bouton de paiement est hors écran, sans rappel fixe | Bouton à 1 012 px (digital) et 1 216 px (service), prix à 713 px ; aucun élément collant dans `main` | Fort | M, porteur (chemin de l'argent) |
| D3 | L'en-tête et la barre du bas occupent 25 à 34 % de l'écran | Contenu à 145 px (accueil), 202 px (fiche), 215 px (catalogue), plus 57 px de barre | Moyen | S à M |
| D4 | Le texte courant est surtout en 12 et 14 px, alors que le corps est posé à 16 px | Accueil : 35 blocs en 12 px, 32 en 14 px, 3 en 16 px. Code : `text-xs` 382 fois, `text-sm` 730, `text-base` 29. Migration par rôle annoncée en `app/zabelie-theme.css:201` | Moyen | M |
| D5 | Catalogue : trois niveaux de navigation qui se recouvrent (onglets d'en-tête, puces d'univers, puces de rayon) | `app/catalogue/page.tsx:245-248`, `:412-427` | Moyen | S |
| D6 | Fiche : lien de retour sous la photo ; produit sans photo rendu en aplat orange, couleur réservée à l'action | capture ; `docs/design/DESIGN-SYSTEM.md`, « Couleurs » | Faible | S |
| D7 | Libellés de rayon non traduits en kreyòl (ils viennent de la base) | capture ; `docs/design/RAPPORT-FINAL.md`, « Points restants » | Moyen | porteur |
| D8 | Fondus qui animent couleur, bordure ou ombre | 49 `transition` nus | Faible | S |
| D9 | Formulaire vendeur physique : textes en dur | `components/physical-product-form.tsx` | Moyen | M |
| D10 | LCP de l'accueil : 3,0 s en simulation Lighthouse 4G lente selon le dépôt ; 1,07 à 1,34 s dans la mesure bridée du 2026-11-10 | `docs/design/RAPPORT-FINAL.md` ; mesure en production | À surveiller | voir 4.3 |

### 4.3 Polices

- **Inter (corps) : à garder.** La découpe couvre accents kreyòl et français et symboles d'interface, en un fichier variable.
- **Instrument Serif (mot d'accent) : à garder, avec une réserve.** La découpe ne contient pas `œ`, `Â`, `Ë`, `Î`, `Ï`, `Ù`, `Û`, `Ü` ni les guillemets. Un test vérifie chaque mot d'accent existant ; un futur mot comme « cœur » échouerait à ce test, ce qui est le comportement voulu.
- **Une seule alternative, une suppression : titres en Inter au lieu de Manrope.** Gain certain : 24,6 Ko de moins (28 % du poids des polices) et un fichier de moins. Gain de LCP : **hypothèse, non mesurée**. À ne retenir que si une mesure avant et après le montre (critère en P2-8).
- Pas de seconde alternative. Une police système pour le corps économiserait 52 Ko, mais renverrait ✓, → et ★ à la police du téléphone, défaut corrigé le 2026-09-26 (`docs/REVUE-2026-09-26-typographie.md`).

## 5. Page d'accueil

### 5.1 Audit (production, 2026-11-10)

| Critère | État | Constat | Preuve |
|---|---|---|---|
| Proposition de valeur en 5 s | Partiel | Titre « Òf vandè ayisyen yo » : dit quoi, pas pourquoi ni comment payer | `lib/i18n.ts:2223-2225` |
| CTA principal | Présent | Un bouton orange, « Gade katalòg la » ; il mène à un catalogue d'un produit | `app/page.tsx:276-278` ; 1 carte mesurée |
| Accès aux 3 verticales | Partiel | Bloc « Kisa w ap chèche? » présent mais hors du premier écran ; pas d'onglets d'univers dans l'en-tête mobile de l'accueil | `app/page.tsx:345` |
| Paiement MonCash | Défavorable, honnête | « MonCash nan faz tès: pa gen peman reyèl » | `components/marketplace-status.tsx:5-7` |
| Vendeurs vérifiés | Absent de l'accueil | Badge sur la fiche et la boutique seulement | `app/produit/[slug]/page.tsx:516-518` |
| Avis | Absent de l'accueil | Note sur une carte à partir de 3 avis | `lib/note-affichee.ts:31-38` |
| Séquestre | Présent, peu visible | Premier des quatre repères, en 12 px | `app/page.tsx:300-308` |
| Preuve sociale | Masquée, à raison | Seuil de 3 vendeurs ; rien n'est inventé | `lib/home-sections.ts:26`, `:47-49` |
| Premier produit visible | Limite | Première carte à 705 px en kreyòl, 772 px en français (zone utile 743 px) | mesure |
| LCP | Bon dans cette mesure | Élément LCP : le titre. 1,07 à 1,34 s en 4G lente bridée (3 passages), 1,78 s en 3G lente (1 passage) | mesure |
| CLS | Bon | 0 à 0,0006 | mesure |
| Poids | Correct | 305 à 338 Ko : scripts 185, polices 88, styles 23, page 19 | mesure |
| Kreyòl d'abord | Non tenu à l'arrivée | Sans cookie, la langue est le français, même si le navigateur demande le kreyòl (décision du 2026-09-02) | `lib/i18n-server.ts` (`getLang`), `lib/langue-url.ts:20` |
| Ton | À retourner | « Comment recevoir votre achat ? » se termine sur ce que Zabelie ne fait pas | `lib/i18n.ts:2241` |

Hypothèse : le LCP reste bon tant que le plus grand élément est du texte. Avec des photos produit dans le premier écran, leur poids comptera ; elles ne sont pas redimensionnées (point A11, en attente du porteur).

### 5.2 Structure cible

Principe : garder composants et seuils existants, changer l'ordre et quatre textes. Aucune promesse qui ne soit déjà tenue par le code. Les textes kreyòl sont de l'auditeur et demandent une relecture native ; les formulations de promesse sont à valider par le porteur.

| # | Section | Titre (kreyòl / français) | CTA | Par rapport à l'existant |
|---|---|---|---|---|
| 1 | En-tête | Recherche : « Chèche yon pwodwi… » | - | Ajouter sous la recherche les trois raccourcis déjà présents ailleurs : Pwodwi, Dijital, Sèvis |
| 2 | Bannière | « Achte nan men vandè *ayisyen*, peye an goud » / « Achetez aux vendeurs *haïtiens*, payez en gourdes ». Phrase : « Vandè a pa touche anvan li remèt ou sa ou achte a. » / « Le vendeur n'est payé qu'après la remise. » | Orange : « Gade katalòg la ». Lien texte : « Vann sou Zabelie » | Nouveau titre ; la phrase reprend la promesse déjà affichée (`trust.2.b`) ; le lien vendeur remonte |
| 3 | Repères | « Swivi acha yo · Pri an goud · Èd sou WhatsApp » | - | Trois repères au lieu de quatre |
| 4 | Offres | « Dènye òf yo » / « Dernières offres » | « Wè tout » | Renommé : l'ordre est la date de création. Prix promo visible sur les cartes |
| 5 | Ventes flash | Titre existant | existant | Inchangé, conditionnel |
| 6 | Trois univers | « Kisa w ap chèche? » | « Gade pwodwi yo », « Gade fichye yo », « Gade sèvis yo » | Remonté juste après les offres |
| 7 | Pourquoi Zabelie | « Poukisa achte sou Zabelie? » / « Pourquoi acheter sur Zabelie ? » : « Lajan ou pwoteje », « Vandè ak idantite verifye », « Avi apre acha sèlman » | « Kijan sa mache » | Nouveau bloc, trois faits déjà vrais dans le code, en 16 px |
| 8 | Preuve sociale | « Sa achtè yo di » / « Ce que disent les acheteurs » ; « Meyè vandè yo » | - | Avis : nouveau, au-dessus d'un seuil. Vendeurs : existant |
| 9 | Diaspora | « Achte pou yon pwòch ann Ayiti » / « Achetez pour un proche en Haïti » | « Gade kijan » | Nouveau bloc pour une fonction déjà construite |
| 10 | Remise | « Kijan pou resevwa sa ou achte a? » ; phrase retournée : « Ou dakò ak vandè a sou remiz la, epi ou konfime lè ou resevwa li. » | « Wè twa etap yo » | La limite (ni stock ni livraison) reste, en seconde phrase |
| 11 | Vendre | « Louvri boutik ou an liy » ; pastille « 0 HTG pou louvri » | « Kòmanse vann » | Inchangé |
| 12 | Pied de page | État des paiements par rail | - | Inchangé |

L'état « catalogue vide » (bannière vendeur « Konesans ou merite pwòp boutik li ») reste tel quel.

## 6. Plan d'action priorisé

Chaque item porte un critère d'acceptation vérifiable. « Qui » : **agent** quand aucune décision n'est requise, **porteur** sinon. Aucun item ne touche au préfixe `zabelie_`, à la RLS, au ledger append-only ni à la conformité BRH ; toute migration reste rédigée et non appliquée jusqu'au geste du porteur.

### P0 : ce qui empêche une vente ou trompe l'acheteur

| # | Action | Qui | Critère d'acceptation |
|---|---|---|---|
| P0-1 | Catalogue : rendre la grille des exacts puis celle des approchants | agent | Une requête qui rend 1 exact et au moins 1 approchant affiche les deux grilles, exacts d'abord ; un test échoue si la grille des exacts est retirée de cette branche (mutation jouée) |
| P0-2 | N'offrir le bouton MonCash que si le rail peut encaisser | porteur (chemin de l'argent), puis agent | Avec `getMonCashAvailability()` à `unavailable`, la fiche ne rend aucun bouton MonCash et dit pourquoi ; un `POST /api/checkout` sur ce rail est refusé **avant** toute création de commande ou réservation de stock (nombre de lignes `orders` inchangé dans le test) |
| P0-3 | Afficher le prix remisé ou flash sur les cartes | agent | Pour un produit en rabais ou en vente flash active, la carte du catalogue, de la boutique et des favoris affiche le même prix que la fiche, avec le prix barré ; le prix reste calculé au serveur |
| P0-4 | Courriel de confirmation accordé au type d'achat | agent | Trois gabarits ou une branche par `kind` via `lib/product-kind.ts` ; un test vérifie que le courriel d'un produit physique et celui d'un service ne contiennent pas l'invitation à télécharger, en français et en kreyòl |
| P0-5 | Catalogue mobile : une rangée de cartes dans le premier écran | agent | À 360 x 800, sur `/catalogue` en kreyòl et en français, le haut de la première carte est à 560 px ou moins ; aucun débordement horizontal ; axe reste à 0 violation |
| P0-6 | Fiche mobile : rappel fixe « prix + payer » | porteur (bouton d'achat), puis agent | À 360 x 800, sur une fiche de chaque type, un contrôle d'achat est visible sans défilement ; un seul bouton orange à l'écran ; CLS de 0,05 ou moins ; les specs e2e de toutes les configurations de `ci.yml` passent |
| P0-7 | MonCash en production (`docs/56`, `docs/76`) | porteur | Une ligne `payments` au rail `moncash`, statut confirmé, avec référence opérateur, pour une commande réelle ; la ligne « phase de test » disparaît de l'accueil |
| P0-8 | Déployer le scanner antivirus du digital (`docs/57`) | porteur | Un fichier vendeur porte un reçu `clean` de moins de 7 jours ; un achat digital puis un téléchargement aboutissent sans 503 ; le scanner tourne selon une cadence inférieure à 7 jours, journalisée même à zéro |
| P0-9 | Clé d'envoi des courriels | porteur | `zabelie_outbox` contient au moins une ligne avec `sent_at` non nul après une commande de test ; l'auto-réception n'escalade plus par défaut en file admin |
| P0-10 | Confirmer le constat « pas d'édition de fiche » | agent | Parcours de l'espace vendeur sur une copie locale avec base de test : pour titre, description, prix et stock, le rapport dit « modifiable ici » avec la capture, ou « non modifiable » avec la tentative. Si non modifiable, P1-1 est maintenu |

### P1 : ce qui rapproche des références, par ordre d'effet

| # | Action | Qui | Critère d'acceptation |
|---|---|---|---|
| P1-1 | Édition par le vendeur : stock sans dépublication ; titre, description et prix selon une règle de revue à fixer | porteur (règle de revue), puis agent | Un vendeur change le stock d'une variante publiée, la fiche reste en vente et le nouveau stock s'affiche ; un autre vendeur est refusé par la RLS (test SQL) ; la règle de revue pour titre et prix est écrite dans `docs/02-DECISIONS.md` |
| P1-2 | Accueil : structure cible de la section 5.2 | porteur (titre, phrase), puis agent | À 360 x 800, en kreyòl et en français, le premier écran contient le titre, le bouton orange, les trois raccourcis d'univers et le haut de la première carte (743 px ou moins) ; LCP de 2,5 s ou moins en 4G lente Lighthouse, médiane de 3 passages ; CLS de 0,05 ou moins ; `tests/home-premium-structure.test.ts` mis à jour et vert |
| P1-3 | Langue d'arrivée : suivre la langue du navigateur, français en repli | porteur (revient sur la décision du 2026-09-02), puis agent | Une requête sur `/` sans cookie avec `Accept-Language: ht` rend `lang="ht"` ; avec `fr` ou sans en-tête, `lang="fr"` ; canoniques et `hreflang` de `docs/47` inchangés |
| P1-4 | Recherche multi-mots, ordre libre | agent | « rouge chaussure » trouve un produit titré « Chaussure rouge » ; le jeu de test contient des mots à accent final (`vandè`, `bò`, `café`) et passe en kreyòl et en français |
| P1-5 | Filtre et tri par note ; badge « identité vérifiée » sur la carte et en filtre | agent (libellé du badge déjà validé sur la fiche) | Les paramètres d'URL sont en liste blanche dans `lib/catalogue-query.ts` ; le filtre « vérifié » ne rend que des vendeurs au dossier approuvé (test avec un vendeur de chaque état) |
| P1-6 | Services v2, lots S1 à S4 | porteur (go sur `docs/79`, décisions D-S1 et D-S7) | Les critères de `docs/79` §6 ; au minimum : une fiche service à trois niveaux se paie au prix du niveau choisi, figé à la commande, et un montant forgé par le client est ignoré |
| P1-7 | Digital : extrait du fichier et fiche technique structurée (format, taille, pages) | agent | Une fiche digitale affiche format et taille lus sur le fichier stocké, pas saisis ; l'extrait est servi sans exposer le fichier complet (test : l'URL de l'extrait ne donne pas accès au livrable) |
| P1-8 | Reçu acheteur imprimable depuis « Mes achats » | agent | Pour une commande payée : référence, date, vendeur, montant en HTG, rail ; la page s'imprime en une page A4 ; une commande d'un autre acheteur renvoie 404 |
| P1-9 | Notifier acheteur et vendeur à chaque changement d'état d'un dossier | agent (dépend de P0-9) | Ouverture, réponse et clôture déposent chacune une ligne dans `zabelie_outbox` pour les deux parties ; test avec les trois transitions |
| P1-10 | Avis : compte réel, pagination, répartition par note, signalement | agent ; migration à faire appliquer | Le titre affiche `ratingCount` ; au-delà de 20 avis un lien charge la suite ; un avis signalé apparaît dans une file admin ; le masquage d'un avis recalcule la moyenne (test SQL) |
| P1-11 | Quantité à l'achat pour le physique | porteur (migration), puis agent | Une commande de 3 unités réserve 3 en stock et encaisse 3 fois le prix de la variante, calculé au serveur ; une quantité supérieure au stock est refusée avant paiement |
| P1-12 | Récapitulatif avant paiement, avec frais de remise déclarés en information | agent | Avant la redirection opérateur, un écran liste article, prix, frais de remise annoncés par le vendeur (hors encaissement, dit en toutes lettres) et total encaissé ; le montant encaissé reste le prix seul |
| P1-13 | Texte courant à 16 px sur trois rôles : descriptions, aide avant paiement, cartes produit | agent | Sur l'accueil et la fiche à 360 px, les paragraphes de ces rôles mesurent 16 px ; `tests/design-echelles.test.ts` reste vert ; aucun débordement |
| P1-14 | Messagerie : compteur de non-lus dans la navigation, rafraîchissement du fil | agent | Avec un message non lu, le lien « Messages » porte un compteur dont le nom accessible reprend le texte visible (WCAG 2.5.3) ; un fil ouvert affiche un nouveau message en moins de 30 s sans rechargement manuel |
| P1-15 | Historique des versements côté vendeur | agent | Le tableau de bord liste chaque demande avec date, montant et état ; un vendeur ne voit que les siennes (test RLS) |
| P1-16 | Formulaire vendeur physique en i18n, quatre langues | agent ; relecture kreyòl : porteur | Aucune chaîne visible en dur dans `components/physical-product-form.tsx` ni dans les erreurs de `app/api/products/physical/route.ts` ; `tests/i18n-cles-mortes.test.ts` vert |

### P2 : après les premières ventes

| # | Action | Qui | Critère d'acceptation |
|---|---|---|---|
| P2-1 | Remboursement partiel et délai d'exécution annoncé | porteur (argent, `docs/17`) | Écriture compensatoire du montant partiel ; `Σ(wallet_transactions) = balance_htg + pending_htg` reste vrai après l'opération (test money-path) |
| P2-2 | Politique de retour par boutique et parcours de retour physique | porteur | La fiche affiche la politique du vendeur ; un retour accepté passe par un état dédié du dossier, sans nouvelle valeur d'énumération sur `order_status` |
| P2-3 | Pièces jointes en messagerie et preuves dans les dossiers | porteur (policies de stockage) | Un fichier joint n'est lisible que par les deux parties et l'admin (test RLS sur `storage.objects`) ; types et taille bornés au serveur |
| P2-4 | Produits similaires d'autres vendeurs sur la fiche | agent | Une rangée de 4 produits de la même catégorie, hors vendeur courant, masquée sous 4 résultats |
| P2-5 | Statistiques par produit (vues, ventes, conversion) | agent | Le vendeur voit vues et commandes sur 30 jours par fiche ; aucune donnée d'un autre vendeur (test RLS) |
| P2-6 | Variantes à deux axes | porteur (migration) | Une fiche taille x couleur se paie au prix et au stock de la combinaison choisie |
| P2-7 | Service : délai de réponse, portfolio, FAQ | agent | Le délai de réponse n'apparaît qu'au-dessus d'un seuil de fils mesurés ; la FAQ réutilise le composant du digital |
| P2-8 | Titres en Inter au lieu de Manrope, sur mesure | porteur (identité) | Lighthouse 4G lente, 3 passages entrelacés avant et après sur l'accueil et la fiche : adopté seulement si la médiane du LCP baisse d'au moins 150 ms ; sinon abandonné et consigné |
| P2-9 | Fondus de survol ramenés à `transform` et `opacity` | agent | 0 utilitaire `transition` nu dans `app/` et `components/` ; un test le garde |
| P2-10 | Autocomplétion de produits dans la recherche | agent | Dès 2 caractères, jusqu'à 5 titres de produits publiés, en plus des rayons ; requête bornée et limitée en débit |
| P2-11 | Achat sans compte | porteur | Décision écrite ; si oui, une commande par courriel seul garde idempotence et accès aux achats |
| P2-12 | Photos d'avis, filigrane digital, licences à paliers, attribution du palier Elite | porteur | À spécifier après les premières ventes |

## 7. Décisions attendues du porteur

1. P0-2 et P0-6 : accord pour toucher la présentation du bouton d'achat.
2. P0-7, P0-8, P0-9 : MonCash en production, scanner antivirus, clé d'envoi.
3. P1-2 : titre et phrase de la bannière ; phrase de paiement près des boutons (point A13).
4. P1-3 : langue d'arrivée.
5. P1-1 : règle de revue quand un vendeur modifie une fiche publiée.
6. P1-6 : go sur `docs/79`.
7. Relecture native du kreyòl pour tous les textes proposés ici.
