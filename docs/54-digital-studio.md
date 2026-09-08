# Atelier numérique Zabelie

Travail demandé le 2026-09-08 après la comparaison avec Chariow.

Périmètre : fichiers et packs de fichiers d’un même vendeur, formations avec chapitres/leçons et ressources privées, aperçus textuels et FAQ, versions immuables avec licence conservée, bibliothèque et progression, statistiques de commandes et d’accès réellement mesurés. Les commissions, paiements et prestations physiques restent régis par leurs contrats existants.

Une mise à jour repasse en brouillon puis en modération. Le contenu acheté est figé à la création de la commande ; l’accès exige ensuite paid/delivered. Une nouvelle publication ne supprime aucun objet d’une version antérieure. Les mises à jour ne sont ouvertes aux anciens acheteurs que si leur version acquise les incluait explicitement. Les aperçus ne donnent jamais les chemins privés ni les ressources payantes.

Aucune offre fictive publiée, aucun paiement réel déclenché. Aucun envoi d’email réel pendant validation. L’antivirus requiert un service approuvé ; les clés logicielles et activations nécessitent un contrat d’usage et d’intégration à définir, pas une simple étiquette « licence ». Les automatisations marketing et pixels ne seront pas activés sans consentement et configuration des destinataires/fournisseurs.

## Accès et fonctionnement

- Vendeur : `/vendre`, fiche en brouillon, « Atelier numérique ». Téléverser les ressources, choisir fichier/pack/formation, ajouter aperçu, FAQ, chapitres et leçons, puis enregistrer. Les brouillons apparaissent dans la modération existante. Pour une offre déjà publiée, « Préparer une mise à jour » la retire temporairement du catalogue.
- Administration : `/admin#produits`. Examiner le texte complet, les aperçus et les fichiers privés via les liens de revue avant de publier. La publication est atomique et crée la nouvelle version.
- Acheteur : `/mes-achats?vue=numerique`, « Ouvrir mon contenu ». Version achetée, fichiers, programme, progression et versions futures si le contrat d’origine les inclut. Les mises à jour sont signalées dans cet espace, sans campagne email automatique.
- Vendeur : `/tableau-de-bord`, statistiques numériques après les soldes. Commandes commencées, confirmées, en attente, taux confirmé/commencé, montant brut confirmé, achats ayant demandé un lien. Aucun suivi publicitaire ni visiteur fictif.

Limites : 20 fichiers de 50 Mio au maximum par offre, 40 leçons et 8 FAQ. Les packs contiennent les fichiers du même vendeur ; ils ne répartissent pas le prix entre plusieurs vendeurs. Les formations proposent du texte et des ressources téléchargeables ; aucun streaming adaptatif ni examen/certification n’est promis. Une formation requiert au moins un fichier pour respecter le contrat existant de livraison digitale. Les anciennes versions sont immuables ; les objets retirés des brouillons sont conservés. Un futur nettoyage doit vérifier l’absence de références dans les brouillons ET dans tous les instantanés, y compris les commandes en attente.

## Vérifications

Build et TypeScript réussis localement. 35 tests ciblés initiaux, puis 10 contrôles de garde et 5 scénarios Chrome digitaux passés après correction d’un sélecteur. Tests SQL sur PostgreSQL 16 réussis dans la CI : séparation aperçu/contenu payant, droits des rôles, version attachée dès la commande en attente, licence conservée, refus de publication avec ressource manquante, statistiques sans double comptage. Suite complète Linux à vérifier sur la tête finale avant migration/fusion.

Le contrôle local complet sous Windows présente des écarts connus de chemins/CRLF et de dépendances déjà installées ; le résultat de la CI avec `npm ci` est celui retenu pour la fusion. Les nouveaux défauts de garde, de sonde RPC et de message d’erreur détectés par cette suite ont été corrigés.

## Déploiement

Appliquer uniquement `0104_digital_studio.sql` après CI verte, vérifier le journal Supabase et enregistrer son empreinte dans `zabelie_schema_migrations`, puis fusionner la PR. Ne pas rejouer les migrations anciennes, notamment 0056 gelée. Autorisation permanente du porteur du 2026-08-17. Aucune commande, aucun paiement ni publication fictive à créer en production pour valider ces écrans.
