# Découverte et conversion Zabelie — audit du 22 septembre 2026

## Base vérifiée

Site cible : https://zabelie.com/. Dépôt : eliezerphilippe0-spec/Zabelie-Digi.
Le nom du dépôt est historique : CLAUDE.md confirme qu'il porte la marketplace physique, numérique et services.
Le 22 septembre, /api/deployment retourne l'empreinte SHA-256 du commit 1a4557ea6fbc99e8008321bd198e265ce1b5eb8c, identique à origin/main récupéré.
La page publique observée affiche « Le catalogue prend forme » sans offre visible et MonCash en phase de test. Il s’agit d’un constat de la surface publique, pas d’un inventaire des brouillons vendeurs.
Travail isolé dans la branche feat/decouverte-sans-doublons. Aucune modification de production, migration appliquée, notification ou paiement réel.

## Audit et décisions

| Fonctionnalité | Preuve dans le code | Lacune / décision | Priorité | Dépendances |
|---|---|---|---|---|
| Confiance et remise | components/product-commitment-details.tsx, lib/product-commitments.ts, docs/59-marketplace-confiance-hors-ligne.md | Conserver : engagements vendeur, disponibilité et conditions déjà présents. Validation opérationnelle réelle hors de ce lot. | P1 | Déclarations vendeur et migration 0107 |
| Paiement et bénéficiaire | lib/order-recipient.ts, app/api/checkout, lib/seller-pricing-server.ts | Conserver les états serveur et le bénéficiaire existants. Aucun second checkout. | P1 | Prestataires et opérations existants |
| Recherche / budget / destination | app/catalogue/page.tsx, lib/catalogue-query.ts, lib/products.ts | Compléter : effacer uniquement la recherche conserve les filtres ; les rayons proposés quittent enfin la requête infructueuse. Navigation GET centralisée. | P1 | Aucune nouvelle |
| Accents et fautes | supabase/migrations/0047_search_demand.sql, lib/products.ts | Réutiliser la normalisation FR/créole et le rattrapage trigramme. Une panne du rattrapage optionnel ne provoque plus un 500. | P1 | RPC existante ; pas de nouveau moteur |
| Synonymes FR/créole | Même moteur ; aucun lexique métier explicite trouvé | Reporter l'expansion sémantique à un lexique validé sur le catalogue et un jeu de recherches attendu. Ne pas assimiler similarité et traduction. | P2 | Lexique et pertinence validés |
| Doublons de découverte | app/page.tsx, lib/home-sections.ts | Corriger : attribution par ID, y compris l'offre de bannière, avant limitation ; les rangées masquées ne réservent rien. | P1 | Catalogue publié existant |
| Nouveautés | lib/products.ts : ordre created_at | La création n'est pas la première publication. Conserver des ajouts au catalogue, sans badge de nouveauté ni promesse de fraîcheur. | P2 | Date de première publication immuable pour une véritable rubrique Nouveautés |
| Tendances | Aucun historique fiable de progression identifié | Reporter et ne pas afficher de fausse tendance. | P2 | Signaux dédupliqués, période et seuils configurés |
| Meilleures ventes | sales_count et commandes paid | Ne pas créer de nouveau palmarès. Vendeurs renommés de façon neutre, identité par ID, exclusion des acheteurs is_test et masquage des comptes si lecture incomplète. Le compteur historique du catalogue reste inchangé ; il ne prouve pas un classement net sur une période. | P2 | Agrégat couvrant remboursements, livraison, essais et fenêtre de mesure |
| Promotions | Ancien promoSellerIds de l'accueil | Retirer la rangée : un coupon chez un vendeur ne prouve pas l'éligibilité de chaque offre. Les vrais rabais des fiches restent dans leur système existant. | P1 | Éligibilité effective nécessaire avant une nouvelle sélection promo |
| Collections par besoin | lib/catalogue-universes.ts, taxonomie, guides existants | Conserver la navigation publique. Ne pas confondre lib/collections.ts (favoris personnels) avec une curation éditoriale. Reporter les collections rentrée/cadeaux non étayées par le catalogue. | P2 | Produits admissibles et sélection éditoriale validée |
| Alternatives et compléments | lib/product-offers.ts, components/product-offers.tsx, migration 0110 | Réutiliser les offres associées explicites déjà livrées. Pas de recommandation automatique inventant une compatibilité. | P2 | Associations vendeur et disponibilité |
| Favoris / suivi | lib/collections.ts, components/collection-toggle.tsx | Conserver les deux collections et leurs permissions, sans nouvelle table. | P2 | Auth et tables existantes |
| Alertes prix / stock | lib/alertes.ts concerne les incidents administratifs | Reporter : une alerte admin ne remplace pas un abonnement marketing acheteur. | P3 | Consentement, désinscription, déduplication, historique prix/stock |
| SEO et partage | generateMetadata du catalogue, guides, canonical et noindex | Conserver. Liens de rubrique numérique/services/gratuit corrigés pour ouvrir le bon filtre. | P2 | Contenu réel |
| Mesure | lib/metrics.ts, capteur search-demand, suivi des offres associées | Réutiliser sans dupliquer les événements. Aucun gain commercial chiffré revendiqué. | P2 | Trafic réel et observabilité existante |

