# Favoris, boutiques suivies et achat pour un proche

7 septembre 2026. Extension de la marketplace existante, sans nouveau prestataire.

## Parcours

- Un acheteur connecté peut enregistrer un produit depuis sa fiche et le retrouver sur `/favoris`, sur les appareils connectés à son compte. Un visiteur est orienté vers la connexion avec retour à la fiche.
- Les deux adresses publiques des boutiques proposent un suivi. `/boutiques-suivies` retrouve les boutiques et donne accès à leur catalogue. Il ne s’agit pas d’un abonnement payant ni d’un envoi d’alertes : aucun message n’est envoyé.
- Les listes sont privées, paginées et accessibles dans le menu du compte. Les écritures expriment l’état désiré et sont idempotentes. L’interface ne confirme jamais une sauvegarde refusée. Les offres devenues indisponibles restent supprimables.
- Sur une fiche physique, « Acheter pour un proche en Haïti » demande nom, mobile haïtien, commune/quartier, précisions facultatives et accord du destinataire. Un récapitulatif précède le paiement. L’acheteur garde la gestion et la confirmation de réception.
- Le serveur valide type, forme et longueur avant de créer la commande. Les coordonnées sont enregistrées avant tout paiement ; un échec annule la nouvelle commande sans appeler le prestataire. Le profil habituel de l’acheteur n’est pas écrasé.
- L’acheteur relit le destinataire dans ses achats. Le vendeur le voit pour la commande payée et les états de suivi ultérieurs, jamais pour un simple paiement en attente. En cas d’erreur de lecture, l’écran vendeur ne remplace pas silencieusement le destinataire par l’adresse de l’acheteur.
- Les données nouvelles sont exportées avec pagination et effacées à la suppression/anonymisation du compte. La confidentialité décrit ce fonctionnement dans les quatre langues.

## Fiabilité de l'export de compte (20 octobre 2026)

`/api/account/export` réutilise le lecteur de collections pour paginer aussi les produits, commandes, reçus d'acceptation et données du Studio. Chaque page conserve le filtre du titulaire, les colonnes sélectionnées et un ordre unique. La progression suit le nombre de lignes effectivement reçu, même si le plafond de l'API est inférieur aux 500 lignes demandées, jusqu'au décompte exact.

Une erreur, une liste illisible, un décompte absent ou changeant, une page répétée ou une fin prématurée rendent 503 sans pièce jointe ; aucune donnée déjà lue n'est présentée comme un fichier complet. L'absence légitime du profil ou du portefeuille reste `null`. Les tables Studio absentes dès la première lecture restent facultatives. L'accès à l'export reste ouvert aux comptes suspendus et ne dépend pas d'une nouvelle acceptation des règlements.

Ces lectures ne constituent pas un instantané transactionnel : les changements de cardinalité sont détectés, mais des modifications concurrentes conservant le même nombre de lignes peuvent intervenir entre deux pages. Les tests de route utilisent des données synthétiques, couvrent les dix familles paginées au-delà de 1 000 lignes et vérifient les filtres à chaque page.

## Base et déploiement

Migration `0102_collections_destinataire.sql`, créée via le CLI puis numérotée selon la convention séquentielle du dépôt. Trois tables avec RLS dès création, droits explicites et index des relations. Aucune écriture client sur les destinataires ; aucun droit anonyme sur les trois tables. Les favoris ne peuvent référencer que des produits publiés lisibles. Les suivis passent par la projection publique existante des boutiques. Le déclencheur du destinataire n’accepte qu’une commande physique en attente.

Appliquer seulement cette migration après validation SQL et avant de déployer le code. Ne pas appliquer en masse les migrations, notamment `0056` volontairement gelée. Vérifier les empreintes dépôt/journal Supabase et inscrire les migrations manquantes au registre à partir des preuves, jamais par supposition.

## Vérifications

Tests SQL transactionnels : isolation entre deux acheteurs, absence de lecture anonyme, refus du vendeur avant paiement et lecture après paiement, rejet d’un destinataire numérique, d’une modification directe, d’un favori sur brouillon, d’un identifiant propriétaire forgé et du suivi de soi-même ; idempotence et suppression par le propriétaire.

Tests Chrome : sauvegarde/rechargement/retrait d’un favori, sauvegarde refusée sans faux succès, suivi puis retrait d’une boutique, consentement et conservation des champs destinataire après erreur, refus serveur puis nettoyage si la sauvegarde du destinataire échoue. Ces scénarios utilisent uniquement les fixtures du harnais : aucun paiement réel ni coordonnées de tiers ne sont utilisés.

Les tests réels des prestataires de paiement restent distincts : aucun débit réel n’est exécuté par ce chantier. Zabelie ne stocke ni ne livre les produits. Les modalités de remise sont convenues avec le vendeur.
