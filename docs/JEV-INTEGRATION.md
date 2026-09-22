# Jev : intégration serveur en observation

Autorisation : demande directe du porteur du 20 septembre 2026.

Endpoint : `POST /api/admin/jev`, JSON `{ "message": "Mwen bezwen enfòmasyon sou pwodwi a" }`.
Session administrateur avec MFA active et en-tête Origin de même origine obligatoires.
Aucune route publique vers TypeSafe, aucune clé dans le navigateur. Aucun appel automatique
sur les conversations existantes. L'administrateur doit soumettre des exemples anonymisés.

Le résultat est une suggestion de catégorie et d'urgence, toujours `reviewRequired: true`.
Aucun paiement, remboursement, routage automatique ou envoi de message n'est déclenché.
Le transport REST suit https://docs.typesafe.ai/introduction/quickstart : endpoint fixe,
modèle `jev-latest`, catégories fixes, validation de réponse, délai 8 s, aucun redirect.

## Activation

1. Révoquer la clé partagée dans la conversation et créer sa remplaçante dans TypeSafe.
2. Dans le projet Vercel de Zabelie, ajouter `TYPESAFE_API_KEY` comme variable sensible
   côté serveur dans l'environnement concerné. Ne jamais utiliser un préfixe public.
3. Déployer la branche puis tester depuis une session admin MFA avec un message fictif.
4. Vérifier qu'un visiteur ou un vendeur reçoit 403 et qu'aucun secret n'apparaît
   dans les réponses, les fichiers JavaScript ou les journaux.

La connexion réelle au fournisseur et l'activation Vercel restent à vérifier tant que
la nouvelle clé n'est pas configurée. Les tests automatisés utilisent un transport simulé.
Retirer la variable et redéployer désactive le service (503).

## Protection et limites

Corps limité à 24 Ko pendant la lecture, texte limité à 4 000 caractères, entrées strictes.
Erreurs fournisseur remplacées par un code générique, jamais journalisées avec leur contenu.
Quota technique initial : 5 requêtes/minute/admin, 100/jour pour l'ensemble des admins.
Compteur atomique existant `zabelie_rate_limit`, avec trace admin obligatoire avant appel (sans texte client ni clé) ; aucune
lecture de données métier avec celui-ci. Une panne du compteur ferme l'accès.
Ces plafonds sont des protections d'exploitation, pas une offre commerciale.
La qualité en créole n'est pas attestée par des tests de transport.
