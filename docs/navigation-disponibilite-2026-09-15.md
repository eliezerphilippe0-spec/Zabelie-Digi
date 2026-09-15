# Navigation et disponibilité — 15 septembre 2026

La recherche de l’en-tête utilisait environ 120 px sur un écran de 390 px. Elle dispose maintenant de sa propre ligne sur mobile et tablette, garde les filtres de recherche, et reste accessible après défilement. Les réglages de langue, de thème et de compte restent accessibles. Sur ordinateur, la recherche reste dans la ligne principale.

L’accueil signale l’ouverture progressive quand MonCash n’est pas configuré pour la production. Le texte distingue le bac à sable et l’indisponibilité. Ces états sont calculés côté serveur sans exposer les identifiants. Ils décrivent la configuration, pas une preuve d’agrément ou de paiement réussi. Le checkout et les validations financières ne changent pas.

La navigation et la carte Recharges signalent l’indisponibilité avant le clic, à partir du drapeau existant. La page Recharges et le pied de page lisent les contrôles existants de MonCash, Zelle et Stripe. NatCash conserve son statut prévu. Les quatre langues sont couvertes.

Les formulations « Argent protégé », « payez avec MonCash » et la réception digitale inconditionnelle ont été remplacées sur l’accueil par des étapes précises : consulter les moyens disponibles, confirmer le paiement, retrouver son achat. L’état vide offre un accès direct à la création d’une offre.

## Diagnostic du catalogue, lecture seule

Projet Supabase ddditxykopuxxqzgkqwy, 15 septembre 2026 :

| Type / état | Nombre | Comptes de test | Avec couverture | Avec fichier digital |
| --- | ---: | ---: | ---: | ---: |
| Digital / brouillon | 6 | 5 | 0 | 0 |
| Physique / brouillon | 1 | 1 | 1 | 0 |
| Service / archivé | 3 | 3 | 0 | 0 |

Aucune offre publiée. Le seul brouillon d’un compte non test n’a ni couverture ni livrable. Aucune publication forcée ni création de fausse offre. Le vendeur doit fournir un véritable produit et ses éléments avant modération.

## Vérifications

- Build de production local réussi ; types vérifiés par le build.
- 21 tests ciblés réussis, dont les états MonCash et la parité des quatre langues.
- 16 scénarios Chrome réussis : recherche à 320, 390, 768 et 1440 px, défilement, navigation, thèmes et langues.
- À 390 px, recherche mesurée à 366 px ; à 1440 px, 479 px. Aucun débordement ni erreur JavaScript lors des captures finales.
- Contrastes validés ; lint sans erreur, huit avertissements préexistants.
- Suite locale : 1 063 tests réussis sur 1 080. Les 17 échecs Windows ont été reproduits sur la base 0a30b93 dans une copie isolée. Cette base présente un dix-huitième échec, celui de l’exclusion du dictionnaire i18n, corrigé ici par normalisation des séparateurs. La CI Linux doit être verte avant fusion.

Les scénarios navigateur utilisent des données et services simulés en local. Ils ne constituent pas un achat réel. Aucun secret de production, mode marchand, donnée commerciale ou abonnement n’a été modifié.

## Références d’interface

- Etsy : recherche principale, accès aux familles de produits et aux boutiques — https://www.etsy.com/
- Gumroad Discover : accès distinct au catalogue digital — https://gumroad.com/discover

Principes adaptés à Zabelie ; identité, typographie et dépendances conservées.

## Étapes opérationnelles restantes

Fournir et valider les premières offres réelles ; choisir le serveur privé de l’antivirus décrit dans docs/57-fondations-securite.md ; obtenir un paiement MonCash sandbox concluant puis l’autorisation et les identifiants de production. Les comptes et opérations réelles restent à éprouver avec leurs titulaires. Aucun de ces prérequis n’est déclaré terminé par cette livraison.
