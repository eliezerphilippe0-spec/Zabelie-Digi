# Corrections de l’audit du 8 septembre 2026

## Corrections livrables

- PR 232 fusionnée (`bd8c49d90402e6afa74b89b130a710a378c61ed3`) : MFA administrateur, refus des sessions AAL1 et des facteurs retirés, dépendances corrigées. CI 34257784901 réussie sur sa tête exacte.
- Atelier numérique de la PR 239 intégré ; migration 0104 appliquée et contrôlée (preuves dans docs/54).
- Migration 0105 : protège `profiles.is_test` au niveau SQL, à l’insertion comme à la modification. Un membre ne peut plus retirer sa marque pour exposer ses fiches d’essai. Les modifications légitimes du profil et l’administration serveur restent possibles. Fonction INVOKER, exécution publique révoquée, trigger surveillé par la sonde de cohérence. Tests transactionnels des droits SQL et de la visibilité du catalogue.
- Contrôle après déploiement : exige l’empreinte du commit attendu ET `/api/readyz` sain, avec délais et tentatives bornés. Un ancien déploiement répondant 200 n’est plus accepté. `/api/deployment` ne rend qu’une empreinte opaque et ne cache pas ses réponses.
- Auth navigateur : job CI séparé qui construit le bundle avec les variables publiques du serveur Auth de test. Vérifie requête réelle du navigateur, échec récupérable, session persistée, inscription avec confirmation et erreurs traduites. Ce stub ne certifie pas la configuration du service Auth réel ni l’envoi d’e-mails.
- SEO : URLs FR/HT/EN/ES, canonical, hreflang réciproques et sitemap pour aide, à-propos et recharges. La langue de l’URL prévaut sur le cookie. Les autres pages conservent leur fonctionnement actuel. Le catalogue vide reste volontairement non indexé.
- Description de marque corrigée : suppression de la promesse de recharge téléphonique alors que le service est suspendu. Connexion et administration exclues de l’indexation. Champ recherche nommé pour les lecteurs d’écran ; titre et annonce des messages de connexion.
- Contact de confidentialité renseigné avec l’adresse publique existante `contact@zabelie.com`.
- Tests SQL sur PostgreSQL 17, version majeure utilisée en production.

## Exploitation du contrôle de livraison

Vercel doit fournir `VERCEL_GIT_COMMIT_SHA` au build (variable système des déploiements Git). La CI fournit `GITHUB_SHA`. `next.config.mjs` dérive `ZABELIE_RELEASE_ID` à la compilation ; ne pas saisir cette dernière manuellement. Sans SHA valide, la sonde répond 503 et le contrôle échoue explicitement.

Le workflow `post-deploy.yml` transmet `github.sha` via `ZABELIE_EXPECTED_COMMIT`. Il vérifie jusqu’à 60 fois à dix secondes d’intervalle, avec huit secondes au maximum par requête et lecture du corps. La limite du job est trente minutes. Aucune temporisation seule ne constitue une preuve.

Pour vérifier une livraison manuellement, définir `ZABELIE_URL=https://zabelie.com` et `ZABELIE_EXPECTED_COMMIT` au SHA complet attendu, puis lancer `node scripts/verifier-deploiement.mjs`. Une promotion ou restauration doit être contrôlée avec le commit effectivement choisi. Cette sonde valide la disponibilité et l’identité de la livraison, pas le paiement réel de bout en bout.

## Informations et opérations encore nécessaires

1. Raison sociale, adresse et juridiction : réponses attendues du porteur. Durées de conservation, procédure de litige et garanties de transfert à établir avant de remplacer les marqueurs des documents. Aucune identité ni durée légale inventée.
2. Protection des mots de passe divulgués : organisation Supabase actuellement gratuite ; cette option requiert Pro. Aucune souscription payante effectuée.
3. Sauvegardes : aucune preuve de restauration d’une sauvegarde de production n’est disponible. Définir un stockage chiffré indépendant, rétention et objectifs RPO/RTO ; restaurer en environnement isolé la base ET les objets Storage, contrôler les accès et consigner le résultat. La réussite des migrations sur une base de test n’est pas cette preuve. Ne jamais restaurer un essai sur la production.
4. Antivirus : service et hébergement à préciser ; ne pas envoyer les fichiers vendeurs à un fournisseur non choisi. La vérification des tailles/extensions n’est pas une analyse antivirus.
5. Catalogue : zéro offre publiée lors de l’audit. Le porteur doit fournir les vraies offres et leurs ressources, vérifier les vendeurs puis modérer leurs fiches. Aucun produit, avis ou chiffre de ventes fictif ajouté.
6. Paiements/notifications réels : configuration et succès de bout en bout à vérifier dans un cadre de test autorisé ; cet audit n’a déclenché aucun paiement ni envoi client.

Le projet Vercel n’était pas visible dans l’équipe exposée par le connecteur pendant l’audit. L’intégration Git et les sondes publiques permettent de vérifier le déploiement, mais ne donnent pas accès aux sauvegardes ni à toute la configuration d’hébergement.
