# Opérations Zabelie — marché haïtien

Ce lot dépend des corrections backend de la PR 267. Appliquer 0112 puis 0113 avant de déployer ce code. Ne pas rejouer les anciennes migrations sur la production ; 0056 reste gelée conformément à la décision existante.

## Parcours livré

- **Acheteur** : Mes achats → ouvrir le dossier de la commande. Le vendeur concerné et l’administration voient le même historique. Une nouvelle réponse rouvre un dossier clos.
- **Vendeur** : Mes ventes → dossier. L’accès reste limité aux commandes de ses propres produits, même si la fiche a été retirée.
- **Administration avec MFA** : /admin/operations. File paginée des paiements anciens, incohérences paiement/commande, remises contestées, dossiers ouverts, remboursements à justifier et versements en attente.
- Les délais affichés sont des cibles internes, pas une promesse de remboursement. Les messages sont immuables et les décisions administratives sont journalisées.
- Le signalement de non-réception par l’acheteur appelle le mécanisme de contestation existant. Il ne crée ni remboursement automatique ni nouvelle libération d’argent.
- La référence de remboursement atteste une vérification humaine du justificatif. Elle n’exécute pas de virement et ne constitue pas une confirmation serveur de l’opérateur.

## Adaptation à Haïti

Les textes publics existent en créole, français, anglais et espagnol. Le choix français par défaut déjà décidé reste intact. Les prix sont exprimés en HTG ; les dates opérationnelles utilisent America/Port-au-Prince.

MonCash et la passerelle Kobara restent soumis à leur configuration existante. NatCash n’est pas activé par cette PR. Le rail carte reste soumis aux conditions et clés existantes. Aucun SMS payant ni nouveau service tiers n’est ajouté.

Les frais de remise non inclus sont signalés avant achat. Les engagements de zone, point de retrait et disponibilité existants sont conservés. Le dossier accepte une description et une référence opérateur ; ne pas y mettre PIN, mots de passe, numéros de carte ou documents KYC.

Les brouillons de support restent dans l’onglet, sous une clé propre au compte et à la commande, pour 30 minutes. Le motif et l’identifiant de reprise sont préservés. Une coupure ne déclenche pas d’envoi automatique. Cette conservation dépend du stockage disponible dans le navigateur et n’est pas une sauvegarde durable.

## Paiements et file de travail

La réconciliation interroge les opérateurs depuis le serveur. Stripe vérifie l’identifiant de session, la commande, le mode, la devise et le montant ; la RPC financière revérifie le montant attendu et l’idempotence. Seule une expiration formelle permet d’annuler une session Stripe impayée. Une erreur réseau conserve la commande en attente.

La sélection tourne sur les paiements les moins récemment examinés. Les seuils internes vivent dans zabelie_operations_config : 30 minutes pour l’alerte de paiement, 20 paiements par rail et passage, cible de suivi de 48 heures. Ils ne modifient ni tarifs ni plafonds financiers. Le cron quotidien existant reste quotidien ; le bouton administrateur permet une vérification supplémentaire.

Une file vide après une erreur de lecture n’est jamais présentée comme une absence d’incidents. Les métriques excluent les commandes gratuites, sandbox, comptes de test et achats du vendeur à lui-même. Les achats confirmés exigent à la fois une commande payée/livrée et un paiement confirmé. Les zones sont celles déclarées par les vendeurs, pas une mesure de livraison effective. Les recherches sans résultat restent accessibles depuis le panneau existant.

## Recette financière réelle, à consigner avant ouverture commerciale

Les tests automatiques n’attestent pas d’un transfert réel chez MonCash, NatCash, Stripe ou une banque. Une recette réelle demande un produit, un acheteur et un vendeur contrôlés, un montant explicitement approuvé et les accès opérateur.

1. Relever le montant HTG et la référence de commande ; conserver uniquement la référence opérateur, jamais les identifiants secrets.
2. Vérifier achat normal puis coupure du retour navigateur après paiement : l’état doit être récupéré depuis l’opérateur, sans second débit.
3. Rejouer le webhook/la réconciliation : aucun double crédit vendeur ni double mouvement de stock.
4. Confirmer la remise puis vérifier le versement vendeur auprès de l’opérateur et dans la comptabilité.
5. Tester un remboursement décidé par un administrateur : distinguer annulation comptable, transfert effectif et référence enregistrée.
6. Archiver date, rail, environnement, commande, résultat et vérificateur dans un dossier privé hors Git. Ne pas appeler une commande sandbox une recette production.