## Règles du lot

- Une requête de catalogue, bornée à 60 offres, alimente la découverte. Aucun algorithme de personnalisation ajouté.
- Ordre d'attribution : bannière si au moins deux offres, sélection principale (12), autres ajouts (6), numérique (6), services (6), gratuit (6).
- Identité canonique : products.id. Deux offres de vendeurs distincts restent distinctes même si leurs titres sont identiques.
- Déduplication avant découpage. Une section secondaire avec moins de six offres inédites s'efface sur tous les écrans et ne consomme aucun ID. La principale reste visible dès une offre.
- Les ajouts suivent created_at ; aucune modification de fiche ne les remonte. Aucun délai de nouveauté n'est inventé.
- Les vendeurs présentés ne constituent pas un classement global. Leurs comptes proviennent uniquement des produits présents dans le catalogue borné, des commandes paid et des acheteurs non marqués is_test. La section s'efface si l'API ne retourne pas la totalité du résultat compté. L'absence d'un marquage exhaustif des transactions sandbox empêche de qualifier ces données de palmarès commercial.
- Les corrections utilisent les quatre langues existantes. Les filtres restent partageables et utilisables sans JavaScript.

## Contrôles

- TypeScript et compilation de production : réussis.
- Lint : aucune erreur ; sept avertissements dans des composants non modifiés.
- Suite complète : 1 145 réussites / 1 162 tests. Les 17 échecs ont les mêmes noms sur une copie intacte du commit de base ; aucune nouvelle défaillance. Ils concernent notamment les chemins Windows, les fins de ligne CRLF et les extracteurs structurels existants.
- 28 tests ciblés accueil/catalogue réussis ; contrôle des clés i18n et des traductions réussi après suppression de la clé de promotion devenue inutilisée.
- Test anti-doublons éprouvé sur une copie temporaire : retirer la garde provoque bien l’échec du scénario de chevauchement, sans modifier le projet.
- Chrome installé, via Playwright : sept scénarios réussis (catalogue, SEO, guides et découverte). Les deux nouveaux parcours couvrent 390 × 1000 et 1440 × 1000, un clic fiche puis une recherche infructueuse et son effacement avec conservation du budget, de l’univers et du tri.
- Captures locales : six offres distinctes pour six liens, aucun débordement horizontal, aucune erreur JavaScript de page sur l’accueil. Inspection visuelle effectuée sur l’accueil ordinateur et la recherche mobile.
- Outils de navigateur intégrés : démarrage échoué ; validation effectuée avec Playwright et Chrome déjà installés. Aucun navigateur ni dépendance ajouté.
- Limites : données de démonstration exclusivement locales ; pas de validation de commande, livraison ou paiement réel. La jointure de comptage vendeur n’a pas été exécutée sur la base distante faute de configuration locale ; elle masque la section en cas d’erreur ou de réponse incomplète.
- Artefacts locaux : C:/Users/Philippe/output/zabelie-decouverte/ (journaux, captures, comparaison baseline).

## Correction du contrôle e2e de la PR #263

Le test de tarification attendait une bannière `.home-featured` même lorsque la fixture ne publie qu’un produit. Cette hypothèse contredisait la règle anti-doublons : ce produit apparaît une seule fois dans la grille principale. Le test vérifie désormais un lien de découverte unique et visible, puis un véritable clic, séparément depuis l’accueil et le catalogue. Les contrôles des accès directs, du préchargement, du cookie signé et de la source de commande restent présents.

Validation locale : les cinq scénarios de `playwright.pricing.config.ts` passent avec Chrome. Les contrôles GitHub du commit précédent avaient déjà validé la compilation, les tests unitaires, les tests SQL et le parcours de paiement ; l’échec se situait uniquement dans cette assertion de présentation.

## Retour arrière

Revenir au commit de base suffit : aucune migration, aucun nouveau service ni variable de production. Aucun déploiement n'est réalisé dans cette mission.
