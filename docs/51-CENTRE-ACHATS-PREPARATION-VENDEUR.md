# Centre d’achats et préparation vendeur

7 septembre 2026 — prolongement de la PR 234.

## Comportement livré

- `/mes-achats` conserve les commandes en attente, annulées, remboursées et en litige, en plus des commandes payées/reçues. La lecture utilise la session et un filtre explicite sur l’acheteur.
- Quatre vues : historique complet, bibliothèque numérique, produits physiques et prestations. Le filtre est appliqué dans PostgREST avant la pagination (20 commandes, plus une sentinelle ; tri date puis identifiant).
- Les liens de pagination conservent la vue. Les paramètres absents, répétés ou invalides reviennent aux valeurs sûres.
- Les téléchargements, avis et actions de réception ne sont proposés que sur les états `paid` et `delivered`. Les routes serveur conservent leurs contrôles indépendants. Les refus 403 sur commandes en attente/remboursées/en litige/annulées sont éprouvés par appel direct.
- Une erreur de lecture affiche un incident et un lien de reprise, jamais un historique vide. Le repli sans `order_ref` est conservé pour une base en retard.
- Chaque carte garde la référence de commande et un accès à l’aide. Un paiement en attente explique quoi faire en cas de débit, sans inviter à payer une seconde fois.
- `/vendre` relie produits, commandes, revenus et messages. Pour un vendeur déjà équipé, la création de fiche est repliée ; les brouillons ne proposent pas de campagnes promotionnelles.
- Repères par fiche fondés sur les données enregistrées : description, photo, livrable pour un fichier, délai et contenu pour une prestation. Un délai de zéro jour est valide. Les mises à jour de galerie réactualisent les repères.
- Les repères de présence ne constituent pas une validation de qualité, de droits, d’identité ou de publication. Le guide numérique demande format, langue, contenu, logiciels requis, droits d’usage et aperçu fidèle dans la description et la galerie existantes.
- Les sous-catégories du catalogue respectent désormais le type de produit de l’univers sélectionné.
- Nouveaux textes et interactions de téléchargement/avis disponibles en français, créole, anglais et espagnol.

## Validation

Compilation et TypeScript réussis. 42 parcours E2E réussis avec le Chrome installé, dont cinq nouveaux scénarios dédiés au centre d’achats et à la préparation vendeur. Captures mobiles réalisées avec des fixtures explicitement réservées aux tests, sans débordement horizontal. Trois tests métier supplémentaires couvrent les gardes et les repères de préparation.

La suite Node locale Windows exécute 1 023 tests : 1 003 réussites et les 20 échecs déjà présents (chemins/CRLF des scanners et version locale de sharp). La CI Linux sur le commit poussé est la vérification de référence ; son résultat figure sur la PR. Aucun test n’est assoupli pour masquer ces différences.

## Limites et suites distinctes

Aucune migration, activation de catégorie, configuration de prestataire ou transaction réelle n’est effectuée dans ce lot. Zabelie ne stocke ni ne livre les produits. La galerie vidéo, la messagerie, le suivi de remise et le registre financier existants sont réutilisés.

Le guide numérique renseigne la description existante : il ne crée pas encore des métadonnées structurées de licence/compatibilité. Les achats dont le produit n’est plus lisible restent dans l’historique complet comme article indisponible ; les vues par type dépendent de la jointure produit. Une conservation pérenne de la fiche achetée demande des instantanés de commande et une politique d’accès dédiée.

Restent à traiter comme chantiers complets : essais réels MonCash/Stripe et remboursements, recrutement et publication de vraies offres, métadonnées numériques et instantanés d’achat, favoris/suivi de boutiques, parcours diaspora avec destinataire, mesure des conversions et engagements opérationnels de support. La PR 232 de sécurité est indépendante et encore à fusionner. Ne pas présenter ces chantiers comme livrés par cette PR.
