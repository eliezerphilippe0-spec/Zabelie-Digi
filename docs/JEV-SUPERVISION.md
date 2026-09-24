# Agent de supervision Zabelie + Jev (v1)

Cet agent **observe, évalue et propose**. Il ne corrige pas le code, ne déploie
pas et ne modifie aucune donnée métier. Le connecteur de support `/api/admin/jev`
reste indépendant : lui envoyer un message ne lance pas ce superviseur.

## Fonctionnement

GitHub Actions exécute `scripts/jev-supervisor.mjs` chaque heure à la minute 17
UTC, une fois le workflow fusionné sur `main`. Un lancement manuel est possible
depuis Actions. Une seule exécution à la fois.

⚠️ **L’activation n’est pas une garde de job.** Elle l’a été jusqu’au
2026-09-21, et le résultat mesuré fut : deux runs, deux `skipped`, zéro sonde
tirée depuis la fusion — un `skipped` ne s’affichant pas en rouge, la
supervision paraissait installée et ne surveillait rien. Le job tourne
désormais toujours ; c’est le script qui lit `JEV_SUPERVISION_ENABLED` et, en
son absence, écrit un rapport `inactive` et **sort en échec**. L’opt-in reste
entier : sans activation, aucune sonde n’est tirée et rien n’est facturé.

1. Vérifier l’accueil, la sonde de vie, la disponibilité de la base via sa sonde
   publique, l’empreinte de livraison et le refus d’un appel Jev sans session.
2. Lire l’état de la CI du commit courant de `main` ; aucune vieille CI verte
   ne sert de preuve pour un nouveau commit.
3. Comparer la livraison à `main` ; un décalage peut simplement être un déploiement
   en cours. Il est signalé, pas « réparé ».
4. Envoyer à Jev uniquement les identifiants et états de ces contrôles, jamais
   de messages clients, HTML, journaux, données de paiement ou secrets annexes.
5. Produire une priorité et des recommandations dans le résumé Actions et deux
   fichiers (`report.json`, `report.md`), conservés 14 jours.

Les résultats de Jev sont validés contre une liste fermée. Une confiance faible
ne commande rien. Jev peut relever une alerte, jamais minimiser une alerte
déterministe. Aucune sortie du modèle n’est exécutée comme code ou commande.

## Activation (distincte de Vercel)

Dans **le dépôt GitHub Zabelie-Digi**, Settings → Secrets and variables → Actions :

- **Secret** `TYPESAFE_API_KEY` : une clé TypeSafe valide, idéalement dédiée à ce
  superviseur. Utiliser une clé renouvelée si l’ancienne a été partagée.
- **Variable** `JEV_SUPERVISION_ENABLED` : `true`.

Une variable Vercel ou un fichier local ne configure pas GitHub Actions.
Ne pas mettre la clé dans une variable publique, un fichier suivi ou un ticket.
Le workflow n’a besoin d’aucun jeton Vercel, clé Supabase ou accès aux paiements.
Son jeton GitHub est fourni automatiquement et est en lecture seule.

Puis Actions → **Zabelie - Supervision Jev** → Run workflow → main.
Vérifier le premier rapport et le statut `jev: ok`. Tant que la variable n’est
pas posée, le run est **rouge** avec un rapport `inactive` et la bannière
« SUPERVISION INACTIVE » — c’est le comportement attendu, pas une panne.

Sans clé ou avec une erreur Jev, les sondes fonctionnent encore mais le rapport
est explicitement dégradé et le workflow échoue. Aucun succès silencieux.
Pour recevoir les alertes, vérifier les préférences de notifications GitHub
Actions du compte. Aucun email, WhatsApp ou SMS personnalisé n’est configuré.

## Usage local

⚠️ **La même règle s’applique en local qu’en CI** : pas d’activation, pas de
sonde. C’est volontaire — une règle unique évite le piège d’un comportement qui
diffère entre les deux, et empêche de sonder la production sans l’avoir demandé.

Sans Jev (vérification des sondes uniquement) :

```bash
JEV_SUPERVISION_ENABLED=true node scripts/jev-supervisor.mjs
```

Avec une clé déjà enregistrée dans le fichier local ignoré :

```bash
JEV_SUPERVISION_ENABLED=true node --env-file=.env.local scripts/jev-supervisor.mjs
```

⚠️ **Depuis une session agent, les sondes sont impraticables** : le proxy
sortant refuse `zabelie.com:443` (403 sur CONNECT). Le superviseur rend alors un
faux `incident / P1` dont les échecs sont ceux du proxy. Ne jamais recopier cette
sortie comme un état de production. → `docs/60-audit-supervision-jev-2026-09-21.md` §2.

Les rapports locaux sont dans `agent-reports/`, ignoré par Git.
Codes de sortie : 0 = sondes et Jev opérationnels ; 1 = incident ;
2 = couverture dégradée, **supervision inactive**, état inconnu ou transitoire.
Une CI en attente est « pending », jamais assimilée à un succès.

## Garde-fous et limites

- Mode lecture seule : pas de réparation, merge, remboursement, migration,
  suppression, redémarrage, rotation de clé ou déploiement automatique.
- Seule maintenance automatique : relecture bornée des sondes GET en échec
  (une seconde tentative) et rotation des artefacts via la rétention GitHub.
- Un seul appel Jev maximum par exécution, délai 8 secondes, sans nouvelle
  tentative payante. En fonctionnement horaire : environ 24 appels par jour,
  auxquels s’ajoutent les lancements manuels. Vérifier la facturation TypeSafe.
- Résultats publics limités à des états techniques ; aucune réponse brute du
  fournisseur ou donnée client. Le dépôt étant public, ne pas enrichir ces
  rapports avec des informations internes sensibles.
- Les sondes ne vérifient ni les paiements réels ni la cohérence des soldes,
  ni une restauration de sauvegarde, ni tous les parcours utilisateurs.
- GitHub peut retarder les horaires ; les workflows planifiés d’un dépôt public
  inactif peuvent être désactivés. Ce n’est pas une supervision critique 24/7
  assortie d’un délai d’alerte garanti.
- Arrêt : variable `JEV_SUPERVISION_ENABLED=false` ou désactivation du workflow.
  Une exécution déjà lancée doit être annulée dans Actions si nécessaire.

La prochaine étape, distincte, sera un agent de correction sur branche isolée,
avec tests, revue et autorisation avant toute mise en production.

Références : https://docs.typesafe.ai/introduction/quickstart et
https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule.
