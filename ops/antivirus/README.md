# Installer le scanner privé Zabelie

Ce paquet prépare l'exploitation du worker existant. Il ne crée pas de serveur et n'active aucun accès en production. Aucun fichier marchand n'a été analysé lors de sa préparation.

## Prérequis à vérifier sur le serveur retenu

- Linux avec systemd 249 ou supérieur, Node.js 22 à `/usr/bin/node`, ClamAV et son service freshclam. Le serveur doit pouvoir joindre Supabase par HTTPS et télécharger les signatures officielles.
- Prévoir 8 Gio de mémoire pour garder une marge système : le moteur ClamAV recommande à lui seul 3 à 4 Gio avec les signatures usuelles. Le groupe du scanner est limité à 4 Gio ; une limite dépassée fait échouer le service et sa supervision.
- Administration restreinte et mises à jour de sécurité. Aucun port entrant public n'est nécessaire au worker. Ne pas placer le dépôt dans un dossier personnel : le service ne peut pas lire les répertoires personnels.
- Le projet autorisé reste exclusivement `ddditxykopuxxqzgkqwy`. La clé de service est privilégiée ; son installation sur cet hôte demande le choix explicite du serveur et l'accès autorisé du titulaire.

## Préparer sans lancer d'analyse

1. Installer Node.js, ClamAV et freshclam avec les outils de l'hôte. Vérifier `/usr/bin/node --version` (22.x), `clamscan --version` et la mise à jour effective des signatures. Les signatures de plus de 72 heures sont refusées par le worker. Le scanner n'a pas le droit de modifier les signatures : freshclam fonctionne séparément.
2. Placer une copie du commit fusionné et vérifié dans `/opt/zabelie-scanner`, détenue par root et lisible par le compte du service. Installer les dépendances du lockfile avec `npm ci --include=dev` dans cette copie : `tsx` est nécessaire au worker. Aucun serveur web ni build Next.js n'est nécessaire sur cet hôte.
3. Créer le compte sans connexion et le répertoire réservé :

```sh
if ! id zabelie-scanner >/dev/null 2>&1; then
  sudo useradd --system --user-group --home-dir /nonexistent --shell /usr/sbin/nologin zabelie-scanner
fi
sudo install -d -m 0700 /etc/zabelie-scanner
if ! sudo test -e /etc/zabelie-scanner/scanner.env; then
  sudo install -m 0600 /dev/null /etc/zabelie-scanner/scanner.env
fi
sudoedit /etc/zabelie-scanner/scanner.env
```

Si le compte ou le fichier existe déjà, contrôler son propriétaire et son contenu sans l'écraser. Dans le fichier privé, renseigner uniquement `NEXT_PUBLIC_SUPABASE_URL` (l'URL API du projet autorisé) et `SUPABASE_SERVICE_ROLE_KEY` (la clé fournie au titulaire). Ne jamais copier ce fichier dans le dépôt, un ticket ou un journal. Aucun secret n'est inclus dans les unités. systemd transmet le fichier via LoadCredential ; Node le lit au démarrage. Les valeurs restent accessibles au processus privilégié du scanner et à l'administrateur de l'hôte.

4. Installer et vérifier les unités, sans activer le timer :

```sh
cd /opt/zabelie-scanner
sudo install -m 0644 ops/antivirus/zabelie-scanner.service ops/antivirus/zabelie-scanner-inventory.service ops/antivirus/zabelie-scanner.timer /etc/systemd/system/
sudo systemd-analyze verify --man=no /etc/systemd/system/zabelie-scanner.service /etc/systemd/system/zabelie-scanner-inventory.service /etc/systemd/system/zabelie-scanner.timer
sudo systemctl daemon-reload
sudo systemctl start zabelie-scanner-inventory.service
sudo journalctl -u zabelie-scanner-inventory.service --since today --no-pager
```

