# Tarification vendeurs et lancement de 30 jours

Demande du porteur : « Appliquer la tarification de Gumroad, implémente la stratégie de 30 jours » (21 septembre 2026).
Sources commerciales consultées : https://gumroad.com/pricing et https://gumroad.com/help/article/66-gumroads-fees.
Il s'agit des frais Zabelie, pas d'une intégration avec Gumroad ni de son statut fiscal de merchant of record.

## Contrat préparé

- Boutique et inscription sans abonnement ; les commandes gratuites restent sans commission.
- Vente directe : 10 % + l'équivalent de 0,50 USD en HTG.
- Vente attribuée au catalogue / recommandations Zabelie : 30 %, sans montant fixe.
- Une vraie navigation depuis une carte du catalogue ou de l'accueil pose une attribution signée, HttpOnly, par produit et navigateur. Préchargements exclus. Le délai de 7 jours n'est pas prolongé par un rafraîchissement. Les boutiques et liens partagés restent directs en l'absence de cette attribution.
- Si la preuve est absente, effacée, expirée ou invalide, le tarif direct s'applique. Ce suivi navigateur n'est pas une preuve d'acquisition entre appareils.
- Le taux de change et tous les paramètres commerciaux vivent en base. La migration n'invente pas un taux de change.
- Frais figés à la création de la commande, frais effectifs enregistrés au paiement. Montants entiers, arrondi au vendeur, frais plafonnés au brut pour éviter un net négatif.
- Anciennes commandes, factures Business, recharges first-party et soldes passés inchangés.

## Avantage de lancement préparé

Le montant de l'avantage et les deux variantes tarifaires ont été soumis au porteur pour clarification dans cette tâche ; aucune réponse reçue au moment de la rédaction. Valeurs préparées pour revue : réduction de 50 % de l'ensemble des frais Zabelie, 3 ventes maximum sur 30 jours. Ne pas présenter ces valeurs proposées comme une décision déjà confirmée.

La première fiche doit être créée dans les 7 jours de l'inscription Auth. La date modifiable du profil n'est jamais la preuve d'éligibilité. Le délai de modération n'est pas décompté. Le premier passage à « publié » démarre les 30 jours uniquement lorsque les paiements réels sont déclarés prêts. Une publication en attente des paiements commence lors de leur activation.

L'avantage est consommé au paiement confirmé avec un verrou vendeur : rejeux, paiements en échec, gratuits, achats de ses propres produits et sandbox ne consomment pas le quota. Un remboursement ne restaure pas le quota. Republier ne redémarre pas les 30 jours. À expiration ou épuisement, la boutique reste ouverte et le tarif habituel reprend.

## Déploiement et retour arrière

La migration 0108 est additive et désactivée par défaut : enabled=false, payments_ready=false, usd_htg_micros=NULL.
La revue commerciale, les tests SQL et la validation de l'interface doivent précéder son activation.
Ordre : appliquer la migration testée, déployer l'application, renseigner le taux USD/HTG vérifié et les paramètres approuvés, puis activer.
Le taux USD/HTG s'exprime en millionièmes : 132 HTG/USD correspond à 132000000 ; ceci est un exemple de test, pas un cours imposé.
payments_ready=true exige un paiement réel vérifié et ne découle jamais de la seule présence des clés.
Ne pas utiliser un ancien déploiement applicatif après activation : il ne porte pas l'origine des ventes.
Retour arrière : enabled=false arrête les nouveaux contrats ; les commandes déjà figées se règlent à leurs conditions enregistrées. Aucun effacement de ledger.

## Validation et mesure

Les tests SQL exécutent le vrai confirm_payment, puis vérifient les écritures platform_earnings / escrow, les remboursements, les droits et l'immuabilité.
Les tests TypeScript vérifient les estimations entières, les bornes exactes, les signatures, l'expiration et les erreurs de configuration.
Le parcours navigateur couvre les tarifs avant inscription, le lancement connecté, la saisie du prix et l'attribution du catalogue.

Pour mesurer la stratégie, compter par cohorte d'inscription Auth :
1. première fiche soumise sous 7 jours ;
2. première commande payée réellement sous 30 jours après publication ;
3. nouvelle vente réelle entre J30 et J60.
Ces comptages doivent exclure is_live=false, gratuit, remboursement et achat par le vendeur. Une nouvelle vente mesure la rétention commerciale, pas simplement une connexion.

