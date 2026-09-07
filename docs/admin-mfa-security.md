# Sécurité administrateur — 7 septembre 2026

## Changement

Les pages `/admin/**` et les API `/api/admin/**` exigent désormais un rôle
`admin` relu en base, un JWT validé par Supabase Auth, le niveau `aal2` et
au moins un facteur encore vérifié auprès d'Auth. Toute erreur ferme cet accès.
Un cookie contenant un rôle ou un facteur inventé ne suffit pas.
Les secrets des tâches planifiées continuent à authentifier ces appels machine.

La page `/securite`, réservée aux administrateurs connectés, permet de configurer
une application TOTP puis de vérifier le code. Lors des connexions suivantes,
un code est demandé si la session est au niveau `aal1`. Les Server Actions
contrôlent à nouveau le rôle et les facteurs ; elles ne sont pas ouvertes par
la seule présence d'un formulaire. Next.js vérifie l'origine des actions POST.
Supabase vérifie les codes et applique ses limites Auth. Aucun code ni secret
n'est écrit dans les journaux, les URL ou le stockage local de l'application.
La clé de configuration est affichée uniquement pendant l'activation et la page
est exclue du cache PWA. Les traductions FR/HT/EN/ES sont fournies côté serveur.

L'enrôlement abandonné peut être recommencé : seuls les facteurs TOTP non
vérifiés nommés `Zabelie administration` sont retirés. Aucun facteur actif
n'est supprimé par le site. Un nouveau facteur ne peut pas contourner un facteur
actif. Le parcours proposé est TOTP ; les facteurs téléphone/WebAuthn ne sont
pas configurables depuis cette page.

## Activation par le propriétaire

Après fusion et déploiement de cette correction :

1. Se connecter avec le compte administrateur habituel, puis ouvrir `/admin`.
2. L'écran `/securite` propose la configuration tant qu'aucun facteur n'est actif.
3. Scanner le QR avec son application d'authentification, ou saisir la clé dans
   cette application. Conserver une sauvegarde privée de l'authentificateur.
4. Saisir le code courant à six chiffres. L'accès admin s'ouvre après validation
   par Supabase et mise à jour de la session.
5. Vérifier qu'une nouvelle connexion demande bien un code. Ne transmettre
   aucune capture du QR, clé ou code à un assistant, au support ou dans GitHub.

Aucun facteur réel n'a été créé par l'agent. L'activation reste une action du
propriétaire après déploiement. Il n'existe aucun paramètre qui désactive le
contrôle MFA pour contourner cet écran.

En cas de perte de l'application, la récupération passe par le propriétaire
habilité du projet Supabase après vérification indépendante de l'identité.
Révoquer les sessions concernées, tenir compte des JWT encore valables jusqu'à
leur expiration, puis réinitialiser le facteur avec les outils Auth autorisés.
Reconfigurer immédiatement le TOTP et vérifier l'accès. Ne pas ajouter de route
publique de réinitialisation ni accorder un nouveau rôle admin comme dépannage.
L'accès au tableau de bord Supabase doit lui-même être protégé par MFA.

## Dépendances

Next 16.3.4 utilise nativement sharp 0.35.4, corrigeant l'avis
[GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj).
Aucun override de sharp n'est nécessaire. Serwist 9.5.12 épingle encore
Browserslist 4.28.6 : un override vers `^4.28.9` impose le correctif compatible
à toutes les occurrences. Retirer cet override lorsque Serwist embarquera
une version corrigée et que l'audit le confirmera. nanoid est résolu en 3.3.18.
`npm audit --omit=dev --audit-level=high` est maintenant bloquant dans la CI.

## Validation et limites

Les tests unitaires couvrent les erreurs d'Auth/PostgREST, l'absence de facteur,
le rôle non-admin et les sessions AAL1. Les tests Chrome utilisent uniquement
un stub local avec jetons signés et codes TOTP vérifiés : activation, mauvais
code, persistance du cookie, reprise, API directes, jeton falsifié, facteur
supprimé, actions appelées par un non-admin et origine étrangère.
Le stub n'est pas une certification du service Supabase en production.

Le présent lot ne constitue pas un audit complet des politiques RLS, des
paiements ou de l'infrastructure. La protection des mots de passe compromis,
la CSP complète et les procédures de restauration restent des points distincts
à traiter. Ne pas annoncer une sécurité « 10/10 » sur cette seule correction.

Référence : [MFA TOTP Supabase](https://supabase.com/docs/guides/auth/auth-mfa/totp).
