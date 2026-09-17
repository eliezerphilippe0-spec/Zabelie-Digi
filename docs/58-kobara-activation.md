# Activation Kobara et recharges — 17 septembre 2026

## Etat verifie

La demande directe de Philippe autorise l'activation de Kobara et la remise en service des recharges. Aucune variable de production ni donnee financiere n'a ete modifiee durant ce diagnostic.

Le depot principal contient Kobara depuis `d84c418` (PR 248). Les pages publiques affichaient encore MonCash en test et NatCash prochainement. Le controle Chrome echoue au demarrage (erreur Windows 1344). Le connecteur Vercel renvoie une liste de projets vide et le CLI refuse son jeton expire. Les secrets de production n'ont donc pas pu etre verifies.

## Corrections preparees

- Endpoint de creation `/v1/payments`, reponse enveloppee dans `data`, redirections `success_url` et `cancel_url`.
- Refus avant appel reseau d'une cle incompatible avec le mode, notamment d'une cle sandbox sur l'API publique live.
- Webhook `event_type`, concordance des environnements et rapprochement par l'identifiant de paiement conserve en base. La reference KOB du prestataire n'est pas un identifiant de commande Zabelie.
- Refus de montants non entiers ou de devises inattendues, conservation de la verification HMAC et de la confirmation idempotente en base.
- Affichage NatCash selon la configuration; MonCash via Kobara pris en compte si son option est active.
- Un GET 404 ne doit plus faire expirer un paiement : l'API de consultation GET n'est PAS documentee dans les pages publiques actuelles. La reconciliation remonte cette erreur et doit etre verifiee avec le prestataire avant une activation complete.

Sources consultees le 17 septembre :
- https://docs.kobara.app/docs/payments
- https://docs.kobara.app/docs/webhooks
- https://docs.kobara.app/docs/authentication

## Activation a terminer avec les acces

1. Retablir l'acces au projet Vercel qui dessert zabelie.com.
2. Verifier l'application de `0106_rail_kobara.sql` dans le registre et l'enumeration de production (ne pas rejouer une migration deja appliquee).
3. Configurer l'endpoint Kobara `https://zabelie.com/api/kobara/webhook`, evenement `payment.succeeded`, dans l'environnement du compte marchand utilise.
4. Poser ensemble `KOBARA_SECRET_KEY`, `KOBARA_WEBHOOK_SECRET`, `KOBARA_MODE` et `KOBARA_MONCASH=true`. La documentation publique exige une cle live et un compte approuve pour `https://api.kobara.app`. Ne pas envoyer ces cles dans la conversation ou les logs.
5. Deployer la version corrigee. Verifier MonCash et NatCash, puis le webhook signe, le statut paye, le rejeu sans double credit et la recuperation d'une notification manquee. Aucun paiement reel n'a ete effectue dans ce diagnostic.

## Recharges : un service distinct

Le badge indisponible vient de `ZABELIE_TOPUP_FIRSTPARTY_ENABLED`, ferme par defaut. Le fournisseur de credit Digicel/Natcom est Reloadly, pas Kobara.

Pour reouvrir un service utilisable : verifier le compte Reloadly, ses identifiants serveur et son mode, le solde fournisseur, synchroniser les produits et leurs identifiants operateur, puis verifier le paiement et la livraison. Passer ensuite `ZABELIE_TOPUP_FIRSTPARTY_ENABLED=true` et redeployer. Le flux de recharge existant utilise MonCash direct ou Zelle; l'ajout de Kobara au checkout marketplace ne le branche pas automatiquement au checkout de recharge.

La recharge de portefeuilles MonCash/NatCash n'est pas implementee par ce module de credit telephone.

## Validation locale

31 tests cibles reussis; TypeScript, lint des fichiers modifies et build de production reussis.
Suite complete : 1090 reussites sur 1107, 17 echecs. Ces 17 echecs ont tous ete reproduits dans un worktree non modifie de `d84c418`; aucun nom d'echec nouveau. Ils comprennent notamment des tests de chemins Windows et de fins de ligne. Cela n'est pas une validation de paiement chez Kobara.
