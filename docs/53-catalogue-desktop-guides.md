# Catalogue ordinateur, fiches numériques et guides multilingues

Date : 8 septembre 2026. Branche : `feat/catalogue-desktop-seo`.

## Changements

- Navigation ordinateur : panier accessible aux visiteurs, libellés visibles et accès direct à Mes achats. Les compteurs restent issus du compte connecté.
- Une seule recherche dans le catalogue, qui conserve univers, sous-rayon, budget, tri et zone validée. Les filtres GET fonctionnent sans JavaScript.
- Budgets minimum/maximum en HTG, nouveautés, prix croissant/décroissant et ventes réelles. Les conditions sont appliquées avant la pagination. Une borne inversée est expliquée ; aucune suggestion ne contourne le budget.
- Les fichiers numériques ignorent les anciennes zones de remise. Les produits physiques conservent la remise organisée par leur vendeur.
- Caractéristiques physiques existantes déplacées avant la décision d’achat. Six caractéristiques numériques publiques sont éditables sur les brouillons : formats, langue, compatibilité, licence, contenu, version/mises à jour. Les champs vides ne sont pas inventés. Une lecture en échec ne permet pas d’écraser des données inconnues.
- Migration additive `0103_digital_details.sql` : table dédiée sans URL de fichier, RLS lecture publique seulement pour les produits publiés, lecture privée du brouillon par son propriétaire. Écriture par l’API authentifiée, avec contrôle du propriétaire, suspension et cadence. Le trigger verrouille le produit et refuse une édition après publication ou sur un autre type de produit.
- Modération : les six caractéristiques sont aussi consultables dans la liste administrateur avant publication, après contrôle du rôle.
- Accueil sans offre vedette : suppression de la colonne vide, meilleure lisibilité sur ordinateur, polices et palette existantes conservées.
- SEO : description par univers, pagination avec sa propre canonique, `noindex` des vues de recherche/tri/prix et des pages sans résultat. La requête du catalogue est partagée entre métadonnées et rendu, uniquement pour la requête courante.
- Sitemap sans connexion ni dates de modification inventées ; exclusion des univers et rayons sans offres connues.
- Guides pour acheter en Haïti, choisir un fichier et acheter pour un proche : 12 articles + 4 index, avec URL par langue, canoniques, hreflang réciproques et liens depuis l’aide/pied de page. La langue de l’URL prévaut sur le cookie uniquement sur ces guides. Le document HTML suit aussi les navigations client.

## Vérification

Build de production, types, lint, contraste, tests Node, E2E Chrome et tests SQL transactionnels. Les résultats définitifs et le SHA sont à lire dans les contrôles de la PR. Les tests locaux Windows comportent des échecs préexistants de normalisation de chemins et de fins de ligne ; la CI Linux est la référence complète. Les nouveaux tests vérifient les bornes, canoniques, langues, sauvegarde après rechargement, propriétaire et refus des types/tailles invalides. Les tests SQL vérifient les permissions réelles et sont annulés par ROLLBACK.

## Mise en ligne

Après CI verte : appliquer uniquement 0103 au projet `ddditxykopuxxqzgkqwy`, vérifier l’empreinte et inscrire la preuve au registre, puis fusionner la PR. Ne pas appliquer globalement les migrations ; 0056 reste gelée. Contrôler ensuite le déploiement, `/api/readyz`, le HTML des guides, les filtres et `/sitemap.xml`.

## Limites et prochaines décisions

Le catalogue réel doit être alimenté avec les produits, prix, photos et modalités des vendeurs. Aucun produit fictif n’est ajouté. L’activation commerciale d’un moyen de paiement nécessite ses paramètres et une transaction autorisée ; ce lot ne la déclare pas acquise.

Les URL multilingues concernent les guides, pas encore toutes les catégories et fiches. Les caractéristiques numériques ne remplacent pas un dispositif de versionnement des fichiers/licences, des aperçus publics distincts du livrable privé ni une analyse antivirus. Ces sujets nécessitent un chantier spécifique, notamment pour conserver les droits des anciens acheteurs.

Les prochains travaux opérationnels : recrutement de vendeurs dans quelques rayons, essai complet d’un achat autorisé, délais de réponse/stock côté vendeur, suivi des échecs de paiement et de remise, coût et marge par commande. Zabelie ne possède pas d’entrepôt et ne livre pas.

## Références techniques

- Google : https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading
- Google : https://developers.google.com/search/docs/specialty/international/localized-versions
- Google : https://developers.google.com/search/docs/appearance/ai-features
- Supabase : https://supabase.com/docs/reference/javascript/using-modifiers-order
