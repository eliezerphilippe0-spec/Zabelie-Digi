# MonCash : terminer les essais et préparer la production

État relevé le 9 septembre 2026. Le porteur confirme dans la conversation : « Non, nous sommes encore en bac à sable ». L'activation marchande en production n'est pas acquise. Ne pas changer de mode sur la seule base d'un test de code réussi.

## Ce qui est établi

- 14 paiements MonCash ont échoué, sans référence opérateur, entre le 11 août et le 3 septembre. Quatre traces identifient explicitement le bac à sable ; dix ne portent pas encore les champs d'environnement. Tous ont expiré avec `moncash_unknown_48h`.
- Le seul paiement confirmé est gratuit. Aucun encaissement MonCash n'est démontré, en test ni en réel.
- Aucun produit n'est publié. Les comptes d'essai restent exclus du catalogue public.
- L'accès Vercel du connecteur renvoie 404 sur ce projet ; aucun secret ni paramètre de production n'a été lu ou modifié. Le contrôle Chrome de la session est indisponible. L'état d'authentification réel de MonCash n'a donc pas été sondé depuis le déploiement.

## Ordre des opérations

1. **Authentifier l'administration.** Se connecter à Zabelie puis activer le facteur demandé sur [Sécurité](https://zabelie.com/securite). La garde MFA est déjà déployée ; aucun facteur administrateur vérifié n'a été trouvé lors du relevé.
2. **Vérifier l'authentification sandbox sans paiement.** Ouvrir [Diagnostic MonCash](https://zabelie.com/api/admin/moncash-verify) avec la session administrateur MFA. `bac_a_sable` avec `jetonObtenu:true` confirme seulement que les identifiants de test sont acceptés. La sonde ne crée aucune commande.
3. **Obtenir un payeur de test fonctionnel.** Les identifiants API du marchand ne sont pas un portefeuille acheteur. Demander à MonCash la procédure pour disposer d'un portefeuille sandbox utilisable et approvisionné fictivement. Ne pas inventer de numéro de test ni utiliser un portefeuille réel sur le bac à sable.
4. **Parcourir le sandbox.** Sélectionner un produit et des comptes d'essai expressément prévus, un montant accepté par le fournisseur et les acteurs de l'essai. Publier l'offre uniquement dans un environnement de test ou sous un vendeur marqué comme compte d'essai. Exécuter le parcours de [docs/05](05-TEST-SANDBOX.md) et relever la référence opérateur, la confirmation serveur, l'accès acheteur, la commission et l'absence de doublon. Aucun résultat de ce parcours n'est déclaré acquis ici.
5. **Faire valider le passage en production par MonCash Business.** Décrire explicitement l'activité multivendeur et demander les documents et conditions applicables à l'encaissement, aux remboursements et aux versements vendeurs. Le message prêt à envoyer est dans [demande-moncash-business.md](demande-moncash-business.md).
6. **Après accord du fournisseur et validation du porteur**, configurer les identifiants délivrés pour la production, `MONCASH_MODE=production` et les URL confirmées ci-dessous, puis redéployer. Les secrets se saisissent dans les consoles prévues, jamais dans le dépôt, les journaux ni une conversation. Les paramètres de test des previews doivent rester séparés.
7. **Contrôler puis réaliser un premier achat réel autorisé.** La sonde doit rendre `ok` avec `mode:production` et `modeSource:explicite`. Ce résultat valide seulement l'authentification. Définir ensuite le vrai produit, les deux parties, le montant et le scénario de remboursement avant tout débit. Vérifier le paiement, la réception digitale ou la remise physique par le vendeur, les notifications, la comptabilité, la maturation au délai prévu et le versement. Voir [docs/22](22-PREMIERE-COMMANDE-REELLE.md). Ne pas forcer le délai de maturation pour déclarer la recette terminée.

## URL du projet à faire confirmer au portail fournisseur

| Champ du portail actuel | URL Zabelie |
|---|---|
| Website Url | https://zabelie.com |
| Return Url | https://zabelie.com/api/moncash/return |
| Alert Url (page de retour acheteur) | https://zabelie.com/mes-achats |

Ces valeurs proviennent du runbook existant dans `OPS_TODO.md`. La route de retour du projet reçoit `transactionId` puis interroge MonCash côté serveur ; une redirection navigateur seule ne confirme jamais un paiement. Confirmer avec MonCash le nom et le rôle actuels de chaque champ avant saisie. Aucune de ces URL n'a été modifiée dans le portail pendant cette intervention.

## Lire le diagnostic corrigé

| Verdict | Signification et action |
|---|---|
| `absente` | Identifiants manquants : vérifier leur présence dans le bon environnement. |
| `mode_ambigu` | Configuration du mode illisible : la corriger dans la console, sans transmettre sa valeur dans un message. |
| `identifiants_refuses` | HTTP 401/403 : vérifier l'autorisation du compte et les identifiants du bon portail. |
| `fournisseur_indisponible` | HTTP 408/429/5xx : incident ou limitation chez le fournisseur. Les clés restent non vérifiées. |
| `reponse_invalide` | HTTP inattendu, JSON illisible ou jeton inexploitable. Ne prouve pas que les clés sont fausses. |
| `injoignable` | Échec réseau ou réponse non terminée dans les huit secondes. Réessayer ; pas de verdict sur les clés. |
| `bac_a_sable` | Authentification de test réussie, aucune capacité d'encaissement réel démontrée. |
| `ok` | Authentification de production réussie, parcours commercial complet encore à valider. |

## Sources officielles vérifiées le 9 septembre 2026

- [MonCash Business, guide API](https://moncashdfs.com/business) : terminer les tests sandbox puis contacter l'équipe Business pour le passage en production ; contact `MFS_B.Services@digicelgroup.com` ou service client 202.
- [Documentation REST API MonCash](https://sandbox.moncashbutton.digicelgroup.com/Moncash-business/resources/doc/RestAPI_MonCash_doc.pdf) : hôtes distincts sandbox/production, OAuth, création et vérification serveur des paiements. Cette documentation seule ne constitue pas une autorisation marchande ni un accord pour les versements multivendeurs.

## Corrections et validation technique

La sonde distingue désormais les erreurs HTTP, les réponses invalides et les délais dépassés. Elle valide la forme du jeton et ne journalise plus les erreurs brutes susceptibles de contenir des secrets. Son message de succès ne promet plus qu'un encaissement est validé.

Les trois régressions ont été reproduites avant correction. Les tests simulent les réponses du fournisseur ; ils ne certifient pas les paramètres du compte MonCash réel. Aucune migration, aucun débit, aucun versement, aucun envoi d'email ni modification de secret n'a été effectué.
