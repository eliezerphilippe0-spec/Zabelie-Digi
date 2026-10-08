# Services pour le marché haïtien

## Services adaptés à Haïti — lot du 8 octobre 2026

Objectif : un vendeur peut préparer une offre de visuels commerciaux, de
diagnostic téléphone/ordinateur ou de diagnostic solaire/onduleur dans le
formulaire existant. Les catégories proviennent de la taxonomie active.
Les trois univers restent accessibles. Branche : `codex/services-haiti`.

Ce lot réutilise publication, messagerie, paiement et suivi existants. Il
ajoute des modèles traduits et un guide avant achat, sans offre fictive ni
nouvelle migration. Prix et délai restent à saisir par le vendeur.
Le diagnostic et les travaux sont deux périmètres distincts ; le devis est
convenu via la messagerie, sans nouveau moteur d'acceptation de devis.
Pour un proche, le guide demande l'accord et la coordination avec le vendeur ;
il n'étend pas le formulaire destinataire du checkout physique aux services.

Vérifications locales : 1 575 tests, TypeScript, lint, contraste et build
passent. Deux tests HTTP des pages rendues passent contre le stub Supabase.
Le lancement local standard rencontre `uv_interface_addresses` ; ces deux
tests ont été rejoués avec un hôte explicite 127.0.0.1 dans une configuration
locale temporaire. Les interactions navigateur restent à vérifier par la CI.
Les feuilles `grafik-ak-design` et `reparasyon`, leurs parents et leur
département sont actifs en production (lecture seule du 8 octobre).


