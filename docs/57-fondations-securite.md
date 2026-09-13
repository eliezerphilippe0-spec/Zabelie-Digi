# Fondations de sécurité — 13 septembre 2026

## Protections implémentées

- CSP avec nonce aléatoire par réponse, transmis au rendu Next.js et au script du thème. Les scripts sans nonce, les gestionnaires inline, les objets embarqués et les iframes sont refusés. Les styles inline React restent permis. Les pages étaient déjà dynamiques (langue et session) ; aucune stratégie de cache commercial n'est ajoutée.
- Rafraîchissement Supabase propagé au rendu courant et au navigateur. Rôle administrateur et MFA toujours vérifiés côté serveur.
- Limitation de débit : résultat explicitement vrai requis ; panne, réponse ambiguë ou délai de trois secondes refusent l'opération. Les appelants rendent actuellement 429, même si la cause est une indisponibilité. Les journaux techniques nomment cette dernière sans identifiant ni secret.
- Fichiers digitaux : publication, checkout, aperçu administrateur et téléchargement exigent une attestation ClamAV privée et récente, liée à l'identifiant ET à la version Storage de l'objet. Les attestations expirent après sept jours. Une version remplacée nécessite une nouvelle analyse. Les anciennes versions achetées sont également inventoriées par le worker.
- Vérification après déploiement : CSP réellement servie, renouvellement du nonce, nonce dans le HTML et refus des accès sensibles anonymes. La vérification échoue si une protection disparaît.

## Antivirus privé : activation nécessaire

Le worker est prêt dans scripts/scanner-fichiers.ts. Aucun service antivirus n'a été déployé et aucun fichier réel n'a été analysé pendant cette livraison. Tant que le worker n'a pas produit d'attestation, les opérations digitales protégées répondent file_security_pending. Les opérations physiques ne passent pas par cette analyse.

Les attestations sont stockées sous _security/scans/ dans le bucket privé product-files. Elles ne sont ni publiées ni envoyées au navigateur. La clé service-role peut les écrire ; les vendeurs ne reçoivent que des jetons d'upload pour un chemin liv-UUID individuel. Ne jamais ajouter une policy donnant aux utilisateurs l'accès à _security/ ni un droit d'écrasement des objets livrés. Cette protection est applicative : une personne possédant la clé service-role demeure privilégiée et doit être strictement contrôlée.

Sur le serveur privé retenu :

1. Installer Node.js 22, les dépendances du dépôt et ClamAV avec freshclam. Restreindre l'accès administrateur au serveur. Injecter NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY depuis un gestionnaire de secrets ; ne jamais les commiter, les mettre dans une URL ou un journal.
2. Mettre à jour les signatures avec freshclam. Le worker refuse les signatures vieilles de plus de 72 heures. Aucun envoi vers VirusTotal ou un autre service public.
3. Lancer node --import tsx scripts/scanner-fichiers.ts : inventaire en lecture seule, aucune analyse ni attestation.
4. Vérifier le fonctionnement du moteur avec un fichier inoffensif et le fichier de test antivirus standard EICAR sur le serveur isolé, jamais comme produit public. Confirmer refus des archives chiffrées et des limites d'analyse dépassées.
5. Lancer node --import tsx scripts/scanner-fichiers.ts --apply : analyse et écriture des seules attestations. Le projet accepté est exclusivement ddditxykopuxxqzgkqwy. Les fichiers vendeurs restent dans le stockage privé ; ils ne sont jamais exécutés.
6. Programmer l'exécution au moins quotidienne sur ce serveur, sans chevauchement, avec alerte sur code de sortie non nul ET absence d'exécution réussie. Vérifier quotidiennement les mises à jour freshclam. Une détection demande une revue humaine ; le worker ne supprime ni produit ni achat.
7. Tester une publication puis un achat de test et son téléchargement. Faire tester un fichier sans preuve : publication et téléchargement doivent être refusés. Ne pas remplacer ce contrôle par une attestation écrite manuellement.

Limites : la réussite des tests simulés n'est pas une preuve d'analyse ClamAV en production. Le service-role est une clé puissante ; l'hébergement doit être choisi et protégé avant de la lui confier. Aucun hébergement ou abonnement n'a été acheté.

## Compte administrateur et mots de passe

Ouvrir https://zabelie.com/securite après connexion, scanner le QR avec l'application d'authentification personnelle puis saisir le code. Le QR, le secret et les codes ne doivent jamais être envoyés dans une conversation. Tester ensuite connexion puis accès à /admin. La configuration exige l'action du titulaire ; elle n'est pas simulée par le code.

La protection des mots de passe compromis reste à activer dans Supabase Auth. Supabase la réserve au forfait Pro et supérieur : vérifier le forfait et obtenir l'accord de dépense avant toute montée de forfait. Aucune modification de forfait effectuée.

## Paiements et supervision

La CI rejoue les tests SQL sur PostgreSQL : montants, idempotence, confirmation et cohérence du registre vendeur. Ces tests utilisent des données de test et ne contactent pas MonCash pour facturer.

L'ordre réel reste celui de docs/56-passage-moncash-production.md : paiement sandbox avec payeur fonctionnel, preuve serveur-à-serveur, notification répétée sans double crédit, interruption puis réconciliation, remboursement confirmé et calcul du net vendeur ; ensuite autorisation Digicel et identifiants de production. Aucun montant réel, remboursement ou mode marchand n'est modifié ici.

Après fusion, .github/workflows/post-deploy.yml vérifie la disponibilité et les protections du déploiement attendu. Les notifications GitHub doivent atteindre le responsable d'exploitation. Ce contrôle après livraison ne constitue pas une supervision permanente : un service de surveillance externe doit encore alerter sur indisponibilité, échecs de paiement et cron silencieux.

## Sauvegarde et restauration : preuve encore requise

Ne pas confondre une réexécution des migrations avec une restauration. Avant ouverture large :

1. Choisir une destination indépendante chiffrée, sa rétention et le responsable. Fixer puis mesurer les objectifs de perte maximale de données et de délai de récupération.
2. Sauvegarder la base via les outils Supabase/PostgreSQL, et sauvegarder séparément les objets de tous les buckets. Une sauvegarde de la base seule ne contient pas les fichiers Storage.
3. Conserver un inventaire horodaté des tables, nombres de lignes, fichiers et empreintes SHA-256. Vérifier les erreurs et la complétude, pas seulement la présence d'une archive.
4. Restaurer exclusivement vers un projet isolé choisi pour l'essai. Vérifier les politiques RLS, les privilèges, les comptes, le registre vendeur, les versions digitales et chaque empreinte des objets restaurés.
5. Tester connexion, achat simulé et téléchargement sur cette copie, avec prestataires en sandbox. Ne jamais faire pointer une copie de test vers les rails de production.
6. Archiver un rapport daté : sauvegarde source, cible isolée, durées, comptes et empreintes comparés, erreurs, résultat des parcours. Ne déclarer la restauration validée qu'après cette exécution.

Cette preuve n'existe pas encore : destination, cible isolée et accès opérationnels restent à fournir. Un audit indépendant fondé sur OWASP ASVS complète ces vérifications ; cette livraison n'est pas une certification de sécurité.

## Références

- https://nextjs.org/docs/app/guides/content-security-policy
- https://docs.clamav.net/manual/Usage/Scanning.html
- https://supabase.com/docs/guides/auth/password-security
- https://supabase.com/docs/guides/platform/backups
- https://owasp.org/www-project-application-security-verification-standard/