L'inventaire ne télécharge ni n'analyse les fichiers et n'écrit aucune attestation. Il retourne un nombre de fichiers. Lancer ensuite le test local du moteur déjà présent dans le dépôt : `node --import tsx --test tests/clamav.integration.ts`. Il utilise une signature synthétique et des octets inoffensifs, sans consulter Supabase. Compléter sur cet hôte les essais EICAR isolé et archives chiffrées de docs/57 avant activation.

## Activer après validation de l'hôte et des accès

Ces commandes lancent l'analyse de fichiers privés et l'écriture d'attestations : les exécuter seulement dans le cadre de l'activation autorisée.

```sh
sudo systemctl start zabelie-scanner.service
sudo journalctl -u zabelie-scanner.service --since today --no-pager
sudo systemctl enable --now zabelie-scanner.timer
sudo /usr/bin/node /opt/zabelie-scanner/scripts/verifier-antivirus.mjs
```

Le timer demande une analyse toutes les 30 minutes, avec au plus une minute d'étalement aléatoire et une minute de précision. Une instance déjà en cours n'est pas doublée. Chaque passage est limité à 45 minutes ; adapter le dimensionnement si le volume l'exige. Un fichier nouvellement chargé peut donc rester en attente jusqu'au prochain passage terminé : l'interface ne doit pas promettre une analyse instantanée.

Un succès complet crée ou actualise `/var/lib/zabelie-scanner/last-success`. Un échec, une détection, une interruption ou un dépassement du délai ne rafraîchit pas ce témoin. Le worker garde les détails commerciaux et les secrets hors des journaux ; il ne supprime aucun produit ou achat.

## Surveiller réellement

Brancher le contrôle ci-dessus sur le système de supervision retenu, toutes les cinq minutes, avec notification au responsable et alerte en cas d'absence de réponse. Aucun connecteur de notification n'est configuré par ce paquet.

Le contrôle est en lecture seule, sans accès Supabase, et doit être exécuté par root ou un opérateur autorisé à lire l'état privé. Code 0 : unités présentes, timer actif et activé au démarrage, pas d'échec connu, dernier succès de moins de deux heures. Code 1 : contrôle inaccessible, unité manquante, planification arrêtée, échec ou preuve absente/périmée. Une date future est aussi refusée. Le JSON ne contient que le verdict et la date du dernier succès.

Ce témoin ne prouve pas que chaque fichier est sûr : un inventaire vide peut réussir. Chaque publication et chaque téléchargement continuent d'exiger leur propre attestation valide liée à la version du fichier. Une réussite système avec zéro fichier n'autorise pas à annoncer une recette digitale complète.

## Arrêt et mises à jour

```sh
sudo systemctl disable --now zabelie-scanner.timer
sudo systemctl stop zabelie-scanner.service
```

Conserver les attestations et les achats. Ne pas purger les preuves pour dépanner. Arrêter le timer et attendre/arrêter le service avant de remplacer la copie par un nouveau commit validé et ses dépendances ; refaire inventaire, contrôle moteur et premier scan avant de réactiver la planification. Le contrôle de santé doit signaler l'arrêt pendant cette opération.

## Preuves et limites

La CI vérifie les unités sur un hôte Linux jetable avec un worker fictif : utilisateur non root, lecture du secret fictif transmis par credential, refus d'écriture dans le code, inventaire sans témoin, succès, échec sans faux succès, absence de doublon, témoin trop ancien et timer arrêté. Elle ne lance jamais ce montage contre Supabase. Le moteur réel est testé séparément avec une signature synthétique. L'installation finale, freshclam, les fichiers réels et les alertes distantes restent à vérifier sur le serveur choisi.

Références officielles : [ClamAV et mémoire](https://docs.clamav.net/Introduction.html), [credentials systemd](https://github.com/systemd/systemd/blob/main/docs/CREDENTIALS.md), [timers systemd](https://github.com/systemd/systemd/blob/main/man/systemd.timer.xml), [Node.js env-file](https://nodejs.org/api/cli.html#--env-filefile).
