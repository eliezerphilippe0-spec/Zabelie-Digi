# Marketplace : confiance et hors ligne

## Changements

- Fiches et panier : communes/quartiers desservis, point de retrait public, frais inclus dans le prix ou à confirmer, délai et prochaine disponibilité. Déclarations du vendeur, pas une promesse de livraison vérifiée par la plateforme. Aucun supplément ni changement du calcul financier.
- Espace vendeur : édition des engagements et confirmation explicite de disponibilité, rappel après sept jours. Une modification de texte ne rafraîchit pas la date de disponibilité. Les dates de créneau suivent Haïti.
- Mes achats : motifs d’aide, référence préremplie dans la messagerie, demande copiable pour le support. Ne remplace pas la contestation officielle de non-réception.
- Panier : passage par la fiche pour vérifier la variante, la remise et choisir le moyen de paiement.
- Destinataire : brouillon limité à trente minutes dans sessionStorage, par utilisateur et produit, sans restaurer le consentement. Après erreur réseau ambiguë au checkout, vérification des achats avant un nouvel essai. Aucun POST de paiement mis en file hors ligne.
- Suivi de paiement : pause hors réseau ou onglet masqué, reprise immédiate, une requête à la fois et annulation à la sortie de page.
- Recharges : état fondé sur le drapeau, les identifiants fournisseur, le mode et un catalogue relié au fournisseur. Le libellé indique une configuration, pas une preuve de disponibilité fournisseur ou de solde.
- Administration : demandes sans résultat des sept derniers jours, collecte inactive explicitée, messages à copier. Aucun contact automatique ni tâche récurrente ajoutée.

## Hors ligne réellement éprouvé

Le service worker déclarait un fallback sans précacher sa page. Une navigation après coupure échouait malgré la présence du service worker. Le build précache désormais /hors-ligne avec une révision propre au build, et les navigations publiques passent par une stratégie réseau avec fallback.

La bibliothèque conserve vingt résumés publics de fiches consultées, sept jours au maximum : titre, slug, prix observé et date. Pas de HTML connecté, commande, coordonnées, fichiers privés, jetons ni URL de paiement. L’utilisateur peut effacer ces copies. Un lien vers une offre provoque une navigation réseau complète pour relire son état. Ce n’est pas le catalogue complet hors ligne.

Les chemins privés restent sans cache. La page de secours évite aussi le rafraîchissement de session Supabase. La nouvelle version du service worker attend la fermeture des anciens onglets.

## Schéma et livraison

Migration additive 0107_product_commitments.sql : table publique en lecture seulement pour offres publiées / leur vendeur, RLS activée, écritures et RPC réservées au serveur. La route exige l’authentification, le vendeur propriétaire, la validation et une limitation de fréquence ; la RPC revérifie le propriétaire et conserve atomiquement la date de confirmation. Le diagnostic zabelie_objets_requis surveille la nouvelle table et la RPC.

Sans cette migration, les achats existants fonctionnent ; les nouvelles informations sont présentées comme manquantes et l’éditeur vendeur n’est pas proposé. Aucun schéma de production modifié lors de l’implémentation.

## Vérifications

- TypeScript, lint ciblé et build de production réussis.
- Sept scénarios Chrome : navigation réellement hors ligne, absence de cache privé, retour en ligne, effacement, refus d’un second paiement après erreur réseau, recharges non configurées, sauvegarde vendeur/rechargement, refus anonyme/non-propriétaire, brouillon destinataire sans consentement et aide référencée.
- Captures mobile 390 px et bureau 1440 px : aucun débordement horizontal.
- Tests unitaires du cache public, des données vendeur, des quatre traductions et de la disponibilité.
- Suite locale : 1095 réussites sur 1112 ; les dix-sept échecs correspondent aux échecs Windows déjà présents sur la base. Tests SQL de migration/RLS ajoutés pour PostgreSQL dans la CI.
- Pas de paiement réel, livraison réelle, envoi de message ou modification de compte fournisseur.