## Sauvegarde et restauration

Un dump PostgreSQL ne contient pas les octets de Supabase Storage. L’export Storage ne remplace pas la base, les rôles, les secrets ou la configuration des services.

### Export Storage

Préparer un répertoire neuf situé **hors dépôt**, sur un volume privé chiffré. Injecter SOURCE_SUPABASE_URL et SOURCE_SERVICE_ROLE_KEY par le gestionnaire de secrets. Ne pas coller ces valeurs dans une commande conservée dans l’historique.

    node scripts/storage-recovery.mjs export /volume-prive/sauvegarde-storage-neuve
    node scripts/storage-recovery.mjs verify /volume-prive/sauvegarde-storage-neuve

L’export parcourt tous les buckets, y compris privés, et leurs dossiers paginés. Les fichiers locaux portent un identifiant opaque ; le manifeste contient les chemins originaux et doit donc rester privé. Chaque fichier est vérifié par SHA-256. Un manifeste final n’apparaît qu’après un export complet. Limites : 100 000 objets et 10 GiB par export. Une erreur laisse un export incomplet qui ne doit pas être utilisé.

Planifier une fenêtre cohérente avec les écritures applicatives et le dump de base. La pagination Storage n’est pas un instantané transactionnel : un export pendant des créations/suppressions concurrentes ne prouve pas l’exhaustivité. Préserver également les politiques, rôles et paramètres Supabase avec la procédure d’infrastructure.

### Répétition isolée

Créer une base locale vide dont le nom commence par zabelie_restore_. Préparer les extensions et rôles compatibles avec le dump Supabase. Fournir RESTORE_DATABASE_URL et BACKUP_DUMP par l’environnement, puis :

    bash scripts/restore-rehearsal.sh

La commande refuse une cible distante ou non vide et n’effectue ni DROP ni nettoyage automatique. Utiliser les outils PostgreSQL compatibles avec la version du dump. Un dump d’une autre version du schéma échoue au contrôle des objets requis et demande une procédure de migration revue.

Démarrer ensuite une instance Supabase locale isolée, sans secrets de paiement/email de production. Injecter TARGET_SUPABASE_URL et TARGET_SERVICE_ROLE_KEY :

    node scripts/storage-recovery.mjs restore-local /volume-prive/sauvegarde-storage-neuve

La restauration refuse les buckets déjà présents, ne remplace pas d’objets et relit chaque fichier restauré pour comparer son empreinte. Une interruption impose de repartir sur une nouvelle instance vide. Vérifier ensuite connexion, commande historique, fichier privé acheté, droits d’un autre compte et cohérence des portefeuilles. Mesurer la durée réelle et la date de la sauvegarde restaurée.

La CI répète dump → restauration PostgreSQL avec **données fictives** : commandes, messages, justificatif, permissions RPC et isolation des comptes. Les tests Storage exercent export, corruption, restauration et relecture avec un adaptateur simulé. Ils ne prouvent pas la récupérabilité d’une sauvegarde de production.

## Antivirus et exploitation

Le contrôle ClamAV réel et la vérification du service Linux sont déjà intégrés à la CI. Sur l’hôte du scanner, utiliser scripts/verifier-antivirus.mjs suivant son aide et le guide d’exploitation existant. Une CI verte ne signifie pas que le scanner tourne en production : conserver la preuve du service actif, des signatures fraîches, du refus d’un fichier de test et de la reprise après arrêt.

Avant mise en ligne : vérifier la migration avec la sonde d’objets requis et le rapport de cohérence existants ; vérifier le cron, la session MFA, l’envoi des avis déjà configurés et l’absence de régression des achats. Refaire une restauration réelle isolée avant de déclarer la reprise opérationnelle.

## Limites explicites

Les messages n’envoient pas de nouvelle notification automatique : l’équipe doit consulter sa file. Les pièces jointes sensibles restent hors de ce dossier textuel. Les reçus de remboursement sont humains, pas rapprochés automatiquement avec l’opérateur. Les anciennes commandes sans référence de retour remontent à examiner ; elles ne sont pas présumées impayées. Les seuils et la cadence de traitement doivent être adaptés au volume réel après mesure.
